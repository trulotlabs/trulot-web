"""Build a disposable in-memory compact serving index and capture query plans.

Usage: python3 scripts/zoning-serving-v2/query-rehearsal.py INTEGRATED_GZ NEW_OUTPUT_DIR
"""
import gzip
import json
import pathlib
import sqlite3
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
TARGETS = {"5470501600", "6271001600", "2748323700"}


def timed(connection, query, parameters=()):
    started = time.perf_counter()
    rows = connection.execute(query, parameters).fetchall()
    return rows, round((time.perf_counter() - started) * 1000, 6)


def run(integrated_path, output_dir):
    integrated_path = pathlib.Path(integrated_path).resolve()
    output = pathlib.Path(output_dir).resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Query evidence must remain outside Git during execution")
    output.mkdir(exist_ok=False)
    database = sqlite3.connect(":memory:")
    database.executescript("""
      CREATE TABLE parcel_intelligence (
        apn TEXT PRIMARY KEY, parcel_id INTEGER NOT NULL, address TEXT, geometry_sha256 TEXT NOT NULL,
        approximate_area_sqft REAL NOT NULL, taxable_acreage REAL, mapping_state TEXT NOT NULL,
        analytical_dominant_zone_code TEXT, zoning_evidence TEXT NOT NULL
      );
      CREATE TABLE parcel_zone (apn TEXT NOT NULL, zone_code TEXT NOT NULL, coverage_percent REAL NOT NULL,
        PRIMARY KEY(apn,zone_code));
      CREATE INDEX parcel_intelligence_state_idx ON parcel_intelligence(mapping_state);
      CREATE INDEX parcel_intelligence_geometry_idx ON parcel_intelligence(geometry_sha256);
      CREATE INDEX parcel_zone_code_idx ON parcel_zone(zone_code);
    """)
    build_started = time.perf_counter()
    with gzip.open(integrated_path, "rt") as stream:
        for line in stream:
            row = json.loads(line); parcel = row["parcel"]; zoning = row["baseZoning"]
            database.execute("INSERT INTO parcel_intelligence VALUES(?,?,?,?,?,?,?,?,?)", (
                row["apn"], parcel["parcel_id"], parcel["address"], parcel["geometry_sha256"],
                parcel["approximate_geometry_area_sqft"], parcel["taxable_acreage"], zoning["mappingState"],
                zoning["dominantZoneCode"], json.dumps(zoning["zoneEvidence"], sort_keys=True, separators=(",", ":"))))
            database.executemany("INSERT INTO parcel_zone VALUES(?,?,?)", ((row["apn"], item["zoneCode"], item["parcelCoveragePercent"])
                                                                          for item in zoning["zoneEvidence"]))
    database.commit()
    cases = {
        "apnIdentityAndZoning": ("SELECT * FROM parcel_intelligence WHERE apn=?", ("5470501600",)),
        "zoneToParcelCount": ("SELECT count(DISTINCT apn) FROM parcel_zone WHERE zone_code=?", ("RS-1-6",)),
        "splitZoneLookup": ("SELECT p.apn,p.mapping_state,z.zone_code,z.coverage_percent FROM parcel_intelligence p JOIN parcel_zone z USING(apn) WHERE p.apn=? ORDER BY z.coverage_percent DESC,z.zone_code", ("6271001600",)),
        "stackedLookup": ("SELECT apn,mapping_state,zoning_evidence FROM parcel_intelligence WHERE geometry_sha256=(SELECT geometry_sha256 FROM parcel_intelligence WHERE apn=?) ORDER BY apn", ("5891700512",)),
        "unmappedLookup": ("SELECT apn,mapping_state,zoning_evidence FROM parcel_intelligence WHERE mapping_state='UNMAPPED' ORDER BY apn LIMIT 1", ()),
    }
    results = {}
    for name, (query, parameters) in cases.items():
        rows, duration = timed(database, query, parameters)
        plan = database.execute("EXPLAIN QUERY PLAN " + query, parameters).fetchall()
        results[name] = {"durationMs": duration, "rowCount": len(rows), "rows": rows[:5], "plan": plan}
    counts = dict(database.execute("SELECT mapping_state,count(*) FROM parcel_intelligence GROUP BY mapping_state"))
    report = {
        "engine": "Python sqlite3 in-memory compact rehearsal index",
        "source": "full deterministic integrated NDJSON; geometry represented by identity hash and area in compact query index",
        "buildDurationSeconds": round(time.perf_counter() - build_started, 3),
        "rowCount": database.execute("SELECT count(*) FROM parcel_intelligence").fetchone()[0],
        "zoningStateCounts": counts,
        "queries": results,
        "productionPerformanceClaim": False,
    }
    (output / "query-rehearsal.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"rowCount": report["rowCount"], "zoningStateCounts": counts,
                      "timingsMs": {name: value["durationMs"] for name, value in results.items()}}, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])
