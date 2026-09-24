"""Audit every retained row, including malformed APNs; no geometry changes or DB access."""
import gzip
import hashlib
import json
import pathlib
import sys


def add(groups, key, apn):
    if key is None:
        return
    if key not in groups:
        groups[key] = [0, set()]
    groups[key][0] += 1
    if apn is not None:
        groups[key][1].add(apn)


def distribution(groups):
    frequencies = {}
    result = {'groups': len(groups), 'representedRows': 0, 'repeatedGroups': 0, 'repeatedRows': 0,
              'distinctCanonicalApnStackedGroups': 0, 'distinctCanonicalApnStackedRows': 0}
    for rows, apns in groups.values():
        frequencies[rows] = frequencies.get(rows, 0) + 1
        result['representedRows'] += rows
        if rows > 1:
            result['repeatedGroups'] += 1
            result['repeatedRows'] += rows
        if len(apns) > 1:
            result['distinctCanonicalApnStackedGroups'] += 1
            result['distinctCanonicalApnStackedRows'] += rows
    result['groupSizeFrequencies'] = dict(sorted(frequencies.items()))
    return result


def audit(directory):
    directory = pathlib.Path(directory)
    report = json.loads((directory / 'report.json').read_text())
    file = directory / 'rows.ndjson.gz'
    with file.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != report['outputHashes']['rows.ndjson.gz']['sha256']:
            raise ValueError('Row checksum mismatch')
    parcels = {}
    geometry = {}
    rows = 0
    with gzip.open(file, 'rt') as stream:
        for line in stream:
            entry = json.loads(line)
            row = entry['row']
            add(parcels, row['parcelId'], row['apnNorm'])
            add(geometry, entry['geometryStats']['geometryHash'], row['apnNorm'])
            rows += 1
    if rows != report['counts']['parsed']:
        raise ValueError('Row count mismatch')
    return {'acquisitionId': report['acquisitionId'], 'sourceArtifactSha256': report['sourceArtifact']['sha256'],
            'rowsAudited': rows, 'population': 'All source rows, including malformed APNs. Distinct-APN sets use only canonical APNs.',
            'geometryIdentity': 'GEOS-normalized WKB identity for representable valid geometry; absent hashes excluded, never repaired.',
            'parcelIds': distribution(parcels), 'identicalGeometry': distribution(geometry),
            'accepted': report['stacked']['acceptedParcelIds'], 'merged': report['counts']['merged']}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 audit-sangis-stacks.py PASS_DIR')
    print(json.dumps(audit(sys.argv[1]), indent=2))
