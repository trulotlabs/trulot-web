"""Acquire one immutable complete City of San Diego base-zoning snapshot.

Usage: python3 scripts/base-zoning-v2/acquire.py NEW_ABSOLUTE_DIRECTORY
The public download is read-only. A fresh external directory is mandatory.
"""
import datetime as dt
import hashlib
import json
import pathlib
import re
import shutil
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = "https://geo.sandag.org/server/rest/services/Hosted/Zoning_Base_SD/FeatureServer"
LAYER = BASE + "/0"
ITEM = "e99981214e6348de8ddc3674f799c75d"
ITEM_URL = "https://geo.sandag.org/portal/sharing/rest/content/items/" + ITEM
ARTIFACT_URL = "https://geo.sandag.org/server/rest/directories/downloads/Zoning_Base_SD.geojson"
TERMS_URL = "https://gis.sangis.org/sanportal/apps/storymaps/stories/d26146d84e834ff6bcd58e4e620a983a"
PORTAL_URL = "https://data.sandiego.gov/datasets/gis-zoning/"


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha(path):
    with pathlib.Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def checked_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {"geo.sandag.org", "gis.sangis.org"} or parsed.username or parsed.password:
        raise ValueError("Unexpected zoning source URL")
    return url


def acquire(destination):
    output = pathlib.Path(destination)
    if not output.is_absolute():
        raise ValueError("Absolute external directory required")
    output = output.resolve()
    if output == ROOT or ROOT in output.parents or not re.fullmatch(r"[A-Za-z0-9_-]+", output.name):
        raise ValueError("Use a new external directory with a simple acquisition ID")
    output.mkdir(parents=True, exist_ok=False)

    def write_json(name, value):
        with (output / name).open("x") as target:
            json.dump(value, target, indent=2)
            target.write("\n")

    def capture(name, url):
        request = urllib.request.Request(checked_url(url), headers={"User-Agent": "TruLot-Base-Zoning-Acquisition/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response:
            checked_url(response.url)
            body = response.read()
            headers = dict(response.headers)
        with (output / name).open("xb") as target:
            target.write(body)
        write_json(name + ".http.json", {"url": url, "capturedAt": now(), "headers": headers})
        value = json.loads(body)
        if isinstance(value, dict) and value.get("error"):
            raise ValueError(value["error"])
        return value

    layer = capture("before-layer.json", LAYER + "?f=pjson")
    service = capture("before-service.json", BASE + "?f=pjson")
    item = capture("before-item.json", ITEM_URL + "?f=pjson")
    count = capture("before-count.json", LAYER + "/query?f=json&where=1%3D1&returnCountOnly=true")["count"]
    ids = capture("source-objectids.json", LAYER + "/query?f=json&where=1%3D1&returnIdsOnly=true")["objectIds"]
    if not (layer["id"] == 0 and layer["name"] == "Zoning_Base_SD" and layer["serviceItemId"] == ITEM
            and item["id"] == ITEM and item["owner"] == "SanGIS" and item["url"] == BASE
            and layer["geometryType"] == "esriGeometryPolygon" and layer["extent"]["spatialReference"]["latestWkid"] == 2230
            and "Query" in service["capabilities"].split(",") and count > 0
            and len(ids) == count and len(set(ids)) == count):
        raise ValueError("Authoritative source identity/count changed")

    request = urllib.request.Request(ARTIFACT_URL, headers={"User-Agent": "TruLot-Base-Zoning-Acquisition/1.0"})
    artifact = output / "Zoning_Base_SD.geojson"
    acquired_at = now()
    with urllib.request.urlopen(request, timeout=120) as response, artifact.open("xb") as target:
        checked_url(response.url)
        headers = dict(response.headers)
        while chunk := response.read(1024 * 1024):
            target.write(chunk)
    byte_size = artifact.stat().st_size
    if byte_size <= 0 or (headers.get("Content-Length") and byte_size != int(headers["Content-Length"])):
        raise ValueError("Truncated zoning artifact")
    write_json("download.json", {"url": ARTIFACT_URL, "acquiredAt": acquired_at, "byteSize": byte_size,
                                 "sha256": sha(artifact), "headers": headers})

    after = capture("after-layer.json", LAYER + "?f=pjson")
    after_count = capture("after-count.json", LAYER + "/query?f=json&where=1%3D1&returnCountOnly=true")["count"]
    if after_count != count or after["editingInfo"] != layer["editingInfo"] or after["fields"] != layer["fields"]:
        raise ValueError("Source changed during acquisition")

    shutil.copyfile(__file__, output / "executed-acquire.py")
    source_modified = dt.datetime.fromtimestamp(layer["editingInfo"]["lastEditDate"] / 1000, dt.timezone.utc).isoformat()
    receipt = {
        "schemaVersion": 1,
        "acquisitionId": output.name,
        "datasetId": "base_zoning_city_sd_v2",
        "publisher": "City of San Diego Planning via SanGIS",
        "sourceItemId": ITEM,
        "sourceLayerId": 0,
        "sourceUrl": LAYER,
        "downloadUrl": ARTIFACT_URL,
        "metadataUrl": ITEM_URL,
        "cityPortalUrl": PORTAL_URL,
        "termsUrl": TERMS_URL,
        "acquiredAt": acquired_at,
        "sourceReported": {
            "serviceModified": source_modified,
            "portalItemModified": dt.datetime.fromtimestamp(item["modified"] / 1000, dt.timezone.utc).isoformat(),
            "featureEffectiveDates": "Per-feature imp_date; not a dataset-wide effective date",
            "portalUpdateCadence": "weekly",
        },
        "artifact": {"filename": artifact.name, "mediaType": "application/geo+json", "byteSize": byte_size, "sha256": sha(artifact)},
        "sourceFeatureCount": count,
        "nativeCrs": "EPSG:2230",
        "artifactCrs": "EPSG:4326",
        "geometryType": "Polygon or MultiPolygon after GeoJSON encoding",
        "acquisitionMethod": "official-complete-download",
        "tool": "Python " + sys.version.split()[0] + " urllib",
        "licenseUseNote": "before-item.json licenseInfo applies; derived mapping is not original SanGIS data",
        "sourceStableAcrossAcquisition": True,
    }
    files = [{"path": file.name, "byteSize": file.stat().st_size, "sha256": sha(file)}
             for file in sorted(output.iterdir()) if file.is_file()]
    aggregate = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    write_json("acquisition.json", {"receipt": receipt, "files": files, "aggregateSha256": aggregate})
    for file in output.iterdir():
        file.chmod(0o444)
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    acquire(sys.argv[1])
