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
  type: number;
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
  value_type: number;
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
  type: number;
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
