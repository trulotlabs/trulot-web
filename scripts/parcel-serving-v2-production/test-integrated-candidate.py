"""Rehearse the unselected Base Zoning V2 candidate path in isolated PostGIS.

Usage: python3 test-integrated-candidate.py BOUNDARY PARCEL_MANIFEST ZONING_MANIFEST NEW_OUTPUT_ROOT
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

SPEC = importlib.util.spec_from_file_location("integrated_candidate_importer", HERE / "import.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(IMPORTER)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("boundary")
    parser.add_argument("parcel_manifest")
    parser.add_argument("zoning_manifest")
    parser.add_argument("output_root")
    args = parser.parse_args()

    boundary = pathlib.Path(args.boundary).resolve()
    parcel_manifest = pathlib.Path(args.parcel_manifest).resolve()
    zoning_manifest = pathlib.Path(args.zoning_manifest).resolve()
    output_root = pathlib.Path(args.output_root).resolve()
    output_root.mkdir(exist_ok=False)
    psql = connection(boundary)
    target = IMPORTER.Target(psql, "isolated-local-rehearsal")
    expected = IMPORTER.CANDIDATE_EXPECTED
    checks = 0

    def test(name: str, condition: bool) -> None:
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print("PASS", name, flush=True)

    production_args = SimpleNamespace(
        boundary=None,
        mode="integrated-candidate",
        authorize_production_load=False,
        database_url_env="TRULOT_TEST_DATABASE_URL",
    )
    fake_url = "postgresql://postgres.qockltdzvjxdlwrpgtsd@aws-0-us-west-1.pooler.supabase.com/postgres"
    with patch.dict(os.environ, {"TRULOT_TEST_DATABASE_URL": fake_url}, clear=False):
        try:
            IMPORTER.target_from_args(production_args)
        except ValueError as error:
            test("candidate production target refuses without CLI authorization", "both the CLI authorization flag" in str(error))
        else:
            raise AssertionError("candidate production target accepted missing CLI authorization")
    production_args.authorize_production_load = True
    with patch.dict(os.environ, {"TRULOT_TEST_DATABASE_URL": fake_url}, clear=False):
        try:
            IMPORTER.target_from_args(production_args)
        except ValueError as error:
            test("candidate production target requires its distinct environment gate", "TRULOT_V2_ZONING_CANDIDATE_LOAD_AUTHORIZED=1" in str(error))
        else:
            raise AssertionError("candidate production target accepted missing environment authorization")

    supplied = json.loads(zoning_manifest.read_text())
    extra_manifest = output_root / "candidate-with-parcel-artifact.json"
    extra_manifest.write_text(json.dumps({
        **supplied,
        "artifacts": {**supplied["artifacts"], "parcelRows": supplied["artifacts"]["zoningRows"]},
    }))
    try:
        IMPORTER.load_manifest(extra_manifest, expected)
    except ValueError as error:
        test("candidate manifest refuses parcel artifacts", "inventory differs" in str(error))
    else:
        raise AssertionError("candidate manifest accepted a parcel artifact")

    materialization_id, paths, artifact_hashes = IMPORTER.load_manifest(zoning_manifest, expected)
    IMPORTER.verify_zoning_receipt(paths, expected)
    test("candidate manifest pins all nine sealed Packet 9 artifacts", len(artifact_hashes) == 9)

    sql(psql, "create role anon; create role authenticated; create role service_role")
    parcel_output = output_root / "parcel-only"
    subprocess.run([
        sys.executable, str(HERE / "import.py"), "--mode", "parcel-only",
        "--boundary", str(boundary), "--manifest", str(parcel_manifest), "--output", str(parcel_output),
    ], check=True, env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"}, stdout=subprocess.DEVNULL)
    parcel_receipt = json.loads((parcel_output / "receipt.json").read_text())
    sql(psql, f"update trulot_v2.import_run set import_run_id='{expected['parcelImportRunId']}' where import_run_id='{parcel_receipt['importRunId']}'")
    test("isolated baseline uses the exact validated production parcel run identity", sql(psql, "select import_run_id::text from trulot_v2.import_run") == expected["parcelImportRunId"])

    preflight_counts, preflight_fingerprints = IMPORTER.validate_existing_parcel_candidate(target)
    test("parcel reuse preflight proves exact countywide and City populations", preflight_counts["parcelAccepted"] == 1088430 and preflight_counts["cityDistinctApns"] == 393733)
    test("parcel reuse preflight proves all three sealed parcel fingerprints", preflight_fingerprints == {
        key: expected["fingerprints"][key]
        for key in ("countywideParcelFullRow", "parcelApnSet", "parcelFullRow")
    })
    before_relations = sql(psql, "select concat_ws('|',(select count(*) from trulot_v2.import_run),(select count(*) from trulot_v2.parcel_acquisition),(select count(*) from trulot_v2.parcel_base_sangis_v2),(select count(*) from trulot_v2.parcel_quarantine),(select count(*) from trulot_v2.zoning_acquisition),(select count(*) from trulot_v2.base_zoning_source_v2),(select count(*) from trulot_v2.base_zoning_quarantine),(select count(*) from trulot_v2.base_zoning_mapping_geometry),(select count(*) from trulot_v2.parcel_zone_mapping_v2),(select count(*) from trulot_v2.selected_snapshot))")
    test("isolated baseline has parcel data only and remains dark", before_relations == "1|1|1088430|1328|0|0|0|0|0|0")

    candidate_output = output_root / "candidate-load"
    command = [
        sys.executable, str(HERE / "import.py"), "--mode", "integrated-candidate",
        "--boundary", str(boundary), "--manifest", str(zoning_manifest),
    ]
    subprocess.run(command + ["--output", str(candidate_output)], check=True, env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"}, stdout=subprocess.DEVNULL)
    receipt = json.loads((candidate_output / "receipt.json").read_text())
    test("candidate run is integrated and validated without selection", receipt["decision"] == "UNSELECTED_BASE_ZONING_V2_CANDIDATE_PASS" and receipt["timestamps"]["runKind"] == "INTEGRATED" and receipt["timestamps"]["status"] == "VALIDATED" and receipt["selectedSnapshotRows"] == 0)
    test("candidate reuses the exact parcel acquisition and validated run", receipt["acquisitionIds"]["parcel"] == expected["parcelAcquisitionId"] and receipt["reusedParcelImportRunId"] == expected["parcelImportRunId"])
    test("candidate source accounting is exact", receipt["counts"]["zoningSource"] == 3706 and receipt["counts"]["zoningAccepted"] == 3680 and receipt["counts"]["zoningQuarantine"] == 26)
    test("candidate mapping accounting is exact", receipt["counts"]["zoningMappingGeometry"] == 3706 and receipt["counts"]["zoningMapping"] == 393733 and receipt["counts"]["duplicateApnMappings"] == 0 and receipt["counts"]["orphanParcelReferences"] == 0 and receipt["counts"]["orphanZoningReferences"] == 0)
    test("candidate preserves the detailed mapping-state distribution", receipt["counts"]["zoningStateCounts"] == expected["zoningStateCounts"])
    test("candidate preserves split-zone evidence", receipt["counts"]["invalidSplitEvidence"] == 0 and receipt["counts"]["zoningStateCounts"]["MULTI_ZONE"] == 73064)
    test("candidate preserves unmapped and ambiguous truth states", receipt["counts"]["invalidUnmappedEvidence"] == 0 and receipt["counts"]["invalidAmbiguousEvidence"] == 0 and receipt["counts"]["zoningStateCounts"]["UNMAPPED"] == 327 and receipt["counts"]["zoningStateCounts"]["INDETERMINATE"] == 1641)
    test("quarantine and repaired mapping evidence remain separated", receipt["counts"]["acceptedQuarantineOverlap"] == 0 and receipt["counts"]["repairedMappingGeometry"] == 26 and receipt["counts"]["repairedWithoutQuarantine"] == 0 and receipt["counts"]["quarantineWithoutRepairedEvidence"] == 0)
    test("every database and artifact fingerprint matches Packet 9", receipt["fingerprints"] == expected["fingerprints"])

    after_relations = sql(psql, "select concat_ws('|',(select count(*) from trulot_v2.import_run),(select count(*) from trulot_v2.parcel_acquisition),(select count(*) from trulot_v2.parcel_base_sangis_v2),(select count(*) from trulot_v2.parcel_quarantine),(select count(*) from trulot_v2.zoning_acquisition),(select count(*) from trulot_v2.base_zoning_source_v2),(select count(*) from trulot_v2.base_zoning_quarantine),(select count(*) from trulot_v2.base_zoning_mapping_geometry),(select count(*) from trulot_v2.parcel_zone_mapping_v2),(select count(*) from trulot_v2.selected_snapshot))")
    test("candidate changes only the zoning allowlist and one integrated run", after_relations == "2|1|1088430|1328|1|3680|26|3706|393733|0")
    after_parcel_fingerprints = {
        "countywideParcelFullRow": IMPORTER.countywide_parcel_fingerprint(target, expected["parcelAcquisitionId"]),
        "parcelApnSet": IMPORTER.parcel_fingerprint(target, "apn_norm", expected["parcelAcquisitionId"]),
        "parcelFullRow": IMPORTER.parcel_fingerprint(target, "row_to_json(s)::text", expected["parcelAcquisitionId"]),
    }
    test("candidate performs no parcel writes", after_parcel_fingerprints == preflight_fingerprints)
    test("unselected candidate remains absent from both serving views", receipt["servedRows"] == 0 and sql(psql, "select (select count(*) from trulot_v2.parcel_serving_v2)+(select count(*) from trulot_v2.parcel_intelligence_serving_v2)") == "0")

    validation_state_before = sql(psql, "select md5(string_agg(v,'|' order by v)) from (select concat('run:',import_run_id,':',status,':',observed_counts::text,':',observed_fingerprints::text) v from trulot_v2.import_run union all select concat('counts:',(select count(*) from trulot_v2.zoning_acquisition),':',(select count(*) from trulot_v2.base_zoning_source_v2),':',(select count(*) from trulot_v2.base_zoning_quarantine),':',(select count(*) from trulot_v2.base_zoning_mapping_geometry),':',(select count(*) from trulot_v2.parcel_zone_mapping_v2),':',(select count(*) from trulot_v2.selected_snapshot))) s")
    validate_output = output_root / "validate-only"
    subprocess.run(command + ["--output", str(validate_output), "--validate-only"], check=True, env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"}, stdout=subprocess.DEVNULL)
    validated = json.loads((validate_output / "receipt.json").read_text())
    validation_state_after = sql(psql, "select md5(string_agg(v,'|' order by v)) from (select concat('run:',import_run_id,':',status,':',observed_counts::text,':',observed_fingerprints::text) v from trulot_v2.import_run union all select concat('counts:',(select count(*) from trulot_v2.zoning_acquisition),':',(select count(*) from trulot_v2.base_zoning_source_v2),':',(select count(*) from trulot_v2.base_zoning_quarantine),':',(select count(*) from trulot_v2.base_zoning_mapping_geometry),':',(select count(*) from trulot_v2.parcel_zone_mapping_v2),':',(select count(*) from trulot_v2.selected_snapshot))) s")
    test("validate-only independently reproduces exact candidate evidence", validated["operation"] == "validate-only" and validated["importRunId"] == receipt["importRunId"] and validated["counts"] == receipt["counts"] and validated["fingerprints"] == receipt["fingerprints"])
    test("validate-only performs no writes", validation_state_before == validation_state_after)

    replay = subprocess.run(command + ["--output", str(output_root / "replay")], env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"}, text=True, capture_output=True)
    test("second candidate load refuses deterministically", replay.returncode != 0 and "parcel reuse preflight mismatch" in replay.stdout + replay.stderr)
    test("replay refusal creates no duplicate zoning or mapping rows", sql(psql, "select concat_ws('|',(select count(*) from trulot_v2.import_run),(select count(*) from trulot_v2.zoning_acquisition),(select count(*) from trulot_v2.base_zoning_source_v2),(select count(*) from trulot_v2.base_zoning_quarantine),(select count(*) from trulot_v2.base_zoning_mapping_geometry),(select count(*) from trulot_v2.parcel_zone_mapping_v2),(select count(*) from trulot_v2.selected_snapshot))") == "2|1|3680|26|3706|393733|0")

    test("all ten private V2 tables retain RLS", sql(psql, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trulot_v2' and c.relkind='r' and c.relrowsecurity") == "10")
    test("PUBLIC, anon and authenticated receive no V2 table grants", sql(psql, "select count(*) from information_schema.role_table_grants where table_schema='trulot_v2' and grantee in ('PUBLIC','anon','authenticated')") == "0")
    test("service_role remains read-only", sql(psql, "select count(*) from information_schema.role_table_grants where table_schema='trulot_v2' and grantee='service_role' and privilege_type<>'SELECT'") == "0")

    evidence = {
        "schemaVersion": 1,
        "decision": "UNSELECTED_BASE_ZONING_V2_PRODUCTION_PATH_SEALED",
        "environment": {"isolation": "fresh disposable Unix-socket-only PostgreSQL/PostGIS", "productionConnected": False},
        "checksPassed": checks,
        "parcelBaseline": {"runId": expected["parcelImportRunId"], "counts": preflight_counts, "fingerprints": preflight_fingerprints},
        "candidate": receipt,
        "validateOnly": {"passed": True, "performedWrites": False},
        "replay": {"refused": True, "duplicateRows": False},
        "security": {"rlsTables": 10, "publicAnonAuthenticatedGrants": 0, "serviceRoleNonSelectGrants": 0},
        "productionMutation": False,
    }
    (output_root / "evidence.json").write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n")
    print(f"{checks} integrated-candidate production-path checks passed.")


if __name__ == "__main__":
    main()
