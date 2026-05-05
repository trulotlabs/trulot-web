export type ConfidenceLevel = "source-backed" | "inferred" | "conditional" | "unknown";

export type PermitLifecycleStatus = "IN REVIEW" | "ISSUED" | "INSPECTION" | "COMPLETE" | "ACTIVE";

export interface ConfidenceRecord {
  confidence: ConfidenceLevel;
  source?: string;
  note?: string;
}

export interface ParcelSummary {
  address: string;
  full_address?: string;
  apn: string;
  lot_size: string;
  // v1.3 canonical header fields
  lot_size_sf?: number | null;           // raw SF number (UI formats)
  geo?: { lat: number | null; lng: number | null }; // canonical; lat/lng kept for compat
  zoning: string;
  status?: string;                        // v1.3: ACTIVE | STALLED | COMPLETE | EARLY | INACTIVE
  community?: string;
  latitude?: number;
  longitude?: number;
}

export interface ReadoutSignal extends ConfidenceRecord {
  key: string;
  value: string;
}

export interface ParcelReadout {
  summary: string;
  signals: ReadoutSignal[];
}

export interface PermitRecord extends ConfidenceRecord {
  permit_number: string;
  type: string;
  status: PermitLifecycleStatus;
  filed?: string;
  issued?: string;
  last_activity?: string;
  applicant?: string;
  scope: string;
  description?: string;
}

export interface ProposedProject extends ConfidenceRecord {
  scope: string;
  adu_units: number;
  sfr_units: number;
  building_count: number;
  source?: string;        // v1.3: permit ID carrying this scope
  source_type?: string;
  related_permit: PermitRecord;
}

export interface PermitTreeNode extends ConfidenceRecord {
  status?: PermitLifecycleStatus;
  title: string;
  scope?: string;
  filed?: string;
  issued?: string;
}

export interface PermitTree {
  building: PermitTreeNode[];
  related_records: PermitTreeNode[];
  execution: PermitTreeNode[];
}

export interface ProjectTimeline {
  filed: string | null;
  issued: string | null;
  last_activity?: string | null;
  field_activity: string;
  // v1.3: confidence on field_activity — Codex should read this to badge the field
  field_activity_confidence?: ConfidenceLevel;
}

export interface ParcelProject {
  primary_permit: PermitRecord;
  proposed_project: ProposedProject;
  permit_tree: PermitTree;
  timeline: ProjectTimeline;
}

export interface OpportunityLayer {
  development_stage: string;
  interpretation: string;
  jobs_to_engage: string[];
  key_triggers: string[];
  potential_opportunities?: string[];
  watch_next?: string[];
}

export interface CapacityItem extends ConfidenceRecord {
  units: number;
  basis: string;
}

export interface ParcelCapacity {
  baseline_units: CapacityItem;
  adu_upside_units: CapacityItem;
}

export interface ParcelSignal extends ConfidenceRecord {
  key: string;
  value: string;
  strength?: string;
}

export interface ParcelSignals {
  site: ParcelSignal[];
  market: ParcelSignal[];
  owner: ParcelSignal[];
}

export interface NearbyDevelopmentContext {
  total_nearby: number;
  active: number;
  completed: number;
  stalled: number;
  nearest_completed: string;
  signal_strength: string;
}

export interface ParcelContext {
  nearby_development: NearbyDevelopmentContext;
}

export interface ParcelStructure extends ConfidenceRecord {
  unit_count: number;
  living_area: string;
  year_built: string;
  // v1.3: null-safe — never show 0; UI must hide if null
  bedrooms: number | null;
  bathrooms: number | null;
  land_value: number;
  improvement_value: number;
  total_assessed_value: number;
  owner_occupied: "yes" | "no" | "unknown";
  land_use: string;
}

export interface ConstraintItem extends ConfidenceRecord {
  status: string;
}

export interface OverlayPrograms {
  tpa: ConstraintItem;
  sda: ConstraintItem;
  cchs: ConstraintItem;
  ctcac: ConstraintItem;
}

export interface RegulatoryConstraints {
  fire_hazard: ConstraintItem;
  historic_determination: ConstraintItem;
  coastal_overlay: ConstraintItem;
  esl: ConstraintItem;
  far_coverage: ConstraintItem;
}

export interface ParcelConstraints {
  overlays: OverlayPrograms;
  regulatory: RegulatoryConstraints;
}

export type ConfidenceLegend = Record<ConfidenceLevel, string>;

export interface ParcelPageData {
  development_stage?: string;
  parcel: ParcelSummary;
  readout: ParcelReadout;
  project: ParcelProject;
  opportunity_layer?: OpportunityLayer;
  capacity: ParcelCapacity;
  signals: ParcelSignals;
  context: ParcelContext;
  structure: ParcelStructure;
  constraints: ParcelConstraints;
  confidence: ConfidenceLegend;
}
