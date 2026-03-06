// Affinity v2 interaction endpoints: /emails, /calls, /meetings, /chat-messages
// These provide granular per-channel history with richer metadata than the v1 /interactions endpoint.

import { AffinityClient } from './client.js';
import type {
  AffinityEmailV2,
  AffinityCallV2,
  AffinityMeetingV2,
  AffinityChatMessageV2,
  AffinityPaginatedResponse,
} from './types.js';

type CommonParams = {
  person_id?: number;
  organization_id?: number;
  created_after?: string;
  created_before?: string;
  limit?: number;
  page_token?: string;
};

function buildParams(params: CommonParams): Record<string, unknown> {
  const { limit = 25, page_token, ...filters } = params;
  const q: Record<string, unknown> = { page_size: limit, ...filters };
  if (page_token) q.page_token = page_token;
  return q;
}

export class InteractionsV2Api {
  constructor(private client: AffinityClient) {}

  /** Fetch email history (v2 GET /emails). Filterable by person/org and date range. */
  async getEmails(
    params: CommonParams = {},
  ): Promise<{ emails: AffinityEmailV2[]; nextPageToken?: string }> {
    const result = await this.client.get<AffinityPaginatedResponse<AffinityEmailV2>>(
      '/emails',
      buildParams(params),
      'v2',
    );
    return {
      emails: result.data ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
  }

  /** Fetch call history (v2 GET /calls). Filterable by person/org and date range. */
  async getCalls(
    params: CommonParams = {},
  ): Promise<{ calls: AffinityCallV2[]; nextPageToken?: string }> {
    const result = await this.client.get<AffinityPaginatedResponse<AffinityCallV2>>(
      '/calls',
      buildParams(params),
      'v2',
    );
    return {
      calls: result.data ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
  }

  /** Fetch meeting history (v2 GET /meetings). Filterable by person/org and date range. */
  async getMeetings(
    params: CommonParams = {},
  ): Promise<{ meetings: AffinityMeetingV2[]; nextPageToken?: string }> {
    const result = await this.client.get<AffinityPaginatedResponse<AffinityMeetingV2>>(
      '/meetings',
      buildParams(params),
      'v2',
    );
    return {
      meetings: result.data ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
  }

  /** Fetch chat message history (v2 GET /chat-messages). Filterable by person/org and date range. */
  async getChatMessages(
    params: CommonParams = {},
  ): Promise<{ messages: AffinityChatMessageV2[]; nextPageToken?: string }> {
    const result = await this.client.get<AffinityPaginatedResponse<AffinityChatMessageV2>>(
      '/chat-messages',
      buildParams(params),
      'v2',
    );
    return {
      messages: result.data ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
  }
}
