// Affinity API response types

export interface AffinityPerson {
  id: number;
  type: number;
  first_name: string;
  last_name: string;
  emails: string[];
  primary_email: string | null;
  phones: AffinityPhone[];
  organization_ids: number[];
  opportunity_ids: number[];
  list_entries: AffinityListEntryRef[];
  interaction_dates: AffinityInteractionDates;
  created_at: string;
}

export interface AffinityPhone {
  number: string;
  extension: string | null;
}

export interface AffinityInteractionDates {
  first_email_date: string | null;
  last_email_date: string | null;
  first_event_date: string | null;
  last_event_date: string | null;
  last_interaction_date: string | null;
  next_event_date: string | null;
}

export interface AffinityListEntryRef {
  id: number;
  list_id: number;
  created_at: string;
}

export interface AffinityOrganization {
  id: number;
  name: string;
  domain: string | null;
  domains: string[];
  person_ids: number[];
  opportunity_ids: number[];
  list_entries: AffinityListEntryRef[];
  interaction_dates: AffinityInteractionDates;
  created_at: string;
}

export interface AffinityList {
  id: number;
  type: number; // 0 = Person, 1 = Organization, 8 = Opportunity
  name: string;
  public: boolean;
  owner_id: number;
  list_size: number;
  created_at: string;
}

export interface AffinitySearchResult<T> {
  persons?: T[];
  organizations?: T[];
  next_page_token?: string | null;
}

export interface AffinityPaginatedResponse<T> {
  data: T[];
  next_page_token?: string | null;
}

export interface AffinityOpportunity {
  id: number;
  name: string;
  person_ids: number[];
  organization_ids: number[];
  list_entries: AffinityListEntryRef[];
  created_at: string;
}

export interface AffinityListEntry {
  id: number;
  list_id: number;
  entity_id: number;
  entity_type: number; // 0 = Person, 1 = Organization, 8 = Opportunity
  entity: AffinityPerson | AffinityOrganization | AffinityOpportunity;
  creator_id: number | null;
  created_at: string;
}

export interface AffinityField {
  id: number;
  name: string;
  list_id: number | null;
  value_type: number; // 0 = text, 1 = number, 2 = date, 3 = location, 4 = person, 5 = organization, 6 = dropdown
  allows_multiple: boolean;
  is_required: boolean;
  is_read_only: boolean;
}

export interface AffinityFieldValue {
  id: number;
  field_id: number;
  field?: AffinityField | null;
  entity_type: number;
  entity_id: number;
  list_entry_id: number | null;
  value: unknown;
}

export interface AffinityNote {
  id: number;
  person_ids: number[];
  organization_ids: number[];
  opportunity_ids: number[];
  creator_id: number;
  content: string;
  type: number; // 0 = plain text (only supported type via API)
  is_deleted: boolean;
  created_at: string;
}

export interface AffinityInteraction {
  id: number;
  type: number; // 0 = email, 1 = meeting
  date: string;
  subject: string | null;
  body_text: string | null;
  person_ids: number[];
  organization_ids: number[];
  creator_ids: number[];
}

export interface AffinityRelationshipStrength {
  entity_id: number;
  entity_type: number; // 0 = person, 1 = org
  strength: number; // 0–100
  last_activity_date: string | null;
}

// v2 interaction types — granular per-channel endpoints replacing v1 /interactions

export interface AffinityEmailV2 {
  id: string;
  subject: string | null;
  sent_at: string;
  created_at: string;
  person_ids: number[];
  organization_ids: number[];
}

export interface AffinityCallV2 {
  id: string;
  start_time: string;
  created_at: string;
  person_ids: number[];
  organization_ids: number[];
}

export interface AffinityMeetingV2 {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string | null;
  created_at: string;
  person_ids: number[];
  organization_ids: number[];
}

export interface AffinityChatMessageV2 {
  id: string;
  content: string | null;
  sent_at: string;
  created_at: string;
  person_ids: number[];
  organization_ids: number[];
}

export interface AffinityNoteReply {
  id: number;
  note_id: number;
  creator_id: number;
  content: string;
  created_at: string;
}

export interface AffinityReminder {
  id: number;
  content: string;
  due_date: string;
  person_ids: number[];
  organization_ids: number[];
  opportunity_ids: number[];
  creator_id: number;
  completed_at: string | null;
  created_at: string;
}

export interface AffinitySavedView {
  id: number;
  list_id: number;
  name: string;
  creator_id: number;
  is_public: boolean;
}

export interface AffinityFieldValueChange {
  id: number;
  field_id: number;
  entity_id: number | null;
  entity_type: number | null; // 0 = person, 1 = organization, 8 = opportunity
  list_entry_id: number | null;
  value: unknown;        // the new value after this change
  changed_by_id: number;
  changed_at: string;
}

// Semantic search (v2 BETA) — companies/orgs only
export interface AffinitySemanticResult {
  id: number;
  name: string;
  domain: string | null;
  domains: string[];
  person_ids: number[];
  created_at: string;
}

// Transcripts (v2 BETA)
export interface AffinityTranscript {
  id: string;
  title: string | null;
  call_id: string | null;
  meeting_id: string | null;
  created_at: string;
  person_ids: number[];
  organization_ids: number[];
}

export interface AffinityTranscriptFragment {
  id: string;
  transcript_id: string;
  speaker_label: string | null;
  content: string;
  start_ms: number;
  end_ms: number;
}

// Merges (v2 deduplication)
export interface AffinityMergeTask {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  merges: AffinityMerge[];
  created_at: string;
}

export interface AffinityMerge {
  id: string;
  task_id: string;
  base_entity_id: number;
  to_merge_entity_id: number;
  status: 'pending' | 'completed' | 'failed';
}

// Utility
export interface AffinityCurrentUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  organization_id: number;
  organization_name: string | null;
}

export interface AffinityRateLimit {
  limit: number;
  remaining: number;
  reset_in: number;
}
