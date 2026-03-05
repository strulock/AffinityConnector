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
