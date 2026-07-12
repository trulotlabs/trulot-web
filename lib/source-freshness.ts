import foundationDatasetManifests from "@/data/dataset-manifests/2026-07-11-foundation.json";

export interface DatasetManifest {
  dataset_id: string;
  human_readable_name: string;
  source_agency_or_publisher: string;
  source_url_or_acquisition_location: string;
  license_or_use_restriction: string;
  jurisdiction: string;
  geography: string;
  source_publication_or_effective_date: string;
  acquisition_timestamp: string;
  import_timestamp: string;
  row_count: string;
  checksum: string;
  schema_version: string;
  importer_version: string;
  steward: string;
  refresh_cadence: string;
  known_limitations: string[];
  dependent_database_objects: string[];
}

export interface ParcelPageSourceEntry {
  dataset: string;
  publisher: string;
  vintageOrRefresh: string;
  url: string | null;
}

interface ParcelPageSourceEntryOptions {
  parcelViewRebuiltAt: string;
  pageCalculatedAt: string;
}

const manifests = foundationDatasetManifests as DatasetManifest[];

function manifestById(datasetId: string): DatasetManifest {
  const manifest = manifests.find((entry) => entry.dataset_id === datasetId);
  if (!manifest) throw new Error(`Missing dataset manifest for ${datasetId}`);
  return manifest;
}

function sourceUrlOrNull(value: string): string | null {
  return value === "unknown" ? null : value;
}

export function buildParcelPageSourceEntries(
  options: ParcelPageSourceEntryOptions,
): ParcelPageSourceEntry[] {
  const parcel = manifestById("parcel_base_sangis_v1");
  const assessor = manifestById("assessor_structures_sdcounty_v1");
  const zoning = manifestById("base_zoning_mapping_v1");
  const permit = manifestById("permit_terminal_city_sd_v2");
  const overlays = manifestById("overlay_layers_tpa_sda_ctcac_v1");

  return [
    {
      dataset: parcel.human_readable_name,
      publisher: parcel.source_agency_or_publisher,
      vintageOrRefresh: `Parcel page view rebuilt ${options.parcelViewRebuiltAt}; source effective date ${parcel.source_publication_or_effective_date}.`,
      url: sourceUrlOrNull(parcel.source_url_or_acquisition_location),
    },
    {
      dataset: assessor.human_readable_name,
      publisher: assessor.source_agency_or_publisher,
      vintageOrRefresh: `Assessor source effective date ${assessor.source_publication_or_effective_date}; current parcel-view rebuild stamp ${options.parcelViewRebuiltAt}.`,
      url: sourceUrlOrNull(assessor.source_url_or_acquisition_location),
    },
    {
      dataset: zoning.human_readable_name,
      publisher: zoning.source_agency_or_publisher,
      vintageOrRefresh: `Mapped zoning vintage ${zoning.source_publication_or_effective_date}; current parcel-page calculation ${options.pageCalculatedAt}.`,
      url: sourceUrlOrNull(zoning.source_url_or_acquisition_location),
    },
    {
      dataset: permit.human_readable_name,
      publisher: permit.source_agency_or_publisher,
      vintageOrRefresh: `Permit source effective date ${permit.source_publication_or_effective_date}; parcel-page calculation ${options.pageCalculatedAt} is not treated as permit-source freshness.`,
      url: sourceUrlOrNull(permit.source_url_or_acquisition_location),
    },
    {
      dataset: overlays.human_readable_name,
      publisher: overlays.source_agency_or_publisher,
      vintageOrRefresh: `Overlay layer vintage ${overlays.source_publication_or_effective_date}; function output evaluated on page calculation ${options.pageCalculatedAt}.`,
      url: sourceUrlOrNull(overlays.source_url_or_acquisition_location),
    },
  ];
}

export function getFoundationDatasetManifests(): DatasetManifest[] {
  return manifests;
}
