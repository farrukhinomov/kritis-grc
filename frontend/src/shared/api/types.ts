/**
 * Resource shapes of API v1, exactly as they travel: snake_case, IDs as opaque strings,
 * dates as ISO 8601 strings. The generated OpenAPI client replaces this file once the
 * backend exists; until then it is the contract the mock API and the screens share.
 */

import type { ThemeName } from "@/shared/theme/semantic";

// ---------- Lists ----------

export interface PageInfo {
  number: number;
  limit: number;
  total: number;
}

/** Every list has this shape; the HTTP status says whether the request worked. */
export interface Page<T> {
  items: T[];
  page: PageInfo;
}

/** The Activity Log pages by cursor, because new entries keep arriving at the top. */
export interface CursorPage<T> {
  items: T[];
  page: { next_cursor: string | null; limit: number };
}

export interface PageParams {
  page?: number;
  limit?: number;
}

// ---------- Organization ----------

export type Sector = "water";
export type CriticalService = "drinking_water_supply";

export interface Tenant {
  slug: string;
  name: string;
  theme: ThemeName;
  sector: Sector;
}

export type Role = "grc_manager" | "auditor";

export interface Member {
  id: string;
  display_name: string;
  email: string;
  role: Role;
  job_title: string;
}

export interface Registration {
  /** Planned dates give projected deadlines; only a confirmed date makes them binding. */
  status: "planned" | "confirmed";
  date: string;
}

export interface Deadline {
  citation: string;
  due_date: string;
  binding: boolean;
}

export interface CriticalFacilityDetails {
  sector: Sector;
  critical_service: CriticalService;
  people_supplied: number;
  threshold: number;
  location: string;
  registration: Registration;
  /** Calculated by the server from the Registration; never stored. */
  deadlines: Deadline[];
}

export type ScopeKind = "organization" | "critical_facility";

export interface Scope {
  id: string;
  name: string;
  kind: ScopeKind;
  critical_facility: CriticalFacilityDetails | null;
}

export type AssetKind = "technical_system" | "it_system" | "building" | "utility" | "supplier";
export type Criticality = "low" | "medium" | "high";

export interface Asset {
  id: string;
  scope_id: string;
  name: string;
  kind: AssetKind;
  criticality: Criticality;
  depends_on: string[];
  description: string;
}

// ---------- Compliance ----------

export interface FrameworkVersion {
  id: string;
  label: string;
  effective_from: string;
  source_url: string;
  retrieved_at: string;
}

export interface Framework {
  id: string;
  key: "kritis_dachg" | "bsig";
  name: string;
  versions: FrameworkVersion[];
}

export interface PendingLegalDetail {
  reason_de: string;
  reason_en: string;
}

export interface Requirement {
  id: string;
  framework_version_id: string;
  paragraph: string;
  citation: string;
  title_de: string;
  title_en: string;
  /** Verbatim statute text; shown in German in every UI language. */
  text_de: string;
  summary_en: string;
  pending_legal_detail: PendingLegalDetail | null;
}

export type ImplementationStatus = "open" | "partial" | "implemented" | "not_applicable";

export interface Implementation {
  id: string;
  requirement_id: string;
  scope_id: string;
  status: ImplementationStatus;
  owner_id: string | null;
  /** Embedded, so a reader never needs the whole member list to name the owner. */
  owner_name: string | null;
  due_date: string | null;
  note_de: string | null;
  /** Sent back as If-Match on writes; a stale value is rejected with 412. */
  version: number;
  updated_at: string;
}

export type ImplementationChange = Partial<
  Pick<Implementation, "status" | "owner_id" | "due_date" | "note_de">
>;

/** How many of one Scope's Implementations of one Framework are in each status. */
export interface ComplianceSummaryRow {
  scope_id: string;
  scope_name: string;
  scope_kind: ScopeKind;
  framework_id: string;
  framework_name: string;
  counts: Record<ImplementationStatus, number>;
}

/** An aggregate, not a list: it is never paged, so no row can go missing. */
export interface ComplianceSummary {
  rows: ComplianceSummaryRow[];
}

/** One paragraph of a Framework Version, counted for one Scope. */
export interface ParagraphSummaryRow {
  paragraph: string;
  requirement_count: number;
  counts: Record<ImplementationStatus, number>;
}

export interface ParagraphSummary {
  rows: ParagraphSummaryRow[];
}

export type EvidenceKind = "file" | "link" | "reference";

