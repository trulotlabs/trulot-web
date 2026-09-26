"""Test the sealed parcel-only importer in a disposable local PostGIS cluster.

Usage: python3 test-parcel-only.py BOUNDARY PARCEL_MANIFEST NEW_OUTPUT_ROOT
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts/parcel-v2-postgis"))
from local import ENV, connection, sql  # noqa: E402

SPEC = importlib.util.spec_from_file_location("sealed_parcel_import", HERE / "import.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(IMPORTER)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("boundary")
    parser.add_argument("manifest")
    parser.add_argument("output_root")
    args = parser.parse_args()

    boundary = pathlib.Path(args.boundary).resolve()
    manifest = pathlib.Path(args.manifest).resolve()
    output_root = pathlib.Path(args.output_root).resolve()
    output_root.mkdir(exist_ok=False)
    psql = connection(boundary)
    checks = 0

    def test(name: str, condition: bool) -> None:
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print("PASS", name, flush=True)

    production_args = SimpleNamespace(
        boundary=None,
        mode="parcel-only",
        authorize_production_load=False,
        database_url_env="TRULOT_TEST_DATABASE_URL",
    )
    fake_url = "postgresql://postgres.qockltdzvjxdlwrpgtsd@aws-0-us-west-1.pooler.supabase.com/postgres"
    with patch.dict(os.environ, {"TRULOT_TEST_DATABASE_URL": fake_url}, clear=False):
        with patch.object(IMPORTER.subprocess, "check_output", side_effect=AssertionError("no connection expected")):
            try:
                IMPORTER.target_from_args(production_args)
            except ValueError as error:
                test("production refuses without the CLI authorization flag", "both the CLI authorization flag" in str(error))
            else:
                raise AssertionError("missing CLI authorization was accepted")

    production_args.authorize_production_load = True
    with patch.dict(os.environ, {"TRULOT_TEST_DATABASE_URL": fake_url}, clear=False):
        with patch.object(IMPORTER.subprocess, "check_output", side_effect=AssertionError("no connection expected")):
            try:
                IMPORTER.target_from_args(production_args)
            except ValueError as error:
                test("production refuses without its parcel-specific environment gate", "TRULOT_V2_PARCEL_LOAD_AUTHORIZED=1" in str(error))
            else:
                raise AssertionError("missing environment authorization was accepted")

    IMPORTER.validate_production_dsn(
        "postgresql://postgres.qockltdzvjxdlwrpgtsd@aws-0-us-west-1.pooler.supabase.com/postgres",
        IMPORTER.PARCEL_ONLY_EXPECTED,
    )
    test("sealed production identity accepts the expected project and database form", True)
    for label, dsn in (
        ("project", "postgresql://postgres.other@aws-0-us-west-1.pooler.supabase.com/postgres"),
        ("database", "postgresql://postgres.qockltdzvjxdlwrpgtsd@aws-0-us-west-1.pooler.supabase.com/other"),
    ):
        try:
            IMPORTER.validate_production_dsn(dsn, IMPORTER.PARCEL_ONLY_EXPECTED)
        except ValueError:
            test(f"sealed production identity refuses the wrong {label}", True)
        else:
            raise AssertionError(f"wrong production {label} was accepted")

    supplied = json.loads(manifest.read_text())
    extra = output_root / "extra-artifact-manifest.json"
    extra.write_text(json.dumps({
        **supplied,
        "artifacts": {**supplied["artifacts"], "zoningRaw": supplied["artifacts"]["parcelRaw"]},
    }))
    try:
        IMPORTER.load_manifest(extra, IMPORTER.PARCEL_ONLY_EXPECTED)
    except ValueError as error:
        test("parcel-only manifest refuses zoning artifacts", "inventory differs" in str(error))
    else:
        raise AssertionError("parcel-only mode accepted a zoning artifact")

    tampered_acquisition = output_root / "tampered-acquisition.json"
    tampered_acquisition.write_bytes(pathlib.Path(supplied["artifacts"]["parcelAcquisition"]).read_bytes() + b"\n")
    tampered = output_root / "tampered-manifest.json"
    tampered.write_text(json.dumps({
        **supplied,
        "artifacts": {**supplied["artifacts"], "parcelAcquisition": str(tampered_acquisition)},
    }))
    try:
        IMPORTER.load_manifest(tampered, IMPORTER.PARCEL_ONLY_EXPECTED)
    except ValueError as error:
        test("parcel-only manifest refuses an artifact hash mismatch", "SHA-256 mismatch" in str(error))
    else:
        raise AssertionError("tampered parcel acquisition was accepted")

    paths = {key: pathlib.Path(value) for key, value in supplied["artifacts"].items()}
    bad_acquisition = json.loads(paths["parcelAcquisition"].read_text())
    bad_acquisition["acquisitionId"] = "unexpected-acquisition"
    wrong_acquisition_path = output_root / "wrong-acquisition.json"
    wrong_acquisition_path.write_text(json.dumps(bad_acquisition))
    try:
        IMPORTER.verify_parcel_receipt({**paths, "parcelAcquisition": wrong_acquisition_path}, IMPORTER.PARCEL_ONLY_EXPECTED)
    except ValueError as error:
        test("parcel receipt refuses the wrong acquisition identity", "identity changed" in str(error))
    else:
        raise AssertionError("wrong acquisition identity was accepted")

    bad_report = json.loads(paths["parcelReport"].read_text())
    bad_report["counts"]["accepted"] -= 1
    wrong_report_path = output_root / "wrong-report.json"
    wrong_report_path.write_text(json.dumps(bad_report))
    try:
        IMPORTER.verify_parcel_receipt({**paths, "parcelReport": wrong_report_path}, IMPORTER.PARCEL_ONLY_EXPECTED)
    except ValueError as error:
        test("parcel receipt refuses a count-contract mismatch", "counts changed" in str(error))
    else:
        raise AssertionError("wrong parcel counts were accepted")

    class ExistingProductionTarget:
        label = "separately-authorized-production"

        def __init__(self) -> None:
            self.runs: list[str] = []

        def sql(self, statement: str) -> str:
            if "unnest" in statement:
                return str(len(IMPORTER.FOUNDATION_RELATIONS))
            if "information_schema.columns" in statement:
                return "1"
            if "pg_constraint" in statement:
                return "4"
            raise AssertionError(statement)

        def run(self, statement: str, _log: pathlib.Path) -> None:
            self.runs.append(statement)

    production_target = ExistingProductionTarget()
    IMPORTER.apply_migrations(production_target, output_root / "unused.log")
    test("production migration verification never reruns foundation DDL", production_target.runs == [])

    class MissingProductionTarget(ExistingProductionTarget):
        def sql(self, statement: str) -> str:
            if "unnest" in statement:
                return "0"
            raise AssertionError(statement)

    missing_target = MissingProductionTarget()
    try:
        IMPORTER.apply_migrations(missing_target, output_root / "unused-missing.log")
    except ValueError as error:
        test("production refuses an absent foundation without executing DDL", "foundation schema" in str(error) and missing_target.runs == [])
    else:
        raise AssertionError("missing production foundation was bootstrapped")

    sql(psql, "create role anon; create role authenticated; create role service_role")
    foundation = ROOT / "supabase/migrations/20260925090000_parcel_serving_v2_shadow_foundation.sql"
    subprocess.run(psql, input=foundation.read_text(), text=True, check=True, env=ENV, stdout=subprocess.DEVNULL)
    test("upgrade rehearsal begins at the original V2 foundation", sql(psql, "select count(*) from information_schema.columns where table_schema='trulot_v2' and table_name='import_run' and column_name='run_kind'") == "0")

    load_output = output_root / "load"
    command = [
        sys.executable,
        str(HERE / "import.py"),
        "--mode", "parcel-only",
        "--boundary", str(boundary),
        "--manifest", str(manifest),
        "--output", str(load_output),
    ]
    subprocess.run(command, check=True, env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"}, stdout=subprocess.DEVNULL)
    receipt = json.loads((load_output / "receipt.json").read_text())
    expected = IMPORTER.PARCEL_ONLY_EXPECTED
    test("upgrade applies only staging DDL", "CREATE SCHEMA" not in (load_output / "psql.log").read_text())
    test("parcel-only load records the sealed terminal run state", receipt["decision"] == "PARCEL_ONLY_V2_IMPORT_PASS" and receipt["timestamps"]["status"] == "VALIDATED" and receipt["timestamps"]["runKind"] == "PARCEL_ONLY")
    test("parcel-only load reconciles exact countywide accounting", receipt["counts"]["parcelSource"] == 1089758 and receipt["counts"]["parcelAccepted"] == 1088430 and receipt["counts"]["parcelQuarantine"] == 1328)
    test("parcel-only load reconciles exact City count and APN cardinality", receipt["counts"]["cityParcels"] == 393733 and receipt["counts"]["cityDistinctApns"] == 393733)
    test("parcel-only load reconciles every sealed fingerprint", receipt["fingerprints"] == expected["fingerprints"])
    test("parcel-only mode writes no zoning, mapping or selection rows", receipt["counts"]["zoningRows"] == 0 and receipt["counts"]["mappingRows"] == 0 and receipt["counts"]["selectedSnapshots"] == 0)
    test("unselected parcel rows remain absent from both serving views", receipt["servedRows"] == 0 and sql(psql, "select (select count(*) from trulot_v2.parcel_serving_v2) + (select count(*) from trulot_v2.parcel_intelligence_serving_v2)") == "0")
    test("parcel-only acquisition identity is exact", receipt["acquisitionIds"] == {"parcel": expected["parcelAcquisitionId"], "zoning": None})

    wrong_fingerprint = expected["fingerprints"]["cityApnSet"]
    expected["fingerprints"]["cityApnSet"] = "0" * 64
    try:
        IMPORTER.validate_parcel_only_candidate(IMPORTER.Target(psql, "isolated-local-rehearsal"), receipt["importRunId"])
    except ValueError as error:
        test("candidate validation refuses a fingerprint-contract mismatch", "fingerprint reconciliation failed" in str(error))
    else:
        raise AssertionError("wrong fingerprint contract was accepted")
    finally:
        expected["fingerprints"]["cityApnSet"] = wrong_fingerprint

    validate_output = output_root / "validate"
    subprocess.run(command[:-1] + [str(validate_output), "--validate-only"], check=True, env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"}, stdout=subprocess.DEVNULL)
    validated = json.loads((validate_output / "receipt.json").read_text())
    test("explicit candidate validation works without selection", validated["operation"] == "validate-only" and validated["counts"] == receipt["counts"] and validated["fingerprints"] == receipt["fingerprints"] and validated["selectedSnapshotRows"] == 0)

    replay = subprocess.run(command[:-1] + [str(output_root / "replay")], env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"}, text=True, capture_output=True)
    test("a second load refuses deterministically", replay.returncode != 0 and "not empty" in (replay.stdout + replay.stderr))
    test("replay refusal leaves the exact parcel population unchanged", sql(psql, "select concat((select count(*) from trulot_v2.parcel_acquisition),'|',(select count(*) from trulot_v2.parcel_base_sangis_v2),'|',(select count(*) from trulot_v2.parcel_quarantine),'|',(select count(*) from trulot_v2.import_run))") == "1|1088430|1328|1")

    sql(psql, """
      do $$ begin
        begin
          insert into trulot_v2.selected_snapshot(singleton,parcel_acquisition_id,zoning_acquisition_id,import_run_id)
          select true,parcel_acquisition_id,'missing-zoning',import_run_id from trulot_v2.import_run where run_kind='PARCEL_ONLY';
          raise exception 'parcel-only run was selectable';
        exception when foreign_key_violation then null; end;
        begin
          update trulot_v2.import_run set run_kind='INTEGRATED' where run_kind='PARCEL_ONLY';
          raise exception 'integrated run accepted null zoning identity';
        exception when check_violation then null; end;
      end $$;
    """)
    test("schema prevents parcel-only selection and invalid integrated state", True)
    test("all ten private V2 tables retain RLS", sql(psql, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trulot_v2' and c.relkind='r' and c.relrowsecurity") == "10")
    test("PUBLIC, anon and authenticated receive no V2 table grants", sql(psql, "select count(*) from information_schema.role_table_grants where table_schema='trulot_v2' and grantee in ('PUBLIC','anon','authenticated')") == "0")
    test("service_role remains read-only", sql(psql, "select count(*) from information_schema.role_table_grants where table_schema='trulot_v2' and grantee='service_role' and privilege_type<>'SELECT'") == "0")

    print(f"{checks} parcel-only production importer checks passed.")


if __name__ == "__main__":
    main()
