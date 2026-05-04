export type ConfidenceLevel = "source-backed" | "inferred" | "conditional" | "unknown";

export type PermitLifecycleStatus = "IN REVIEW" | "ISSUED" | "INSPECTION" | "COMPLETE" | "ACTIVE";

export interface ConfidenceRecord {
  confidence: ConfidenceLevel;
  source?: string;
  note?: string;
}

export interface ParcelSummary {
  address: string;
  apn: string;
  lot_size: string;
  zoning: string;
  status?: string;
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
  filed: string;
  issued: string;
  field_activity: string;
}

export interface ParcelProject {
  primary_permit: PermitRecord;
  proposed_project: ProposedProject;
  permit_tree: PermitTree;
  timeline: ProjectTimeline;
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
  bedrooms: number;
  bathrooms: number;
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
  parcel: ParcelSummary;
  readout: ParcelReadout;
  project: ParcelProject;
  capacity: ParcelCapacity;
  signals: ParcelSignals;
  context: ParcelContext;
  structure: ParcelStructure;
  constraints: ParcelConstraints;
  confidence: ConfidenceLegend;
}
