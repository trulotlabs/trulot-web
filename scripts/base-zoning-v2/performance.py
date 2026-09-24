"""Capture read-only EXPLAIN ANALYZE plans from the guarded local rehearsal.

Usage: python3 scripts/base-zoning-v2/performance.py BOUNDARY NEW_OUTPUT_DIR
"""
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/parcel-v2-postgis"))
from local import ENV, connection

SCHEMA = "base_zoning_v2_rehearsal"
QUERIES = {
    "apnParcelInputLookup": f"SELECT apn_norm,parcel_source_object_id FROM {SCHEMA}.city_parcel_input WHERE apn_norm='5490330700'",
    "apnBaseZoneSpatialLookup": f"""SELECT z.zone_code,sum(ST_Area(ST_Intersection(p.geom_native,z.geom_native))) area_sqft
      FROM {SCHEMA}.city_parcel_input p JOIN {SCHEMA}.mapping_geometry z
        ON p.geom_native && z.geom_native AND ST_Intersects(p.geom_native,z.geom_native)
      WHERE p.apn_norm='5490330700' GROUP BY z.zone_code ORDER BY area_sqft DESC,z.zone_code""",
    "zoneToParcelCount": f"""SELECT count(DISTINCT (p.parcel_acquisition_id,p.parcel_source_object_id))
      FROM {SCHEMA}.mapping_geometry z JOIN {SCHEMA}.city_parcel_input p
        ON p.geom_native && z.geom_native AND ST_Intersects(p.geom_native,z.geom_native)
      WHERE z.zone_code='RS-1-6'""",
    "spatialIntersectionProbe": f"""SELECT z.source_object_id,z.zone_code,ST_Area(ST_Intersection(p.geom_native,z.geom_native)) area_sqft
      FROM {SCHEMA}.city_parcel_input p JOIN {SCHEMA}.mapping_geometry z
        ON p.geom_native && z.geom_native AND ST_Intersects(p.geom_native,z.geom_native)
      WHERE p.apn_norm='5490330700' ORDER BY z.source_object_id""",
}


def run(boundary, output_dir):
    args = connection(boundary)
    output = pathlib.Path(output_dir).resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Performance evidence must remain outside Git during execution")
    output.mkdir(exist_ok=False)
    report = {"databaseAccess": "read-only EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) against guarded disposable Unix-socket cluster", "queries": {}}
    for name, query in QUERIES.items():
        command = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + query
        raw = subprocess.check_output(args + ["-Atc", command], env=ENV, text=True)
        plan = json.loads(raw)[0]
        report["queries"][name] = {
            "querySha256": hashlib.sha256(query.encode()).hexdigest(),
            "planningTimeMs": plan["Planning Time"],
            "executionTimeMs": plan["Execution Time"],
            "plan": plan["Plan"],
        }
    (output / "query-plans.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({name: {key: value[key] for key in ("planningTimeMs", "executionTimeMs")}
                      for name, value in report["queries"].items()}, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])
