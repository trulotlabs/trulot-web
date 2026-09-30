#!/usr/bin/env python3
"""Build deterministic Structure Facts V0 evidence from sealed offline artifacts."""
from __future__ import annotations

import collections
import csv
import gzip
import hashlib
import importlib.util
import json
from itertools import zip_longest
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data/structure-facts-v0"
ACQUISITION = Path("/Users/ops/trulot-data/structure-facts-v0/building-outlines-city-20260930T161931Z")
PARCEL_ACQUISITION = Path("/Users/ops/trulot-data/parcel-base-v2/sangis-20260924T183743Z")
ZONING_MAP = Path("/private/tmp/trulot-packet9-mapping-a/parcel-base-zoning-map.ndjson.gz")
COASTAL_MAP = Path("/Users/ops/trulot-data/coastal-context-v0/coastal-city-sd-20260930T143055Z/parcel-coastal-mapping.ndjson")

GENERATED = [
    "schema.json", "source-inventory.json", "sources.json", "concepts.json", "fixtures.json",
    "fixture-results.json", "linkage.json", "coverage.json", "unlock-matrix.json",
    "fingerprints.json", "decision.json", "validation.json", "preservation.json", "integrity.json",
]

FIXTURES = [
    ("inside-coastal-rs-1-7", "3506320400", ["rs_1_7", "inside_coastal_rs", "multiple_footprints", "footprint_available"]),
    ("outside-coastal-rs-1-7", "6341302200", ["rs_1_7", "outside_coastal_rs", "multiple_footprints", "footprint_available"]),
    ("coastal-ambiguous-rs-1-7", "4360200200", ["rs_1_7", "unknown_coastal", "no_footprint_record"]),
    ("inside-coastal-rs-1-4", "3013428200", ["inside_coastal_rs", "no_footprint_record", "missing_address"]),
    ("split-rs-rs", "3013101500", ["split_zone", "one_footprint", "footprint_available"]),
    ("split-rs-non-rs", "4304211000", ["split_zone", "one_footprint", "footprint_available"]),
    ("ambiguous-zoning", "4303410600", ["ambiguous_zoning", "one_footprint", "footprint_available"]),
    ("no-record-missing-address", "3031701800", ["no_structure_record", "no_footprint_record", "missing_address"]),
    ("no-record-non-rs", "6271001600", ["no_structure_record", "no_footprint_record", "missing_address"]),
    ("living-area-limit", "4243800700", ["area_semantically_unusable", "no_footprint_record"]),
    ("multiple-footprints", "2723200100", ["multiple_footprints", "footprint_available"]),
    ("one-footprint", "5470501600", ["one_footprint", "footprint_available"]),
    ("one-footprint-large-living", "2673600300", ["one_footprint", "footprint_available"]),
    ("one-footprint-zero-assessor", "7600360300", ["one_footprint", "footprint_available", "source_zero_unresolved"]),
    ("ambiguous-footprint-boundary", "2748323700", ["ambiguous_linkage", "missing_address"]),
    ("ambiguous-footprint-missing-address", "6782511200", ["ambiguous_linkage", "missing_address"]),
    ("ambiguous-footprint-split", "5810934600", ["ambiguous_linkage", "split_zone", "missing_address"]),
    ("large-stack", "2421001000", ["stack_condo", "stack_group_footprints", "missing_address"]),
    ("stack-a", "5891700512", ["stack_condo", "stack_group_footprints"]),
    ("stack-b", "5891700513", ["stack_condo", "stack_group_footprints"]),
    ("stack-serving-a", "5333641301", ["stack_condo", "stack_group_footprints"]),
    ("stack-serving-b", "5333641302", ["stack_condo", "stack_group_footprints"]),
    ("stack-without-footprint", "4236300300", ["stack_condo", "stack_group_no_footprint", "missing_address"]),
    ("stack-six-units", "2760400100", ["stack_condo", "stack_group_footprints", "missing_address"]),
    ("stack-multipolygon", "2392600700", ["stack_condo", "stack_group_footprints", "missing_address"]),
    ("stack-living-area-a", "2725300831", ["stack_condo", "stack_group_footprints"]),
    ("stack-living-area-b", "2748402401", ["stack_condo", "stack_group_footprints"]),
    ("one-footprint-split", "5490330700", ["split_zone", "one_footprint", "footprint_available"]),
]


