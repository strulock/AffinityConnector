// Affinity v2 interaction endpoints: /emails, /calls, /meetings, /chat-messages
// These provide granular per-channel history with richer metadata than the v1 /interactions endpoint.
// The v2 API uses `limit` (not `page_size`), `cursor` (not `page_token`),
// and returns { data: [...], pagination: { prevUrl, nextUrl } }.

import { AffinityClient } from './client.js';
import { extractCursor } from './pagination.js';
import type {
  AffinityEmailV2,
  AffinityCallV2,
  AffinityMeetingV2,
  AffinityChatMessageV2,
  AffinityCursorPaginatedResponse,
} from './types.js';

type CommonParams = {
  created_after?: string;
  created_before?: string;
  limit?: number;
  page_token?: string;
};

/**
 * Normalise CommonParams into the v2 query-param shape.
 *
 * Affinity v2 filter language only accepts a fixed set of fields per endpoint
 * (meetings: id, startTime, createdAt, updatedAt). `person_id` and
 * `organization_id` are NOT valid filter fields — passing them yielded a 404
 * on every call. Entity-scoped queries are not supported by these endpoints;
 * use get_activity_timeline for entity-scoped interaction history.
 */
function buildParams(params: CommonParams): Record<string, unknown> {
  const { limit = 25, page_token, created_after, created_before } = params;
  const q: Record<string, unknown> = { limit };
  if (page_token) q.cursor = page_token;
  const filters: string[] = [];
  if (created_after) filters.push(`createdAt>=${created_after}`);
  if (created_before) filters.push(`createdAt<=${created_before}`);
  if (filters.length) q.filter = filters.join(' & ');
  return q;
}

export class InteractionsV2Api {
  constructor(private client: AffinityClient) {}

  /** Fetch email history (v2 GET /emails). Filterable by person/org and date range. */
  async getEmails(
    params: CommonParams = {},
  ): Promise<{ emails: AffinityEmailV2[]; nextPageToken?: string }> {
    const result = await this.client.get<AffinityCursorPaginatedResponse<AffinityEmailV2>>(
      '/emails',
      buildParams(params),
      'v2',
    );
    return {
      emails: result.data ?? [],
      nextPageToken: extractCursor(result.pagination?.nextUrl),
    };
  }

  /** Fetch call history (v2 GET /calls). Filterable by person/org and date range. */
  async getCalls(
    params: CommonParams = {},
  ): Promise<{ calls: AffinityCallV2[]; nextPageToken?: string }> {
    const result = await this.client.get<AffinityCursorPaginatedResponse<AffinityCallV2>>(
      '/calls',
      buildParams(params),
      'v2',
    );
    return {
      calls: result.data ?? [],
      nextPageToken: extractCursor(result.pagination?.nextUrl),
    };
  }

  /** Fetch meeting history (v2 GET /meetings). Filterable by person/org and date range. */
  async getMeetings(
    params: CommonParams = {},
  ): Promise<{ meetings: AffinityMeetingV2[]; nextPageToken?: string }> {
    const result = await this.client.get<AffinityCursorPaginatedResponse<AffinityMeetingV2>>(
      '/meetings',
      buildParams(params),
      'v2',
    );
    return {
      meetings: result.data ?? [],
      nextPageToken: extractCursor(result.pagination?.nextUrl),
    };
  }

  /** Fetch chat message history (v2 GET /chat-messages). Filterable by person/org and date range. */
  async getChatMessages(
    params: CommonParams = {},
  ): Promise<{ messages: AffinityChatMessageV2[]; nextPageToken?: string }> {
    const result = await this.client.get<AffinityCursorPaginatedResponse<AffinityChatMessageV2>>(
      '/chat-messages',
      buildParams(params),
      'v2',
    );
    return {
      messages: result.data ?? [],
      nextPageToken: extractCursor(result.pagination?.nextUrl),
    };
  }
}
