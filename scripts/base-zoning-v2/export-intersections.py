"""Export full parcel/zoning intersection evidence using a read-only local query.

Usage: python3 scripts/base-zoning-v2/export-intersections.py BOUNDARY NEW_OUTPUT_DIR
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

SCHEMA = "base_zoning_v2_rehearsal"
QUERY = f"""
SELECT p.parcel_acquisition_id,p.parcel_source_object_id,p.apn_norm,p.parcel_id,p.geometry_sha256,p.parcel_area_sqft,
       i.zoning_acquisition_id,i.zoning_source_object_id,i.zone_code,i.source_geometry_state,i.intersected_area_sqft
FROM {SCHEMA}.city_parcel_input p
LEFT JOIN LATERAL (
  SELECT z.acquisition_id zoning_acquisition_id,z.source_object_id zoning_source_object_id,z.zone_code,z.source_geometry_state,
         a.intersected_area_sqft
  FROM {SCHEMA}.mapping_geometry z
  CROSS JOIN LATERAL (SELECT ST_Area(ST_Intersection(p.geom_native,z.geom_native)) intersected_area_sqft) a
  WHERE p.geom_native && z.geom_native AND ST_Intersects(p.geom_native,z.geom_native) AND a.intersected_area_sqft>0
  ORDER BY z.zone_code,z.source_object_id
) i ON true
ORDER BY p.parcel_acquisition_id,p.parcel_source_object_id,i.zone_code,i.zoning_source_object_id
"""


def sha(path):
    with pathlib.Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def run(boundary, output_dir):
    args = connection(boundary)
    output = pathlib.Path(output_dir).resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Full intersection evidence must remain outside Git")
    output.mkdir(exist_ok=False)
    if int(sql(args, f"SELECT count(*) FROM {SCHEMA}.city_parcel_input")) != 393733:
        raise ValueError("Unexpected City parcel population")
    if int(sql(args, f"SELECT count(*) FROM {SCHEMA}.mapping_geometry")) != 3706:
        raise ValueError("Unexpected zoning mapping geometry population")
    started = time.monotonic()
    raw = output / "intersections.tsv"
    command = "COPY (" + QUERY + ") TO STDOUT WITH (FORMAT csv, DELIMITER E'\\t', NULL '\\N')"
    with raw.open("wb") as target, (output / "query.stderr").open("wb") as errors:
        subprocess.run(args + ["-c", command], stdout=target, stderr=errors, check=True, env=ENV)
    compressed = output / "intersections.tsv.gz"
    with raw.open("rb") as source, compressed.open("xb") as binary:
        with gzip.GzipFile(filename="", mode="wb", fileobj=binary, mtime=0) as zipped:
            while chunk := source.read(1024 * 1024):
                zipped.write(chunk)
    raw.unlink()
    receipt = {
        "querySha256": hashlib.sha256(QUERY.encode()).hexdigest(),
        "compressedSha256": sha(compressed), "compressedBytes": compressed.stat().st_size,
        "mappingGeometryCount": 3706, "parcelCount": 393733,
        "databaseAccess": "read-only SELECT/COPY against guarded disposable Unix-socket cluster",
        "durationSeconds": round(time.monotonic() - started, 3),
    }
    (output / "export.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])