export interface EvidenceFile {
  name: string;
  size_bytes: number;
  content_type: string;
}

export interface Evidence {
  id: string;
  implementation_id: string;
  kind: EvidenceKind;
  title: string;
  file: EvidenceFile | null;
  url: string | null;
  referenced_implementation_id: string | null;
  added_by_id: string;
  added_at: string;
}

export type NewEvidence =
  | { kind: "link"; title: string; url: string }
  | { kind: "reference"; title: string; referenced_implementation_id: string }
  /** The upload must be finished; the server takes the file's details from storage. */
  | { kind: "file"; title: string; upload_id: string };

/** What the browser announces before uploading; checked again once the file is stored. */
export type UploadRequest = EvidenceFile;

/** A short-lived permission to PUT one file straight into storage. */
export interface UploadSlot {
  upload_id: string;
  upload_url: string;
  expires_at: string;
}

export type Coverage = "full" | "partial";

export interface Mapping {
  id: string;
  kind: "platform" | "tenant";
  target_requirement_id: string;
  source_requirement_id: string;
  coverage: Coverage;
  justification_de: string;
  gap_note_de: string | null;
  approved_by_id: string | null;
  approved_at: string | null;
}

export type SuggestionStatus = "pending" | "approved" | "rejected";

/** A Requirement as another object names it: enough to read, without the statute text. */
export type RequirementRef = Pick<Requirement, "id" | "citation" | "title_de" | "title_en"> & {
  framework_name: string;
};

export interface MappingSuggestion {
  id: string;
  target_requirement_id: string;
  source_requirement_id: string;
  target: RequirementRef;
  source: RequirementRef;
  coverage: Coverage;
  /** The model's own estimate between 0 and 1, shown as a hint, never as proof. */
  confidence: number;
  rationale_de: string;
  rationale_en: string;
  status: SuggestionStatus;
  model: string;
  created_at: string;
  /** Who approved or rejected it, and when; null while it is pending. */
  decided_by_id: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
}

// ---------- Risk ----------

export type HazardCategory = "natural" | "technical" | "human";

export interface Hazard {
  id: string;
  category: HazardCategory;
  name_de: string;
  name_en: string;
  description_de: string;
}

export type RiskCategory = "low" | "medium" | "high" | "critical";
export type RiskDimension = "likelihood" | "impact";

export interface Rating {
  likelihood: number;
  impact: number;
  score: number;
  category: RiskCategory;
}

export interface Treatment {
  implementation_id: string;
  dimension: RiskDimension;
  levels: number;
}

export interface TreatmentEffect {
  implementation_id: string;
  dimension: RiskDimension;
  status: ImplementationStatus;
  levels_applied: number;
}

export interface ResidualRating extends Rating {
  method_version: string;
  explanation: TreatmentEffect[];
}

/** All Risks of one cell of the Residual Rating matrix. */
export interface RiskMatrixCell {
  likelihood: number;
  impact: number;
  count: number;
  worst_category: RiskCategory;
}

/** Only occupied cells are listed; `pending` counts Risks without a Residual Rating. */
export interface RiskMatrix {
  cells: RiskMatrixCell[];
  pending: number;
  total: number;
}

/** Which of a Risk's three ratings a view is about. */
export type RatingKind = "inherent" | "residual" | "target";

export interface Risk {
  id: string;
  scope_id: string;
  scope_name: string;
  hazard_id: string;
  /** Embedded, so a reader never needs the Hazard catalogue to name it. */
  hazard: Pick<Hazard, "id" | "category" | "name_de" | "name_en">;
  asset_ids: string[];
  /** The affected Assets with what a reader needs, in the order of `asset_ids`. */
  assets: Pick<Asset, "id" | "name" | "criticality">[];
  title_de: string;
  owner_id: string;
  owner_name: string | null;
  inherent: Rating;
  target: Rating;
  /** Null while the risk engine hasn't calculated it, e.g. when it is unreachable. */
  residual: ResidualRating | null;
  treatments: Treatment[];
}

// ---------- Activity Log ----------

export type ActivityAction =
  "created" | "updated" | "deleted" | "approved" | "rejected" | "commented";

export interface FieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface ActivityEntry {
  id: string;
  occurred_at: string;
  actor_id: string;
  /** Embedded, so a reader never needs the whole member list to name who did it. */
  actor_name: string;
  action: ActivityAction;
  object_type: string;
  object_id: string;
  object_label: string;
  changes: FieldChange[];
}