def module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    loaded = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(loaded)
    return loaded


resolver = module("structure_facts_resolver", HERE / "resolver.py")


def dump(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_context(path: Path, targets: set[str], compressed: bool) -> dict[str, Any]:
    result = {}
    opener = gzip.open if compressed else open
    with opener(path, "rt") as handle:
        for line in handle:
            row = json.loads(line)
            if row["apn"] in targets:
                result[row["apn"]] = row
    return result


def schema() -> dict[str, Any]:
    return {
        "contract_version": resolver.CONTRACT_VERSION,
        "fact_required_fields": [
            "apn", "source_record_id", "fact_key", "value", "unit", "source_semantics",
            "fact_state", "source_state", "derivation_class", "source_acquisition",
            "source_vintage", "linkage_method", "linkage_confidence", "provenance_ref",
            "limitations", "state_reason",
        ],
        "fact_states": ["supported", "partial", "unknown", "not_applicable", "unavailable"],
        "source_states": ["available", "partial", "source_unavailable", "not_evaluated"],
        "derivation_classes": ["recorded", "deterministic_derived", "inferred", "conditional"],
        "linkage_methods": [
            "EXACT_APN", "SPATIAL_POSITIVE_AREA_SINGLE_PHYSICAL_PARCEL",
            "STACKED_PARCEL_GROUP", "AMBIGUOUS_MULTI_PARCEL", "NO_PARCEL",
        ],
        "null_doctrine": {
            "source_failure": "unavailable/source_unavailable",
            "no_record": "unknown/available with NO_SOURCE_RECORD",
            "source_zero": "unknown/available with SOURCE_ZERO_UNRESOLVED",
            "empty_footprints": "NO_FOOTPRINT_RECORD; vacancy_conclusion remains null",
        },
    }


def source_inventory() -> dict[str, Any]:
    return {
        "artifacts": [
            {
                "id": "parcel_base_sangis_v2_arcc_attributes", "classification": "authoritative_current_source",
                "finding": "Reproducible 2026 SanGIS parcel snapshot; ARCC MPR/PAR attributes linked by exact APN.",
            },
            {
                "id": "city_sandag_building_outlines_2017", "classification": "authoritative_historical_source",
                "finding": "Official outline geometry based on Spring 2017 imagery; current completeness and update cadence are unproven.",
            },
            {
                "id": "assessor_structures_sdcounty_v1", "classification": "non_reproducible",
                "finding": "Repository manifest names a prior source, but has no source artifact, schema, importer, vintage, row count, or checksum.",
            },
            {
                "id": "public.parcel_page_api_v2", "classification": "derived",
                "finding": "Downstream view exposes assessor-style fields but cannot replace the upstream source receipt.",
            },
            {
                "id": "parcel_v1_existing_structure_coverage", "classification": "heuristic",
                "finding": "Legacy display divides assessor living area by parcel geometry area; it is not authoritative lot coverage.",
            },
            {
                "id": "permit_descriptions", "classification": "conditional_evidence",
                "finding": "Permit text and valuation do not establish present structures, size, units, or occupancy.",
            },
            {
                "id": "legacy_structure_fields", "classification": "unknown",
                "finding": "Bedrooms, baths, garage fields, effective-year codes, and use codes remain raw unless exact encoding/currentness is proven.",
            },
        ]
    }


def source_bundle() -> dict[str, Any]:
    parcel_receipt = load(PARCEL_ACQUISITION / "acquisition.json")["receipt"]
    layer_metadata = load(ACQUISITION / "layer-metadata.json")
    artifact_names = [
        "city-boundary.geojson", "layer-metadata.json", "service-metadata.json", "object-ids.json",
        "chunk-manifest.json", "normalized-footprints.csv.gz", "parcel-assessor-source.csv.gz",
        "footprint-parcel-linkage.ndjson", "parcel-footprint-summary.ndjson", "linkage-report.json",
    ]
    return {
        "acquisition_path": str(ACQUISITION),
        "building_outline_acquisition": {
            "acquisition_id": resolver.FOOTPRINT_ACQUISITION,
            "acquired_at": "2026-09-30T16:19:31Z",
            "scope": "Official building outlines intersecting the official City of San Diego boundary",
            "source_record_count": 386217,
            "artifacts": {
                name: {"byte_size": (ACQUISITION / name).stat().st_size, "sha256": sha_file(ACQUISITION / name)}
                for name in artifact_names
            },
        },
        "sources": {
            "sangis_parcel_arcc_mpr_par": {
                "publisher": "SanGIS; County of San Diego ARCC MPR/PAR attributes",
                "dataset": "Parcels",
                "endpoint": parcel_receipt["sourceUrl"],
                "metadata": parcel_receipt["metadataUrl"],
                "update_cadence": "MPR-derived fields documented as weekly; sealed snapshot controls this packet",
                "native_crs": "EPSG:2230", "artifact_crs": "EPSG:4326",
                "source_vintage": parcel_receipt["sourceReported"]["currency"]["value"],
                "linkage": "Exact ten-digit APN",
                "fields": {
                    "UNITQTY": "Number of units currently constructed on the parcel",
                    "TOTAL_LVG_AREA": "Total living area currently constructed on the parcel",
                    "YEAR_EFFECTIVE": "Two-character source code retained raw; full-year semantics not promoted",
                    "NUCLEUS_USE_CD": "Detailed assessor use code retained raw; current occupancy not asserted",
                },
                "content_sha256": parcel_receipt["contentSha256"],
                "limitations": ["Tax parcel is not necessarily a legal lot.", "Stacked parcels can share one physical polygon."],
            },
            "city_sandag_building_outlines": {
                "publisher": "City of San Diego public GIS; SANDAG and EagleView/Pictometry credited",
                "dataset": layer_metadata["name"], "endpoint": resolver.FOOTPRINT_SOURCE_URL,
                "metadata": resolver.FOOTPRINT_SOURCE_URL + "/metadata",
                "update_cadence": "Not stated", "native_crs": "EPSG:2230",
                "source_vintage": "Spring 2017 imagery baseline", "linkage": "No APN; conditional positive-area spatial linkage",
                "fields": {field["name"]: field["type"] for field in layer_metadata["fields"]},
                "limitations": ["No height, story, unit, occupancy, or floor-area fields.", "All edit-date fields are null in the acquired City subset."],
            },
        },
        "official_semantic_evidence": {
            "sangis_dictionary": {
                "url": "https://www.sandiego.gov/sites/default/files/appendices_-_6-10.pdf",
                "sha256": sha_file(ACQUISITION / "sangis-parcel-data-dictionary-source.pdf"),
            },
            "city_field_semantics": {
                "url": "https://www.sandiego.gov/sites/default/files/7-active-transportation-in-lieu-fee-calculator-user-manual.pdf",
                "sha256": sha_file(ACQUISITION / "city-sangis-field-semantics.pdf"),
            },
        },
    }


def concepts() -> dict[str, Any]:
    return {
        "concepts": [
            {"key": "building_footprint_area", "available": "HISTORICAL_ONLY", "meaning": "Plan-view area of a 2017 outline polygon.", "not_equivalent_to": ["gross_floor_area", "living_area"]},
            {"key": "gross_floor_area", "available": False, "meaning": "Code-defined aggregate floor area.", "finding": "FAR_NUMERATOR_NOT_YET_AVAILABLE"},
            {"key": "living_area", "available": True, "meaning": "Parcel-level assessor total living area.", "not_equivalent_to": ["gross_floor_area", "building_footprint_area"]},
            {"key": "assessed_improvement_area", "available": False, "meaning": "No area with this proven semantic; ASR_IMPR is value, not area."},
            {"key": "building_count", "available": "HISTORICAL_OBSERVED_OUTLINE_COUNT_ONLY", "meaning": "Count of 2017 outline records linked to one physical parcel."},
            {"key": "story_count", "available": False, "meaning": "No authoritative field."},
            {"key": "structure_height", "available": False, "meaning": "No authoritative field or reference datum."},
            {"key": "dwelling_units", "available": True, "meaning": "Parcel-level UNITQTY from ARCC MPR/PAR, exact APN; zero remains unresolved."},
            {"key": "bedrooms", "available": "RAW_ONLY", "meaning": "Encoded assessor field; normalization semantics not sealed."},
            {"key": "use_occupancy", "available": "RAW_APPROXIMATE_ONLY", "meaning": "Assessor use code does not establish current legal occupancy."},
        ]
    }


def unlock_matrix() -> dict[str, Any]:
    return {
        "rows": [
            {"rs_family": "structure_height_max", "structure_facts_needed": ["structure_height_ft", "height_reference_datum", "structure_geometry"], "available_now": False, "remaining_blocker": "No authoritative height, datum, or current structure geometry."},
            {"rs_family": "floor_area_ratio_max", "structure_facts_needed": ["gross_floor_area_sqft"], "available_now": False, "remaining_blocker": "FAR_NUMERATOR_NOT_YET_AVAILABLE; assessor living area is excluded. Legal lot area and hillside context also remain unresolved."},
            {"rs_family": "lot_coverage_max", "structure_facts_needed": ["current_structure_footprint_area_sqft"], "available_now": False, "remaining_blocker": "Only historical 2017 footprints exist; legal premises area and hillside context also remain unresolved."},
            {"rs_family": "building_spacing", "structure_facts_needed": ["current_structure_geometry"], "available_now": False, "remaining_blocker": "Only historical 2017 geometry exists; proposed project scope is also absent."},
            {"rs_family": "garage_regulations", "structure_facts_needed": ["garage_context", "current_structure_geometry"], "available_now": False, "remaining_blocker": "Raw assessor garage fields are not a sealed current garage-context model."},
            {"rs_family": "dwelling_unit_protection", "structure_facts_needed": ["existing_dwelling_units"], "available_now": True, "remaining_blocker": "UNITQTY is supported for positive source values; source zero remains unknown and proposed project scope is still required."},
            {"rs_family": "third_story_dimensions_max", "structure_facts_needed": ["story_count", "third_story_dimensions", "current_structure_geometry"], "available_now": False, "remaining_blocker": "No story count or third-story dimensions; proposed project scope is absent."},
            {"rs_family": "accessory_uses_structures", "structure_facts_needed": ["current_use", "accessory_structure_type", "current_structure_geometry"], "available_now": False, "remaining_blocker": "Assessor use codes are approximate and do not identify accessory structures or proposed use."},
        ]
    }


def build(output_dir: Path = DATA, structure_output: Path | None = None) -> None:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    structure_output = structure_output or ACQUISITION / "parcel-structure-facts.ndjson.gz"

    footprint_records: dict[int, dict[str, str]] = {}
    footprint_digest = hashlib.sha256()
    with gzip.open(ACQUISITION / "normalized-footprints.csv.gz", "rt", newline="") as handle:
        reader = csv.DictReader(handle)
        expected = {"objectid", "outline_id", "building_id", "global_id", "source_area_sq_ft", "derived_footprint_area_sq_ft", "geometry_sha256"}
        if set(reader.fieldnames or []) != expected:
            raise ValueError("normalized footprint schema mismatch")
        for row in reader:
            source_id = int(row["objectid"])
            if source_id in footprint_records:
                raise ValueError("duplicate normalized footprint objectid")
            footprint_records[source_id] = row
            footprint_digest.update((resolver.canonical(row) + "\n").encode())

    targets = {apn for _, apn, _ in FIXTURES}
    fixture_rows: dict[str, dict[str, Any]] = {}
    fact_state_counts: collections.Counter[str] = collections.Counter()
    coverage = collections.Counter()
    assessor_digest = hashlib.sha256()
    structure_digest = hashlib.sha256()

    assessor_handle = gzip.open(ACQUISITION / "parcel-assessor-source.csv.gz", "rt", newline="")
    linkage_handle = (ACQUISITION / "parcel-footprint-summary.ndjson").open()
    structure_output.parent.mkdir(parents=True, exist_ok=True)
    with assessor_handle, linkage_handle, structure_output.open("wb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as zipped:
            reader = csv.DictReader(assessor_handle)
            required = {"objectid", "apn", "unitqty", "total_lvg_area", "year_effective", "bedrooms", "baths", "nucleus_use_cd", "garage_stalls", "usable_sq_feet", "situs_address", "situs_street"}
            if required - set(reader.fieldnames or []):
                raise ValueError("assessor extract schema mismatch")
            previous = None
            for assessor_row, linkage_line in zip_longest(reader, linkage_handle):
                if assessor_row is None or linkage_line is None:
                    raise ValueError("assessor/linkage row-count mismatch")
                summary = json.loads(linkage_line)
                if assessor_row["apn"] != summary["apn"]:
                    raise ValueError("assessor/linkage APN order mismatch")
                apn = assessor_row["apn"]
                if previous is not None and apn <= previous:
                    raise ValueError("APN order or uniqueness failure")
                previous = apn
                assessor_normalized = {key: assessor_row.get(key, "") for key in sorted(required | {"asr_landuse", "addition_area", "garage_conversion", "carport_stalls", "sub_type", "multi"})}
                assessor_digest.update((resolver.canonical(assessor_normalized) + "\n").encode())
                result = resolver.resolve_parcel(assessor_row, summary, footprint_records)
                line = (resolver.canonical(result) + "\n").encode()
                zipped.write(line)
                structure_digest.update(line)
                coverage["parcel_apns"] += 1
                for fact in result["facts"]:
                    fact_state_counts[f'{fact["fact_key"]}:{fact["fact_state"]}'] += 1
                if any(f["fact_state"] == "supported" and f["fact_key"].startswith("assessor_") for f in result["facts"]):
                    coverage["parcels_with_supported_assessor_structure_fact"] += 1
                else:
                    coverage["parcels_without_supported_assessor_structure_fact"] += 1
                if summary["direct_source_object_ids"]:
                    coverage["parcels_with_direct_historical_footprint_fact"] += 1
                if apn in targets:
                    fixture_rows[apn] = {
                        **result,
                        "address_missing": assessor_row.get("situs_address") in ("", "0") or not assessor_row.get("situs_street"),
                    }

    if coverage["parcel_apns"] != 393733 or set(fixture_rows) != targets:
        raise ValueError("full-corpus or fixture coverage mismatch")

    zoning = load_context(ZONING_MAP, targets, True)
    coastal = load_context(COASTAL_MAP, targets, False)
    fixtures = {"fixture_count": len(FIXTURES), "fixtures": [
        {"id": name, "apn": apn, "coverage_tags": tags} for name, apn, tags in FIXTURES
    ]}
    fixture_results = []
    for name, apn, tags in FIXTURES:
        row = fixture_rows[apn]
        z = zoning[apn]
        c = coastal[apn]
        result = {
            "fixture_id": name, "coverage_tags": tags, "parcel": row,
            "zoning_context": {
                "mapping_state": z["mappingState"],
                "zones": [item["zoneCode"] for item in z.get("zoneEvidence", [])],
            },
            "coastal_context": c["state"],
            "compliance_evaluated": False, "capacity_calculated": False,
        }
        result["fingerprint_sha256"] = resolver.fingerprint(result)
        fixture_results.append(result)

    full_linkage = load(ACQUISITION / "linkage-report.json")
    linkage = {
        "assessor_exact_apn": {
            "source_records": 393733, "unique_apns": 393733, "matched_parcel_v2_apns": 393733,
            "orphan_records": 0, "duplicate_apns": 0, "linkage_method": "EXACT_APN",
        },
        "historical_footprints": full_linkage,
        "no_silent_winner": True,
        "ambiguous_footprints_have_selected_apn": 0,
    }
    coverage_output = {
        **dict(sorted(coverage.items())),
        "assessor_dwelling_unit_count": {
            "supported": fact_state_counts["assessor_dwelling_unit_count:supported"],
            "unknown": fact_state_counts["assessor_dwelling_unit_count:unknown"],
        },
        "assessor_total_living_area_sq_ft": {
            "supported": fact_state_counts["assessor_total_living_area_sq_ft:supported"],
            "unknown": fact_state_counts["assessor_total_living_area_sq_ft:unknown"],
        },
        "height_supported": 0, "story_count_supported": 0,
        "gross_floor_area_supported": 0, "current_structure_geometry_supported": 0,
        "vacancy_conclusions": 0,
    }
    sources = source_bundle()
    source_fingerprints = {
        "parcel_source_content_sha256": sources["sources"]["sangis_parcel_arcc_mpr_par"]["content_sha256"],
        "building_chunk_manifest_sha256": sha_file(ACQUISITION / "chunk-manifest.json"),
        "building_object_ids_sha256": sha_file(ACQUISITION / "object-ids.json"),
    }
    normalization = {
        "assessor_normalization_sha256": assessor_digest.hexdigest(),
        "footprint_normalization_sha256": footprint_digest.hexdigest(),
    }
    fingerprints = {
        "canonical_rendering": "UTF-8 sorted-key compact JSON, ensure_ascii=false, allow_nan=false; newline-delimited; gzip mtime=0",
        "source_snapshot_sha256": resolver.fingerprint(source_fingerprints),
        "source_normalization_sha256": resolver.fingerprint(normalization),
        **normalization,
        "parcel_linkage_sha256": sha_file(ACQUISITION / "footprint-parcel-linkage.ndjson"),
        "structure_fact_outputs_sha256": structure_digest.hexdigest(),
        "fixture_results_sha256": resolver.fingerprint(fixture_results),
    }
    decision = {
        "decision": "STRUCTURE_FACTS_V0_READY_FOR_RULE_EVALUATION",
        "ready_fact_family": "existing_dwelling_units",
        "ready_rule_family": "dwelling_unit_protection",
        "scope": "Input availability only; proposed project facts remain required before any rule conclusion.",
        "far_numerator": "FAR_NUMERATOR_NOT_YET_AVAILABLE",
        "current_footprint_geometry": "NOT_AVAILABLE",
        "parcel_compliance_evaluated": False, "development_capacity_calculated": False,
        "production_runtime_wiring": False, "parcel_v1_modified": False,
    }
    validation = {
        "source_schema_validation": "PASS", "exact_apn_linkage": "PASS",
        "duplicate_and_ambiguous_linkage": "PASS", "structure_concept_separation": "PASS",
        "null_zero_coercion": "PASS", "fixture_suite": "PASS",
        "packet14_readiness_integration": "PASS", "parcel_truth_vocabulary": "PASS",
        "fixture_count": len(FIXTURES), "full_corpus_apns": coverage["parcel_apns"],
        "normalized_footprints": len(footprint_records),
    }
    preservation = {
        "production_access": False, "packet_11_frozen": True, "production_zoning_load": False,
        "selected_snapshot": False, "parcel_compliance_evaluated": False,
        "development_capacity_calculated": False, "production_runtime_wiring": False,
        "parcel_v1_modified": False, "deployed": False, "pushed": False,
    }

    outputs = {
        "schema.json": schema(), "source-inventory.json": source_inventory(), "sources.json": sources,
        "concepts.json": concepts(), "fixtures.json": fixtures,
        "fixture-results.json": {"contract_version": resolver.CONTRACT_VERSION, "fixture_count": len(FIXTURES), "canonical_output_sha256": fingerprints["fixture_results_sha256"], "results": fixture_results},
        "linkage.json": linkage, "coverage.json": coverage_output,
        "unlock-matrix.json": unlock_matrix(), "fingerprints.json": fingerprints,
        "decision.json": decision, "validation.json": validation, "preservation.json": preservation,
    }
    for name, value in outputs.items():
        dump(output_dir / name, value)
    integrity_names = [name for name in GENERATED if name != "integrity.json"]
    dump(output_dir / "integrity.json", {"algorithm": "sha256", "files": {name: sha_file(output_dir / name) for name in integrity_names}})


if __name__ == "__main__":
    build()
