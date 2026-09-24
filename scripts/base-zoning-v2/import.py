"""Load immutable base zoning and clean SD parcels into the guarded local cluster.

Usage: python3 scripts/base-zoning-v2/import.py BOUNDARY ACQUISITION PASS_DIR NEW_OUTPUT_DIR
"""
import csv
import datetime as dt
import gzip
import hashlib
import json
import pathlib
import subprocess
import sys
import time

import pyproj
import shapely
from shapely.geometry import shape
from shapely.ops import transform
from shapely.validation import make_valid

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/parcel-v2-postgis"))
from local import ENV, connection, sql


def sha(path):
    with pathlib.Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def row(writer, values):
    writer.writerow(["\\N" if value is None else value for value in values])


def source_date(value):
    if value is None:
        return None
    if not isinstance(value, int):
        raise ValueError("Unexpected implementation-date encoding")
    return dt.datetime.fromtimestamp(value / 1000, dt.timezone.utc).date().isoformat()


def run(boundary, acquisition_dir, pass_dir, output_dir):
    args = connection(boundary)
    acquisition_dir = pathlib.Path(acquisition_dir).resolve()
    pass_dir = pathlib.Path(pass_dir).resolve()
    output = pathlib.Path(output_dir).resolve()
    if ROOT == output or ROOT in output.parents:
        raise ValueError("Import evidence must remain outside Git")
    output.mkdir(exist_ok=False)
    acquisition = json.loads((acquisition_dir / "acquisition.json").read_text())
    receipt = acquisition["receipt"]
    report_path = pass_dir / "report.json"
    report = json.loads(report_path.read_text())
    artifact = acquisition_dir / receipt["artifact"]["filename"]
    accepted_path = pass_dir / "accepted.ndjson.gz"
    rejected_path = pass_dir / "rejected.ndjson.gz"
    if sha(artifact) != receipt["artifact"]["sha256"] or sha(accepted_path) != report["outputs"][accepted_path.name]["sha256"] or sha(rejected_path) != report["outputs"][rejected_path.name]["sha256"]:
        raise ValueError("Immutable zoning input mismatch")
    if int(sql(args, "SELECT count(*) FROM parcel_v2_rehearsal.parcel_base_sangis_v2")) != 1088430:
        raise ValueError("Parcel Base V2 not loaded")
    payload = json.loads(artifact.read_text())
    normalized = {}
    for filename in (accepted_path, rejected_path):
        with gzip.open(filename, "rt") as source:
            for line in source:
                entry = json.loads(line)
                normalized[entry["index"]] = entry
    if len(normalized) != report["counts"]["parsed"]:
        raise ValueError("Normalized zoning population mismatch")

    native = pyproj.Transformer.from_crs(4326, 2230, always_xy=True).transform
    started = time.monotonic()
    log = (output / "psql.log").open("w")
    process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=log, stderr=log, text=True, env=ENV)
    writer = csv.writer(process.stdin, lineterminator="\n")
    try:
        process.stdin.write("BEGIN; DROP SCHEMA IF EXISTS base_zoning_v2_rehearsal CASCADE;\n")
        process.stdin.write(pathlib.Path(__file__).with_name("schema.sql").read_text() + "\n")
        process.stdin.write("COPY base_zoning_v2_rehearsal.acquisition FROM STDIN WITH (FORMAT csv, NULL '\\N');\n")
        row(writer, [receipt["acquisitionId"], receipt["datasetId"], receipt["publisher"], receipt["sourceItemId"], receipt["sourceUrl"],
                     receipt["acquiredAt"], receipt["sourceReported"]["serviceModified"], receipt["artifact"]["sha256"], receipt["artifact"]["byteSize"],
                     report["counts"]["parsed"], report["counts"]["accepted"], report["counts"]["rejected"], receipt["nativeCrs"], receipt["artifactCrs"], sha(pass_dir / "executed-validate.py")])
        process.stdin.write("\\.\nCOPY base_zoning_v2_rehearsal.base_zoning_city_sd_v2 FROM STDIN WITH (FORMAT csv, NULL '\\N');\n")
        rejected_rows = []
        mapping_rows = []
        for index, feature in enumerate(payload["features"]):
            entry = normalized[index]
            geometry = shape(feature["geometry"])
            if hashlib.sha256(shapely.normalize(geometry).wkb).hexdigest() != entry["geometrySha256"]:
                raise ValueError("Zoning geometry hash mismatch")
            native_geometry = transform(native, geometry)
            if entry["reasons"]:
                repaired = make_valid(native_geometry)
                source_area = entry["sourceShapeAreaSqFt"]
                delta = abs(repaired.area - source_area)
                relative = 100.0 * delta / source_area
                if repaired.geom_type not in {"Polygon", "MultiPolygon"} or not repaired.is_valid or delta > 0.001 or relative > 0.000001:
                    raise ValueError("Rejected geometry cannot pass explicit bounded mapping derivation")
                rejected_rows.append((entry, geometry, native_geometry, native_geometry.envelope))
                mapping_rows.append((entry, repaired, "EXPLICIT_MAKE_VALID", "GEOS_MAKE_VALID_LINEWORK", source_area, delta, relative))
                continue
            if not native_geometry.is_valid:
                raise ValueError("Valid WGS84 source became invalid after CRS transform")
            row(writer, [receipt["acquisitionId"], entry["sourceObjectId"], entry["zoneCode"], source_date(entry["implementationDate"]), entry["ordinanceNumber"],
                         entry["sourceShapeLength"], entry["sourceShapeAreaSqFt"], shapely.set_srid(geometry, 4326).wkb_hex,
                         shapely.set_srid(native_geometry, 2230).wkb_hex, entry["geometrySha256"]])
            source_area = entry["sourceShapeAreaSqFt"]
            mapping_rows.append((entry, native_geometry, "VALID_SOURCE", None, source_area, abs(native_geometry.area - source_area),
                                 100.0 * abs(native_geometry.area - source_area) / source_area))
        process.stdin.write("\\.\nCOPY base_zoning_v2_rehearsal.rejection FROM STDIN WITH (FORMAT csv, NULL '\\N');\n")
        for entry, geometry, native_geometry, envelope in rejected_rows:
            row(writer, [receipt["acquisitionId"], entry["sourceObjectId"], entry["zoneCode"], json.dumps(entry["reasons"], separators=(",", ":")),
                         shapely.set_srid(geometry, 4326).wkb_hex, shapely.set_srid(native_geometry, 2230).wkb_hex,
                         shapely.set_srid(envelope, 2230).wkb_hex, entry["geometrySha256"]])
        process.stdin.write("\\.\nCOPY base_zoning_v2_rehearsal.mapping_geometry FROM STDIN WITH (FORMAT csv, NULL '\\N');\n")
        for entry, mapping_geometry, state, method, source_area, delta, relative in mapping_rows:
            row(writer, [receipt["acquisitionId"], entry["sourceObjectId"], entry["zoneCode"], shapely.set_srid(mapping_geometry, 2230).wkb_hex,
                         state, method, source_area, mapping_geometry.area, delta, relative])
        process.stdin.write("\\.\n")
        process.stdin.write("""
INSERT INTO base_zoning_v2_rehearsal.city_parcel_input
SELECT acquisition_id,source_object_id,apn_norm,parcel_id,geometry_sha256,
       ST_Transform(geom,2230),ST_Area(ST_Transform(geom,2230))
FROM parcel_v2_rehearsal.parcel_base_sangis_v2 WHERE situs_juris='SD';
COMMIT;
ANALYZE base_zoning_v2_rehearsal.base_zoning_city_sd_v2;
ANALYZE base_zoning_v2_rehearsal.rejection;
ANALYZE base_zoning_v2_rehearsal.mapping_geometry;
ANALYZE base_zoning_v2_rehearsal.city_parcel_input;
""")
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("Zoning import failed; inspect psql.log")
    except BaseException:
        if process.poll() is None:
            process.terminate()
            process.wait()
        raise
    finally:
        log.close()

    result = {
        "acquisitionId": receipt["acquisitionId"], "artifactSha256": receipt["artifact"]["sha256"],
        "validationReportSha256": sha(report_path), "acceptedRowsSha256": sha(accepted_path), "rejectedRowsSha256": sha(rejected_path),
        "importerSha256": sha(__file__), "ddlSha256": sha(pathlib.Path(__file__).with_name("schema.sql")),
        "counts": {"zoning": int(sql(args, "SELECT count(*) FROM base_zoning_v2_rehearsal.base_zoning_city_sd_v2")),
                   "rejected": int(sql(args, "SELECT count(*) FROM base_zoning_v2_rehearsal.rejection")),
                   "mappingGeometry": int(sql(args, "SELECT count(*) FROM base_zoning_v2_rehearsal.mapping_geometry")),
                   "cityParcels": int(sql(args, "SELECT count(*) FROM base_zoning_v2_rehearsal.city_parcel_input"))},
        "tool": "Python " + sys.version.split()[0] + "; Shapely " + shapely.__version__ + "; pyproj " + pyproj.__version__,
        "durationSeconds": round(time.monotonic() - started, 3),
    }
    if result["counts"] != {"zoning": report["counts"]["accepted"], "rejected": report["counts"]["rejected"],
                             "mappingGeometry": report["counts"]["parsed"], "cityParcels": 393733}:
        raise ValueError("Database population mismatch")
    (output / "import.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])
