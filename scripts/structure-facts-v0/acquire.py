#!/usr/bin/env python3
"""Acquire a bounded public City building-outline snapshot.

Network access is explicit. The script uses no database, credentials, or runtime
configuration. It first acquires the official City boundary and then requests
only outline IDs intersecting that boundary.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import gzip
import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

SERVICE = "https://webmaps.sandiego.gov/arcgis/rest/services/DoIT_Public/DoIT_Public/MapServer"
BOUNDARY_LAYER = SERVICE + "/7"
OUTLINE_LAYER = SERVICE + "/1"
FIELDS = "OBJECTID,outline_id,bldgID,AREA,COMMENT,Shape_Area,GlobalID,created_user,created_date,last_edited_user,last_edited_date"


def request(url: str, params: dict[str, str] | None = None) -> bytes:
    body = urllib.parse.urlencode(params).encode() if params else None
    method = "POST" if body else "GET"
    last = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body, method=method), timeout=180) as response:
                return response.read()
        except Exception as exc:
            last = exc
            time.sleep(min(2 ** attempt, 20))
    raise RuntimeError(last)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.output
    root.mkdir(parents=True, exist_ok=False)

    boundary = json.loads(request(BOUNDARY_LAYER + "/query?" + urllib.parse.urlencode({
        "where": "CODE='SD'", "outFields": "*", "returnGeometry": "true", "outSR": "4326", "f": "geojson",
    })))
    (root / "city-boundary.geojson").write_text(json.dumps(boundary, sort_keys=True, separators=(",", ":")) + "\n")
    geometry = unary_union([shape(feature["geometry"]) for feature in boundary["features"]])
    polygons = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
    rings = []
    for polygon in polygons:
        polygon = orient(polygon, sign=-1.0)
        rings.append([list(point) for point in polygon.exterior.coords])
        rings.extend([list(point) for point in interior.coords] for interior in polygon.interiors)
    esri = {"rings": rings, "spatialReference": {"wkid": 4326}}
    (root / "city-boundary-esri.json").write_text(json.dumps(esri, sort_keys=True, separators=(",", ":")) + "\n")

    (root / "layer-metadata.json").write_bytes(request(OUTLINE_LAYER + "?f=pjson"))
    (root / "service-metadata.json").write_bytes(request(SERVICE + "?f=pjson"))
    ids_payload = json.loads(request(OUTLINE_LAYER + "/query", {
        "geometry": json.dumps(esri, separators=(",", ":")), "geometryType": "esriGeometryPolygon",
        "inSR": "4326", "spatialRel": "esriSpatialRelIntersects", "returnIdsOnly": "true", "f": "json",
    }))
    object_ids = sorted(ids_payload["objectIds"])
    (root / "object-ids.json").write_text(json.dumps(ids_payload, sort_keys=True, separators=(",", ":")) + "\n")
    chunks = [object_ids[i:i + 1000] for i in range(0, len(object_ids), 1000)]
    (root / "chunks").mkdir()

    def download(item):
        index, ids = item
        data = request(OUTLINE_LAYER + "/query", {
            "objectIds": ",".join(map(str, ids)), "outFields": FIELDS,
            "returnGeometry": "true", "outSR": "2230", "f": "json",
        })
        payload = json.loads(data)
        returned = sorted(int(feature["attributes"]["OBJECTID"]) for feature in payload.get("features", []))
        if returned != ids:
            raise RuntimeError(f"chunk {index} object-ID mismatch")
        target = root / "chunks" / f"{index:04d}.json.gz"
        with target.open("wb") as raw:
            with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as zipped:
                zipped.write(data)
        return {"index": index, "featureCount": len(returned), "sha256": hashlib.sha256(data).hexdigest(), "uncompressedBytes": len(data)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(download, enumerate(chunks)))
    manifest = {
        "endpoint": OUTLINE_LAYER + "/query", "fields": FIELDS.split(","), "outSR": 2230,
        "objectIdCount": len(object_ids), "chunkSize": 1000, "chunks": records,
    }
    (root / "chunk-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"features": len(object_ids), "chunks": len(chunks), "output": str(root)}))


if __name__ == "__main__":
    main()
