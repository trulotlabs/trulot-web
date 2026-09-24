"""Export the exact Parcel Serving V2 projection with a guarded read-only query.

Usage: python3 scripts/zoning-serving-v2/export-parcels.py BOUNDARY NEW_OUTPUT_DIR
"""
import gzip
import hashlib
import json
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/parcel-v2-postgis"))
from local import ENV, connection, sql

BASE = "parcel_v2_rehearsal.parcel_base_sangis_v2"
ACQUISITION = "parcel_v2_rehearsal.acquisition"
PROJECTION = """p.acquisition_id,p.source_object_id,p.apn_norm,p.parcel_id,p.address,p.situs_components::text,
p.situs_zip,p.situs_juris,ST_AsGeoJSON(p.geom,17),ST_AsGeoJSON(p.centroid,17),
ST_AsGeoJSON(p.point_on_surface,17),p.centroid_within,p.approximate_geometry_area_sqft,
p.taxable_acreage,p.geometry_sha256,a.native_crs,a.artifact_crs"""
QUERY = f"""SELECT {PROJECTION} FROM {BASE} p JOIN {ACQUISITION} a USING(acquisition_id)
WHERE p.situs_juris='SD' ORDER BY p.acquisition_id,p.source_object_id"""
EXPECTED_APN_FINGERPRINT = "93047eb112077a71314bd492602df41b864e75402fbff78996290185acc6cd25"
EXPECTED_ROW_FINGERPRINT = "a30e506477248e46a66416821b8d12f58cec07e60a065860af5c0d595062006f"


def sha(path):
    with pathlib.Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def database_fingerprint(args, projection):
    query = f"""SELECT {projection} FROM (SELECT p.acquisition_id,p.source_object_id,p.apn_norm,p.parcel_id,p.address,
      p.situs_components,p.situs_zip,p.situs_juris,p.geom,p.centroid,p.point_on_surface,p.centroid_within,
      p.approximate_geometry_area_sqft,p.taxable_acreage,p.geometry_sha256,a.native_crs,a.artifact_crs
      FROM {BASE} p JOIN {ACQUISITION} a USING(acquisition_id) WHERE p.situs_juris='SD') s
      ORDER BY acquisition_id,source_object_id"""
    digest = hashlib.sha256()
    process = subprocess.Popen(args + ["-c", f"COPY ({query}) TO STDOUT"], stdout=subprocess.PIPE, env=ENV)
    while chunk := process.stdout.read(1024 * 1024):
        digest.update(chunk)
    if process.wait() != 0:
        raise RuntimeError("Parcel fingerprint query failed")
    return digest.hexdigest()


def run(boundary, output_dir):
    args = connection(boundary)
    output = pathlib.Path(output_dir).resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Full serving export must remain outside Git")
    output.mkdir(exist_ok=False)
    if int(sql(args, f"SELECT count(*) FROM {BASE}")) != 1088430:
        raise ValueError("Parcel Base V2 population changed")
    if int(sql(args, f"SELECT count(*) FROM {BASE} WHERE situs_juris='SD'")) != 393733:
        raise ValueError("Parcel Serving V2 scope changed")
    apn_fingerprint = database_fingerprint(args, "apn_norm")
    row_fingerprint = database_fingerprint(args, "row_to_json(s)::text")
    if apn_fingerprint != EXPECTED_APN_FINGERPRINT or row_fingerprint != EXPECTED_ROW_FINGERPRINT:
        raise ValueError("Parcel Serving V2 identity changed")
    started = time.monotonic()
    raw = output / "parcel-serving.tsv"
    command = "COPY (" + QUERY + ") TO STDOUT WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N')"
    with raw.open("wb") as target, (output / "query.stderr").open("wb") as errors:
        subprocess.run(args + ["-c", command], stdout=target, stderr=errors, check=True, env=ENV)
    compressed = output / "parcel-serving.tsv.gz"
    with raw.open("rb") as source, compressed.open("xb") as binary:
        with gzip.GzipFile(filename="", mode="wb", fileobj=binary, mtime=0) as zipped:
            while chunk := source.read(1024 * 1024):
                zipped.write(chunk)
    raw.unlink()
    receipt = {
        "databaseAccess": "read-only SELECT/COPY against guarded disposable Unix-socket cluster",
        "querySha256": hashlib.sha256(QUERY.encode()).hexdigest(),
        "parcelCount": 393733,
        "countywideBaseCount": 1088430,
        "packet8ApnSetFingerprint": apn_fingerprint,
        "packet8FullRowFingerprint": row_fingerprint,
        "compressedSha256": sha(compressed),
        "compressedBytes": compressed.stat().st_size,
        "durationSeconds": round(time.monotonic() - started, 3),
    }
    (output / "export.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])
