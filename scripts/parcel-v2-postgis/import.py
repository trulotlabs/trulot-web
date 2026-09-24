"""Import exactly Packet 6 accepted rows with original geometry; private local DB only.
Usage: python3 scripts/parcel-v2-postgis/import.py BOUNDARY_JSON ACQUISITION_DIR PASS_DIR NEW_RUN_DIR
Every run transactionally recreates ONLY the dedicated rehearsal schema after boundary checks.
"""
import csv
import gzip
import hashlib
import importlib.util
import itertools
import json
import pathlib
import subprocess
import sys
import time
from collections import Counter
import shapely
from shapely.geometry import shape, Point
from local import connection, sql, ENV

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('stream', ROOT / 'scripts/sangis-acquisition-stream.py')
stream = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stream)


def digest(file):
    with pathlib.Path(file).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def copy(writer, values):
    writer.writerow(['\\N' if v is None else v for v in values])


def ewkb(geom):
    return shapely.set_srid(geom, 4326).wkb_hex


def run(boundary, acquisition_dir, pass_dir, output):
    args = connection(boundary)
    acquisition_dir = pathlib.Path(acquisition_dir).resolve()
    pass_dir = pathlib.Path(pass_dir).resolve()
    output = pathlib.Path(output).resolve()
    if ROOT == output or ROOT in output.parents:
        raise ValueError('Large outputs must remain outside Git')
    output.mkdir(exist_ok=False)
    acquisition = json.loads((acquisition_dir / 'acquisition.json').read_text())
    receipt = acquisition['receipt']
    report_file = pass_dir / 'report.json'
    report = json.loads(report_file.read_text())
    artifact = acquisition_dir / receipt['originalFilename']
    rowfile = pass_dir / 'rows.ndjson.gz'
    rejectfile = pass_dir / 'rejected.ndjson.gz'
    if receipt['contentSha256'] != '07913d1007d0e2f5b80c681c19c76bb1338f4b06d99c401c1784744bbd1a4544':
        raise ValueError('Packet 7 authorizes only the verified Packet 6 snapshot')
    if digest(artifact) != receipt['contentSha256'] or artifact.stat().st_size != receipt['byteSize']:
        raise ValueError('Immutable raw artifact mismatch')
    if report != json.loads((ROOT / 'data/parcel-base-v2/acquisitions/sangis-20260924T183743Z/report.json').read_text()):
        raise ValueError('Not the committed Packet 6 normalization report')
    for file in (rowfile, rejectfile):
        if digest(file) != report['outputHashes'][file.name]['sha256']:
            raise ValueError('Packet 6 normalized output mismatch')
    started = time.monotonic()
    log = (output / 'psql.log').open('w')
    proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=log, stderr=log, text=True, env=ENV)
    writer = csv.writer(proc.stdin, lineterminator='\n')
    counts = Counter(); jurisdiction = Counter(); geometry = Counter(); apns = hashlib.sha256()
    try:
        proc.stdin.write('BEGIN; DROP SCHEMA IF EXISTS parcel_v2_rehearsal CASCADE;\n')
        proc.stdin.write((pathlib.Path(__file__).with_name('schema.sql')).read_text() + '\n')
        proc.stdin.write("COPY parcel_v2_rehearsal.acquisition FROM STDIN WITH (FORMAT csv, NULL '\\N');\n")
        copy(writer, [acquisition['acquisitionId'], receipt['contentSha256'], digest(report_file), digest(rowfile), report['counts']['source'], report['counts']['accepted'], report['counts']['rejected'], 'EPSG:2230', 'EPSG:4326'])
        proc.stdin.write('\\.\n')
        proc.stdin.write("COPY parcel_v2_rehearsal.parcel_base_sangis_v2 FROM STDIN WITH (FORMAT csv, NULL '\\N');\n")
        with artifact.open(encoding='utf-8-sig') as raw, gzip.open(rowfile, 'rt') as rows:
            for index, pair in enumerate(itertools.zip_longest(stream.features(raw), rows)):
                feature, line = pair
                if feature is None or line is None:
                    raise ValueError('Raw/normalized row count mismatch')
                entry = json.loads(line); row = entry['row']; props = feature['properties']
                if entry['index'] != index or props['objectid'] != row['sourceObjectId'] or props['apn'] != row['apnRaw'] or props['parcelid'] != row['parcelId']:
                    raise ValueError('Raw/normalized row identity mismatch')
                counts['parsed'] += 1
                if not entry['accepted']:
                    counts['rejected'] += 1
                    continue
                if entry['reasons']:
                    raise ValueError('Accepted row has rejection reasons')
                geom = shape(feature['geometry']); g = entry['geometry']
                if hashlib.sha256(shapely.normalize(geom).wkb).hexdigest() != entry['geometryStats']['geometryHash']:
                    raise ValueError('Source geometry/Packet 6 hash mismatch')
                copy(writer, [acquisition['acquisitionId'], row['sourceObjectId'], row['apnRaw'], row['apnNorm'], row['parcelId'],
                    json.dumps(row['situsComponents'], separators=(',', ':')), row['address'], row['situsComponents']['situs_zip'], row['jurisdiction'], row['taxableAcreage'],
                    ewkb(geom), ewkb(Point(g['centroid'])), ewkb(Point(g['pointOnSurface'])), 't' if g['centroidWithin'] else 'f', g['approxGeometryAreaSqFt'], entry['geometryStats']['geometryHash']])
                counts['accepted'] += 1
                counts['missingSitus'] += row['address'] is None
                counts['centroidOutside'] += not g['centroidWithin']
                jurisdiction[row['jurisdiction'] or 'unknown'] += 1
                geometry[feature['geometry']['type']] += 1
                apns.update((str(row['sourceObjectId']) + ':' + row['apnNorm'] + '\n').encode())
                if counts['parsed'] % 100000 == 0:
                    print('Processed',counts['parsed'],flush=True)
        proc.stdin.write('\\.\n')
        proc.stdin.write("COPY parcel_v2_rehearsal.rejection FROM STDIN WITH (FORMAT csv, NULL '\\N');\n")
        rejects = 0
        with gzip.open(rejectfile, 'rt') as source:
            for line in source:
                entry = json.loads(line)
                copy(writer, [acquisition['acquisitionId'], entry['row']['sourceObjectId'], entry['row']['apnRaw'], json.dumps(entry['reasons'])]); rejects += 1
        proc.stdin.write('\\.\n')
        if counts['accepted'] != report['counts']['accepted'] or counts['rejected'] != rejects or counts['parsed'] != report['counts']['parsed']:
            raise ValueError('Population changed from Packet 6')
        if digest(artifact) != receipt['contentSha256']:
            raise ValueError('Artifact changed during import')
        proc.stdin.write('COMMIT; ANALYZE parcel_v2_rehearsal.parcel_base_sangis_v2;\n')
        proc.stdin.close()
        if proc.wait() != 0:
            raise RuntimeError('PostGIS import failed; see psql.log')
    except BaseException:
        if proc.poll() is None:
            proc.terminate(); proc.wait()
        raise
    finally:
        log.close()
    result = {'acquisitionId': acquisition['acquisitionId'], 'artifactSha256': receipt['contentSha256'], 'reportSha256': digest(report_file),
        'rowsSha256': digest(rowfile), 'importerSha256': digest(__file__), 'ddlSha256': digest(pathlib.Path(__file__).with_name('schema.sql')),
        'tool': 'Python '+sys.version.split()[0]+' CSV over psql COPY; Shapely '+shapely.__version__,
        'durationSeconds': round(time.monotonic()-started,3), 'counts':dict(counts), 'jurisdiction':dict(sorted(jurisdiction.items())),
        'geometry':dict(geometry), 'sourceOrderApnFingerprint':apns.hexdigest(), 'databaseRows':int(sql(args,'SELECT count(*) FROM parcel_v2_rehearsal.parcel_base_sangis_v2'))}
    if result['databaseRows'] != counts['accepted']:
        raise ValueError('Database import count mismatch')
    (output / 'import.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__ == '__main__':
    if len(sys.argv)!=5:
        raise SystemExit(__doc__)
    run(*sys.argv[1:])
