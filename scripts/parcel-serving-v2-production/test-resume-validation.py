"""Rehearse same-run parcel-only resume validation in a disposable PostGIS cluster.

Usage: python3 test-resume-validation.py BOUNDARY PARCEL_MANIFEST NEW_OUTPUT_ROOT
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts/parcel-v2-postgis"))
from local import ENV, connection, sql  # noqa: E402

SPEC = importlib.util.spec_from_file_location("resume_validation_importer", HERE / "import.py")
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
    target = IMPORTER.Target(psql, "isolated-local-rehearsal")
    checks = 0

    def test(name: str, condition: bool) -> None:
        nonlocal checks
        if not condition:
            raise AssertionError(name)
        checks += 1
        print("PASS", name, flush=True)

    subprocess.run(
        psql,
        input="create role anon; create role authenticated; create role service_role;",
        text=True,
        check=True,
        env=ENV,
        stdout=subprocess.DEVNULL,
    )
    materialization_id, paths, artifact_hashes = IMPORTER.load_manifest(
        manifest, IMPORTER.PARCEL_ONLY_EXPECTED
    )
    load_output = output_root / "interrupted-load"
    load_output.mkdir()
    run_id = IMPORTER.load_parcel_only_data(
        target, paths, materialization_id, artifact_hashes, load_output
    )

    initial_state = sql(
        psql,
        "select concat_ws('|',"
        "(select count(*) from trulot_v2.parcel_acquisition),"
        "(select count(*) from trulot_v2.import_run),"
        "(select status from trulot_v2.import_run),"
        "(select run_kind from trulot_v2.import_run),"
        "coalesce((select zoning_acquisition_id from trulot_v2.import_run),'NULL'),"
        "(select count(*) from trulot_v2.parcel_base_sangis_v2),"
        "(select count(*) from trulot_v2.parcel_quarantine),"
        "(select count(*) from trulot_v2.selected_snapshot))",
    )
    test(
        "interrupted rehearsal has one unselected LOADING parcel-only run",
        initial_state == "1|1|LOADING|PARCEL_ONLY|NULL|1088430|1328|0",
    )
    test(
        "interrupted rehearsal run uses the committed candidate",
        sql(psql, "select import_run_id::text from trulot_v2.import_run") == run_id,
    )

    source_object_id = sql(
        psql,
        "select source_object_id from trulot_v2.parcel_base_sangis_v2 "
        "where situs_juris='SD' and address is not null order by source_object_id limit 1",
    )
    original_address_hash = sql(
        psql,
        "select md5(address) from trulot_v2.parcel_base_sangis_v2 "
        f"where source_object_id={source_object_id}",
    )
    mismatch_suffix = " [resume-validation-mismatch]"
    sql(
        psql,
        "update trulot_v2.parcel_base_sangis_v2 "
        f"set address=address||'{mismatch_suffix}' where source_object_id={source_object_id}",
    )
    tampered_address_hash = sql(
        psql,
        "select md5(address) from trulot_v2.parcel_base_sangis_v2 "
        f"where source_object_id={source_object_id}",
    )
    population_before_failure = sql(
        psql,
        "select concat((select count(*) from trulot_v2.parcel_acquisition),'|',"
        "(select count(*) from trulot_v2.import_run),'|',"
        "(select count(*) from trulot_v2.parcel_base_sangis_v2),'|',"
        "(select count(*) from trulot_v2.parcel_quarantine),'|',"
        "(select count(*) from trulot_v2.selected_snapshot))",
    )

    base_command = [
        sys.executable,
        str(HERE / "import.py"),
        "--mode", "parcel-only",
        "--boundary", str(boundary),
        "--manifest", str(manifest),
    ]
    mismatch_output = output_root / "mismatch-resume"
    mismatch = subprocess.run(
        base_command + ["--output", str(mismatch_output), "--resume-validation"],
        env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"},
        text=True,
        capture_output=True,
    )
    test(
        "resume-validation refuses a fingerprint mismatch",
        mismatch.returncode != 0
        and "fingerprint reconciliation failed" in mismatch.stdout + mismatch.stderr,
    )
    population_after_failure = sql(
        psql,
        "select concat((select count(*) from trulot_v2.parcel_acquisition),'|',"
        "(select count(*) from trulot_v2.import_run),'|',"
        "(select count(*) from trulot_v2.parcel_base_sangis_v2),'|',"
        "(select count(*) from trulot_v2.parcel_quarantine),'|',"
        "(select count(*) from trulot_v2.selected_snapshot))",
    )
    test(
        "failed resume leaves the same run LOADING without changing candidate rows",
        population_after_failure == population_before_failure == "1|1|1088430|1328|0"
        and sql(psql, "select status from trulot_v2.import_run") == "LOADING"
        and sql(
            psql,
            "select md5(address) from trulot_v2.parcel_base_sangis_v2 "
            f"where source_object_id={source_object_id}",
        )
        == tampered_address_hash,
    )

    sql(
        psql,
        "update trulot_v2.parcel_base_sangis_v2 "
        f"set address=left(address,length(address)-length('{mismatch_suffix}')) "
        f"where source_object_id={source_object_id}",
    )
    test(
        "local mismatch fixture restores the sealed candidate exactly",
        sql(
            psql,
            "select md5(address) from trulot_v2.parcel_base_sangis_v2 "
            f"where source_object_id={source_object_id}",
        )
        == original_address_hash,
    )

    resume_output = output_root / "resume"
    subprocess.run(
        base_command + ["--output", str(resume_output), "--resume-validation"],
        check=True,
        env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"},
        stdout=subprocess.DEVNULL,
    )
    receipt = json.loads((resume_output / "receipt.json").read_text())
    expected = IMPORTER.PARCEL_ONLY_EXPECTED
    test(
        "resume-validation finalizes the same existing run",
        receipt["operation"] == "resume-validation"
        and receipt["importRunId"] == run_id
        and receipt["timestamps"]["status"] == "VALIDATED"
        and sql(psql, "select count(*) from trulot_v2.import_run") == "1",
    )
    test(
        "resume-validation reconciles exact source, accepted, quarantine and City counts",
        receipt["counts"]["parcelSource"] == 1089758
        and receipt["counts"]["parcelAccepted"] == 1088430
        and receipt["counts"]["parcelQuarantine"] == 1328
        and receipt["counts"]["cityParcels"] == 393733
        and receipt["counts"]["cityDistinctApns"] == 393733,
    )
    test(
        "resume-validation reproduces all sealed fingerprints",
        receipt["fingerprints"] == expected["fingerprints"],
    )
    test(
        "resume-validation creates no acquisition, zoning, mapping, selection or serving rows",
        sql(
            psql,
            "select concat_ws('|',"
            "(select count(*) from trulot_v2.parcel_acquisition),"
            "(select count(*) from trulot_v2.zoning_acquisition),"
            "(select count(*) from trulot_v2.base_zoning_source_v2),"
            "(select count(*) from trulot_v2.base_zoning_quarantine),"
            "(select count(*) from trulot_v2.base_zoning_mapping_geometry),"
            "(select count(*) from trulot_v2.parcel_zone_mapping_v2),"
            "(select count(*) from trulot_v2.selected_snapshot),"
            "(select count(*) from trulot_v2.parcel_serving_v2),"
            "(select count(*) from trulot_v2.parcel_intelligence_serving_v2))",
        )
        == "1|0|0|0|0|0|0|0|0",
    )

    validate_output = output_root / "validate-only"
    subprocess.run(
        base_command + ["--output", str(validate_output), "--validate-only"],
        check=True,
        env={**ENV, "PYTHONDONTWRITEBYTECODE": "1"},
        stdout=subprocess.DEVNULL,
    )
    validated = json.loads((validate_output / "receipt.json").read_text())
    test(
        "validate-only independently reproduces the same counts and fingerprints",
        validated["operation"] == "validate-only"
        and validated["importRunId"] == run_id
        and validated["counts"] == receipt["counts"]
        and validated["fingerprints"] == receipt["fingerprints"],
    )

    print(f"{checks} resume-validation checks passed.")


if __name__ == "__main__":
    main()
