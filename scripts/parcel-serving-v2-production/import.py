"""Deterministically load the sealed Parcel Serving V2 artifacts into trulot_v2.

Rehearsal:
  python3 import.py --boundary BOUNDARY --manifest MATERIALIZATION --output NEW_DIR

Production execution is deliberately double-gated and is not authorized by this packet:
  TRULOT_V2_PRODUCTION_LOAD_AUTHORIZED=1 python3 import.py \
    --database-url-env TRULOT_V2_DATABASE_URL --authorize-production-load \
    --manifest MATERIALIZATION --output NEW_DIR
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import hashlib
import importlib.util
import itertools
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import uuid
from collections import Counter

import pyproj
import shapely
from shapely.geometry import Point, shape
from shapely.ops import transform
from shapely.validation import make_valid

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
EXPECTED = json.loads((HERE / "expected.json").read_text())
MIGRATION = ROOT / "supabase/migrations/20260925090000_parcel_serving_v2_shadow_foundation.sql"
PSQL = "/opt/homebrew/bin/psql"
ENV = {key: os.environ[key] for key in ("PATH", "LANG", "LC_ALL", "TMPDIR") if key in os.environ}
csv.field_size_limit(sys.maxsize)

stream_spec = importlib.util.spec_from_file_location("sangis_stream", ROOT / "scripts/sangis-acquisition-stream.py")
sangis_stream = importlib.util.module_from_spec(stream_spec)
assert stream_spec.loader is not None
stream_spec.loader.exec_module(sangis_stream)


def sha256(path: pathlib.Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def csv_row(writer: csv.writer, values: list[object]) -> None:
    writer.writerow(["\\N" if value is None else value for value in values])


def ewkb(geometry: shapely.Geometry, srid: int) -> str:
    return shapely.set_srid(geometry, srid).wkb_hex


def source_date(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, int):
        raise ValueError("Unexpected zoning implementation-date encoding")
    return dt.datetime.fromtimestamp(value / 1000, dt.timezone.utc).date().isoformat()


class Target:
    def __init__(self, command: list[str], label: str, environment: dict[str, str] | None = None):
        self.command = command
        self.label = label
        self.environment = ENV if environment is None else environment

    def sql(self, statement: str) -> str:
        return subprocess.check_output(self.command + ["-Atc", statement], env=self.environment, text=True).strip()

    def run(self, statement: str, log: pathlib.Path) -> None:
        with log.open("a") as output:
            subprocess.run(self.command, input=statement, text=True, check=True, env=self.environment, stdout=output, stderr=output)


def target_from_args(args: argparse.Namespace) -> Target:
    if args.boundary:
        sys.path.insert(0, str(ROOT / "scripts/parcel-v2-postgis"))
        from local import connection

        return Target(connection(args.boundary), "isolated-local-rehearsal")
    if not args.authorize_production_load or os.environ.get("TRULOT_V2_PRODUCTION_LOAD_AUTHORIZED") != "1":
        raise ValueError("Production target requires both the CLI authorization flag and explicit environment gate")
    dsn = os.environ.get(args.database_url_env, "")
    if not dsn:
        raise ValueError(f"Missing database URL environment variable: {args.database_url_env}")
    return Target([PSQL, "-X", "-v", "ON_ERROR_STOP=1"], "separately-authorized-production", {**ENV, "PGDATABASE": dsn})


def load_manifest(path: pathlib.Path) -> tuple[str, dict[str, pathlib.Path], dict[str, str]]:
    manifest = json.loads(path.read_text())
    materialization_id = str(manifest.get("materializationId", ""))
    if manifest.get("schemaVersion") != 1 or not re.fullmatch(r"[A-Za-z0-9._:-]+", materialization_id):
        raise ValueError("Invalid materialization manifest")
    supplied = manifest.get("artifacts")
    if not isinstance(supplied, dict) or set(supplied) != set(EXPECTED["artifacts"]):
        raise ValueError("Materialization artifact inventory differs from the sealed contract")
    paths = {key: pathlib.Path(value).expanduser().resolve() for key, value in supplied.items()}
    observed: dict[str, str] = {}
    for key, artifact in paths.items():
        if not artifact.is_file():
            raise ValueError(f"Missing materialized artifact: {key}")
        observed[key] = sha256(artifact)
        if observed[key] != EXPECTED["artifacts"][key]:
            raise ValueError(f"Artifact SHA-256 mismatch: {key}")
    return materialization_id, paths, observed


def verify_receipts(paths: dict[str, pathlib.Path]) -> tuple[dict, dict, dict, dict]:
    parcel_acquisition = json.loads(paths["parcelAcquisition"].read_text())
    parcel_report = json.loads(paths["parcelReport"].read_text())
    zoning_acquisition = json.loads(paths["zoningAcquisition"].read_text())
    zoning_report = json.loads(paths["zoningReport"].read_text())
    parcel_receipt = parcel_acquisition["receipt"]
    zoning_receipt = zoning_acquisition["receipt"]
    if parcel_acquisition["acquisitionId"] != EXPECTED["parcelAcquisitionId"]:
        raise ValueError("Parcel acquisition identity changed")
    if parcel_receipt["contentSha256"] != EXPECTED["artifacts"]["parcelRaw"]:
        raise ValueError("Parcel acquisition receipt does not identify the sealed raw artifact")
    if parcel_report["counts"] != {
        **parcel_report["counts"],
        "source": EXPECTED["counts"]["parcelSource"],
        "accepted": EXPECTED["counts"]["parcelAccepted"],
        "rejected": EXPECTED["counts"]["parcelQuarantine"],
    }:
        raise ValueError("Parcel normalization counts changed")
    if zoning_receipt["acquisitionId"] != EXPECTED["zoningAcquisitionId"]:
        raise ValueError("Zoning acquisition identity changed")
    if zoning_receipt["artifact"]["sha256"] != EXPECTED["artifacts"]["zoningRaw"]:
        raise ValueError("Zoning acquisition receipt does not identify the sealed raw artifact")
    if zoning_report["counts"]["parsed"] != EXPECTED["counts"]["zoningSource"] or zoning_report["counts"]["accepted"] != EXPECTED["counts"]["zoningAccepted"] or zoning_report["counts"]["rejected"] != EXPECTED["counts"]["zoningQuarantine"]:
        raise ValueError("Zoning normalization counts changed")
    return parcel_acquisition, parcel_report, zoning_acquisition, zoning_report


def parcel_fingerprint(target: Target, projection: str) -> str:
    query = (
        "copy (select " + projection + " from (select p.acquisition_id,p.source_object_id,p.apn_norm,p.parcel_id,"
        "p.address,p.situs_components,p.situs_zip,p.situs_juris,p.geom,p.centroid,p.point_on_surface,p.centroid_within,"
        "p.approximate_geometry_area_sqft,p.taxable_acreage,p.geometry_sha256,a.native_crs,a.artifact_crs "
        "from trulot_v2.parcel_base_sangis_v2 p join trulot_v2.parcel_acquisition a using(acquisition_id) "
        f"where p.acquisition_id='{EXPECTED['parcelAcquisitionId']}' and p.situs_juris='SD') s "
        "order by acquisition_id,source_object_id) to stdout"
    )
    digest = hashlib.sha256()
    process = subprocess.Popen(target.command + ["-c", query], stdout=subprocess.PIPE, env=target.environment)
    assert process.stdout is not None
    while chunk := process.stdout.read(1024 * 1024):
        digest.update(chunk)
    if process.wait() != 0:
        raise RuntimeError("Parcel fingerprint query failed")
    return digest.hexdigest()


def integrated_fingerprint(target: Target) -> str:
    query = f"""copy (
      select p.acquisition_id,p.source_object_id,p.apn_norm,p.parcel_id,p.address,p.situs_components::text,
             p.situs_zip,p.situs_juris,st_asgeojson(p.geom,17),st_asgeojson(p.centroid,17),
             st_asgeojson(p.point_on_surface,17),p.centroid_within,p.approximate_geometry_area_sqft,
             p.taxable_acreage,p.geometry_sha256,pa.native_crs,pa.artifact_crs,z.mapping_payload::text
      from trulot_v2.parcel_base_sangis_v2 p
      join trulot_v2.parcel_acquisition pa using(acquisition_id)
      join trulot_v2.parcel_zone_mapping_v2 z
        on z.parcel_acquisition_id=p.acquisition_id and z.parcel_source_object_id=p.source_object_id and z.apn_norm=p.apn_norm
      where p.acquisition_id='{EXPECTED['parcelAcquisitionId']}' and p.situs_juris='SD'
        and z.zoning_acquisition_id='{EXPECTED['zoningAcquisitionId']}'
      order by p.acquisition_id,p.source_object_id
    ) to stdout with (format csv, delimiter E'\\t', null '\\N')"""
    process = subprocess.Popen(target.command + ["-c", query], stdout=subprocess.PIPE, env=target.environment, text=True)
    assert process.stdout is not None
    reader = csv.reader(process.stdout, delimiter="\t")
    digest = hashlib.sha256()
    count = 0
    for values in reader:
        values = [None if value == "\\N" else value for value in values]
        parcel = {
            "acquisition_id": values[0],
            "source_object_id": int(values[1]),
            "apn_norm": values[2],
            "parcel_id": int(values[3]),
            "address": values[4],
            "situs_components": json.loads(values[5]),
            "situs_zip": values[6],
            "situs_juris": values[7],
            "geom": json.loads(values[8]),
            "centroid": json.loads(values[9]),
            "point_on_surface": json.loads(values[10]),
            "centroid_within": values[11] == "t",
            "approximate_geometry_area_sqft": float(values[12]),
            "taxable_acreage": None if values[13] is None else float(values[13]),
            "geometry_sha256": values[14],
            "native_crs": values[15],
            "artifact_crs": values[16],
        }
        zoning = json.loads(values[17])
        record = {
            "schemaVersion": 1,
            "integrationMethodVersion": EXPECTED["integrationMethodVersion"],
            "apn": parcel["apn_norm"],
            "parcel": parcel,
            "baseZoning": zoning,
            "provenanceReferences": {
                "parcel": "data/parcel-serving-v2/report.json#provenance",
                "baseZoning": "data/base-zoning-v2/acquisition.json#receipt",
                "mapping": "data/base-zoning-v2/mapping-report.json",
            },
        }
        digest.update((canonical(record) + "\n").encode())
        count += 1
    if process.wait() != 0 or count != EXPECTED["counts"]["integrated"]:
        raise RuntimeError("Integrated fingerprint query failed")
    return digest.hexdigest()


def query_counts(target: Target) -> dict[str, object]:
    raw = target.sql("""
      select json_build_object(
        'parcelAccepted',(select count(*) from trulot_v2.parcel_base_sangis_v2),
        'parcelQuarantine',(select count(*) from trulot_v2.parcel_quarantine),
        'cityParcels',(select count(*) from trulot_v2.parcel_base_sangis_v2 where situs_juris='SD'),
        'cityDistinctApns',(select count(distinct apn_norm) from trulot_v2.parcel_base_sangis_v2 where situs_juris='SD'),
        'zoningAccepted',(select count(*) from trulot_v2.base_zoning_source_v2),
        'zoningQuarantine',(select count(*) from trulot_v2.base_zoning_quarantine),
        'zoningMappingGeometry',(select count(*) from trulot_v2.base_zoning_mapping_geometry),
        'zoningMapping',(select count(*) from trulot_v2.parcel_zone_mapping_v2),
        'duplicateServedApns',(select count(*) from (select apn_norm from trulot_v2.parcel_zone_mapping_v2 group by apn_norm having count(*)>1) d),
        'missingParcelRows',(select count(*) from trulot_v2.parcel_zone_mapping_v2 z left join trulot_v2.parcel_base_sangis_v2 p on p.acquisition_id=z.parcel_acquisition_id and p.source_object_id=z.parcel_source_object_id where p.source_object_id is null),
        'missingZoningRows',(select count(*) from trulot_v2.parcel_base_sangis_v2 p left join trulot_v2.parcel_zone_mapping_v2 z on z.parcel_acquisition_id=p.acquisition_id and z.parcel_source_object_id=p.source_object_id where p.situs_juris='SD' and z.parcel_source_object_id is null),
        'zoningStateCounts',(select json_object_agg(mapping_state,n) from (select mapping_state,count(*) n from trulot_v2.parcel_zone_mapping_v2 group by mapping_state order by mapping_state) s)
      )
    """)
    return json.loads(raw)


def assert_reconciliation(counts: dict[str, object], fingerprints: dict[str, str]) -> None:
    expected_counts = EXPECTED["counts"]
    required = {
        "parcelAccepted": expected_counts["parcelAccepted"],
        "parcelQuarantine": expected_counts["parcelQuarantine"],
        "cityParcels": expected_counts["cityParcels"],
        "cityDistinctApns": expected_counts["cityDistinctApns"],
        "zoningAccepted": expected_counts["zoningAccepted"],
        "zoningQuarantine": expected_counts["zoningQuarantine"],
        "zoningMappingGeometry": expected_counts["zoningSource"],
        "zoningMapping": expected_counts["zoningMapping"],
        "duplicateServedApns": 0,
        "missingParcelRows": 0,
        "missingZoningRows": 0,
    }
    for key, value in required.items():
        if counts.get(key) != value:
            raise ValueError(f"Reconciliation mismatch for {key}: {counts.get(key)} != {value}")
    if counts.get("zoningStateCounts") != EXPECTED["zoningStateCounts"]:
        raise ValueError("Zoning state counts changed")
    if fingerprints != EXPECTED["fingerprints"]:
        raise ValueError("Production-shadow fingerprint reconciliation failed")


def load_data(target: Target, paths: dict[str, pathlib.Path], materialization_id: str, artifact_hashes: dict[str, str], output: pathlib.Path) -> str:
    parcel_acquisition, parcel_report, zoning_acquisition, zoning_report = verify_receipts(paths)
    parcel_receipt = parcel_acquisition["receipt"]
    zoning_receipt = zoning_acquisition["receipt"]
    importer_version = sha256(pathlib.Path(__file__))
    import_run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, materialization_id + ":" + canonical(artifact_hashes) + ":" + importer_version))
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    log_path = output / "psql.log"

    target.run(MIGRATION.read_text(), log_path)
    existing = target.sql("select (select count(*) from trulot_v2.selected_snapshot) + (select count(*) from trulot_v2.parcel_base_sangis_v2)")
    if existing != "0":
        raise ValueError("trulot_v2 is not empty; importer will not overwrite an existing load")

    log_stream = log_path.open("a")
    process = subprocess.Popen(target.command, stdin=subprocess.PIPE, stdout=log_stream, stderr=subprocess.STDOUT, text=True, env=target.environment)
    assert process.stdin is not None
    writer = csv.writer(process.stdin, lineterminator="\n")
    parcel_counts = Counter()
    zoning_counts = Counter()
    mapping_states = Counter()
    mapping_fingerprint = hashlib.sha256()
    native_transform = pyproj.Transformer.from_crs(4326, 2230, always_xy=True).transform

    try:
        process.stdin.write("begin;\n")
        process.stdin.write("copy trulot_v2.import_run from stdin with (format csv, null '\\N');\n")
        csv_row(writer, [import_run_id, importer_version, started_at, None, "LOADING", materialization_id,
                         EXPECTED["parcelAcquisitionId"], EXPECTED["zoningAcquisitionId"], canonical(artifact_hashes), "{}", "{}", None])
        process.stdin.write("\\.\ncopy trulot_v2.parcel_acquisition from stdin with (format csv, null '\\N');\n")
        csv_row(writer, [parcel_acquisition["acquisitionId"], parcel_receipt["datasetId"], parcel_receipt["acquiredAt"],
                         parcel_receipt["publisher"], parcel_receipt["sourceUrl"], parcel_receipt["metadataUrl"],
                         parcel_receipt["sourceReported"]["currency"]["value"], parcel_receipt["contentSha256"],
                         parcel_receipt["metadataContentSha256"], artifact_hashes["parcelReport"], artifact_hashes["parcelRows"],
                         artifact_hashes["parcelQuarantine"], parcel_report["counts"]["source"], parcel_report["counts"]["accepted"],
                         parcel_report["counts"]["rejected"], parcel_receipt["nativeSourceCrs"], parcel_receipt["artifactCrs"], canonical(parcel_acquisition)])
        process.stdin.write("\\.\ncopy trulot_v2.parcel_base_sangis_v2 from stdin with (format csv, null '\\N');\n")
        with paths["parcelRaw"].open(encoding="utf-8-sig") as raw, gzip.open(paths["parcelRows"], "rt") as normalized:
            for index, pair in enumerate(itertools.zip_longest(sangis_stream.features(raw), normalized)):
                feature, line = pair
                if feature is None or line is None:
                    raise ValueError("Parcel raw and normalized row counts differ")
                entry = json.loads(line)
                row = entry["row"]
                properties = feature["properties"]
                if entry["index"] != index or properties["objectid"] != row["sourceObjectId"] or properties["apn"] != row["apnRaw"] or properties["parcelid"] != row["parcelId"]:
                    raise ValueError("Parcel raw/normalized identity mismatch")
                parcel_counts["source"] += 1
                if not entry["accepted"]:
                    parcel_counts["quarantine"] += 1
                    continue
                geometry = shape(feature["geometry"])
                geometry_hash = hashlib.sha256(shapely.normalize(geometry).wkb).hexdigest()
                if geometry_hash != entry["geometryStats"]["geometryHash"]:
                    raise ValueError("Parcel geometry hash mismatch")
                derived = entry["geometry"]
                csv_row(writer, [parcel_acquisition["acquisitionId"], row["sourceObjectId"], row["apnRaw"], row["apnNorm"], row["parcelId"],
                                 row["address"], canonical(row["situsComponents"]), row["situsComponents"]["situs_zip"], row["jurisdiction"],
                                 ewkb(geometry, 4326), ewkb(Point(derived["centroid"]), 4326), ewkb(Point(derived["pointOnSurface"]), 4326),
                                 "t" if derived["centroidWithin"] else "f", derived["approxGeometryAreaSqFt"], row["taxableAcreage"], geometry_hash])
                parcel_counts["accepted"] += 1
                if parcel_counts["source"] % 100000 == 0:
                    print(f"Parcel rows verified: {parcel_counts['source']}", flush=True)
        process.stdin.write("\\.\ncopy trulot_v2.parcel_quarantine from stdin with (format csv, null '\\N');\n")
        quarantine_rows = 0
        with gzip.open(paths["parcelQuarantine"], "rt") as source:
            for line in source:
                entry = json.loads(line)
                csv_row(writer, [parcel_acquisition["acquisitionId"], entry["row"]["sourceObjectId"], entry["row"]["apnRaw"],
                                 entry["row"].get("apnNorm"), canonical(entry["reasons"]), canonical(entry.get("geometryStats", {})),
                                 hashlib.sha256((canonical(entry) + "\n").encode()).hexdigest()])
                quarantine_rows += 1
        if quarantine_rows != parcel_counts["quarantine"]:
            raise ValueError("Parcel quarantine count differs from normalized source")

        process.stdin.write("\\.\ncopy trulot_v2.zoning_acquisition from stdin with (format csv, null '\\N');\n")
        csv_row(writer, [zoning_receipt["acquisitionId"], zoning_receipt["datasetId"], zoning_receipt["acquiredAt"], zoning_receipt["publisher"],
                         zoning_receipt["sourceUrl"], zoning_receipt["metadataUrl"], zoning_receipt["artifact"]["sha256"],
                         artifact_hashes["zoningReport"], artifact_hashes["zoningRows"], artifact_hashes["zoningQuarantine"],
                         zoning_report["counts"]["parsed"], zoning_report["counts"]["accepted"], zoning_report["counts"]["rejected"],
                         zoning_receipt["nativeCrs"], zoning_receipt["artifactCrs"], canonical(zoning_acquisition)])

        normalized_zoning: dict[int, dict] = {}
        for key in ("zoningRows", "zoningQuarantine"):
            with gzip.open(paths[key], "rt") as source:
                for line in source:
                    entry = json.loads(line)
                    normalized_zoning[entry["index"]] = entry
        zoning_payload = json.loads(paths["zoningRaw"].read_text())
        if len(normalized_zoning) != len(zoning_payload["features"]):
            raise ValueError("Zoning raw and normalized row counts differ")

        rejected_zoning: list[tuple[dict, shapely.Geometry, shapely.Geometry]] = []
        mapping_geometries: list[tuple[dict, shapely.Geometry, str, str | None, float, float, float]] = []
        process.stdin.write("\\.\ncopy trulot_v2.base_zoning_source_v2 from stdin with (format csv, null '\\N');\n")
        for index, feature in enumerate(zoning_payload["features"]):
            entry = normalized_zoning[index]
            geometry = shape(feature["geometry"])
            if hashlib.sha256(shapely.normalize(geometry).wkb).hexdigest() != entry["geometrySha256"]:
                raise ValueError("Zoning geometry hash mismatch")
            native_geometry = transform(native_transform, geometry)
            zoning_counts["source"] += 1
            source_area = entry["sourceShapeAreaSqFt"]
            if entry["reasons"]:
                repaired = make_valid(native_geometry)
                delta = abs(repaired.area - source_area)
                relative = 100.0 * delta / source_area
                if repaired.geom_type not in {"Polygon", "MultiPolygon"} or not repaired.is_valid or delta > 0.001 or relative > 0.000001:
                    raise ValueError("Zoning repair differs from sealed bounded policy")
                rejected_zoning.append((entry, geometry, native_geometry))
                mapping_geometries.append((entry, repaired, "EXPLICIT_MAKE_VALID", "GEOS_MAKE_VALID_LINEWORK", source_area, delta, relative))
                zoning_counts["quarantine"] += 1
                continue
            if not native_geometry.is_valid:
                raise ValueError("Accepted zoning geometry became invalid after transform")
            csv_row(writer, [zoning_receipt["acquisitionId"], entry["sourceObjectId"], entry["zoneCode"], source_date(entry["implementationDate"]),
                             entry["ordinanceNumber"], entry["sourceShapeLength"], source_area, ewkb(geometry, 4326), ewkb(native_geometry, 2230), entry["geometrySha256"]])
            delta = abs(native_geometry.area - source_area)
            mapping_geometries.append((entry, native_geometry, "VALID_SOURCE", None, source_area, delta, 100.0 * delta / source_area))
            zoning_counts["accepted"] += 1

        process.stdin.write("\\.\ncopy trulot_v2.base_zoning_quarantine from stdin with (format csv, null '\\N');\n")
        for entry, geometry, native_geometry in rejected_zoning:
            metadata = {key: entry.get(key) for key in ("bounds", "geometrySha256", "geometryType", "sourceShapeAreaSqFt", "sourceShapeLength")}
            metadata["nativeEnvelopeWkbSha256"] = hashlib.sha256(native_geometry.envelope.wkb).hexdigest()
            csv_row(writer, [zoning_receipt["acquisitionId"], entry["sourceObjectId"], entry["zoneCode"], canonical(entry["reasons"]), canonical(metadata),
                             hashlib.sha256((canonical(entry) + "\n").encode()).hexdigest()])

        process.stdin.write("\\.\ncopy trulot_v2.base_zoning_mapping_geometry from stdin with (format csv, null '\\N');\n")
        for entry, geometry, state, method, source_area, delta, relative in mapping_geometries:
            csv_row(writer, [zoning_receipt["acquisitionId"], entry["sourceObjectId"], entry["zoneCode"], ewkb(geometry, 2230), state, method,
                             source_area, geometry.area, delta, relative])

        process.stdin.write("\\.\ncopy trulot_v2.parcel_zone_mapping_v2 from stdin with (format csv, null '\\N');\n")
        seen_apns: set[str] = set()
        with gzip.open(paths["parcelZoneMapping"], "rt") as source:
            for line in source:
                entry = json.loads(line)
                source_zoning_acquisition = entry.get("zoningAcquisitionId")
                valid_unmapped_context = entry["mappingState"] == "UNMAPPED" and source_zoning_acquisition is None
                if entry["parcelAcquisitionId"] != EXPECTED["parcelAcquisitionId"] or (source_zoning_acquisition != EXPECTED["zoningAcquisitionId"] and not valid_unmapped_context):
                    raise ValueError("Parcel-zone acquisition identity changed")
                if entry["mappingMethodVersion"] != EXPECTED["mappingMethodVersion"] or entry["apn"] in seen_apns:
                    raise ValueError("Parcel-zone mapping identity or cardinality changed")
                seen_apns.add(entry["apn"])
                mapping_states[entry["mappingState"]] += 1
                mapping_fingerprint.update((canonical(entry) + "\n").encode())
                serving_entry = {**entry, "zoningAcquisitionId": EXPECTED["zoningAcquisitionId"]}
                csv_row(writer, [entry["parcelAcquisitionId"], entry["parcelSourceObjectId"], entry["apn"], entry["parcelId"], entry["geometrySha256"],
                                 serving_entry["zoningAcquisitionId"], entry["mappingMethodVersion"], entry["mappingState"], entry["dominantZoneCode"],
                                 entry["dominantCoveragePercent"], entry["secondaryCoveragePercent"], entry["totalCoveredPercent"], entry["uncoveredPercent"],
                                 entry["distinctZoneCount"], entry["repairedSourceFeatureCount"], canonical(entry["zoneEvidence"]), canonical(serving_entry)])
        process.stdin.write("\\.\ncommit;\n")
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("V2 import transaction failed; inspect psql.log")
    except BaseException:
        if process.poll() is None:
            process.terminate()
            process.wait()
        raise
    finally:
        log_stream.close()

    if parcel_counts != Counter({"source": EXPECTED["counts"]["parcelSource"], "accepted": EXPECTED["counts"]["parcelAccepted"], "quarantine": EXPECTED["counts"]["parcelQuarantine"]}):
        raise ValueError("Parcel import stream counts changed")
    if zoning_counts != Counter({"source": EXPECTED["counts"]["zoningSource"], "accepted": EXPECTED["counts"]["zoningAccepted"], "quarantine": EXPECTED["counts"]["zoningQuarantine"]}):
        raise ValueError("Zoning import stream counts changed")
    if dict(sorted(mapping_states.items())) != EXPECTED["zoningStateCounts"]:
        raise ValueError("Mapping state counts changed")
    if mapping_fingerprint.hexdigest() != EXPECTED["fingerprints"]["parcelZoneMapping"]:
        raise ValueError("Parcel-zone mapping fingerprint changed")
    return import_run_id


def main() -> None:
    parser = argparse.ArgumentParser()
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument("--boundary")
    target_group.add_argument("--database-url-env")
    parser.add_argument("--authorize-production-load", action="store_true")
    parser.add_argument("--resume-validation", action="store_true")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output = pathlib.Path(args.output).resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Import evidence must remain outside Git")
    output.mkdir(exist_ok=False)
    started = time.monotonic()
    materialization_id, paths, artifact_hashes = load_manifest(pathlib.Path(args.manifest).resolve())
    target = target_from_args(args)
    if args.resume_validation:
        if target.sql("select count(*) from trulot_v2.selected_snapshot") != "0":
            raise ValueError("Cannot resume validation after a snapshot has been selected")
        loading_runs = target.sql(
            "select string_agg(import_run_id::text,',') from trulot_v2.import_run "
            f"where status='LOADING' and materialization_id='{materialization_id}'"
        )
        if not loading_runs or "," in loading_runs:
            raise ValueError("Resume requires exactly one matching unselected LOADING import")
        import_run_id = loading_runs
    else:
        import_run_id = load_data(target, paths, materialization_id, artifact_hashes, output)

    counts = query_counts(target)
    fingerprints = {
        "parcelApnSet": parcel_fingerprint(target, "apn_norm"),
        "parcelFullRow": parcel_fingerprint(target, "row_to_json(s)::text"),
        "parcelZoneMapping": EXPECTED["fingerprints"]["parcelZoneMapping"],
        "integrated": integrated_fingerprint(target),
    }
    assert_reconciliation(counts, fingerprints)
    final_sql = f"""
      begin;
      insert into trulot_v2.selected_snapshot(singleton,parcel_acquisition_id,zoning_acquisition_id,import_run_id)
      values(true,'{EXPECTED['parcelAcquisitionId']}','{EXPECTED['zoningAcquisitionId']}','{import_run_id}');
      update trulot_v2.import_run set completed_at=clock_timestamp(),status='VALIDATED',
        observed_counts='{canonical(counts)}'::jsonb,observed_fingerprints='{canonical(fingerprints)}'::jsonb
      where import_run_id='{import_run_id}';
      commit;
      analyze trulot_v2.parcel_base_sangis_v2;
      analyze trulot_v2.parcel_zone_mapping_v2;
    """
    target.run(final_sql, output / "psql.log")
    served = int(target.sql("select count(*) from trulot_v2.parcel_intelligence_serving_v2"))
    if served != EXPECTED["counts"]["integrated"]:
        raise ValueError("Selected serving view count mismatch")

    timestamps = json.loads(target.sql(
        "select json_build_object('startedAt',started_at,'completedAt',completed_at) "
        f"from trulot_v2.import_run where import_run_id='{import_run_id}'"
    ))
    receipt = {
        "decision": "PARCEL_SERVING_V2_PRODUCTION_SHADOW_IMPORT_PASS",
        "target": target.label,
        "importRunId": import_run_id,
        "materializationId": materialization_id,
        "importerVersion": sha256(pathlib.Path(__file__)),
        "timestamps": timestamps,
        "migrationSha256": sha256(MIGRATION),
        "artifacts": artifact_hashes,
        "acquisitionIds": {"parcel": EXPECTED["parcelAcquisitionId"], "zoning": EXPECTED["zoningAcquisitionId"]},
        "counts": counts,
        "fingerprints": fingerprints,
        "servedRows": served,
        "durationSeconds": round(time.monotonic() - started, 3),
    }
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps(receipt, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
