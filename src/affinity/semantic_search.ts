// Affinity v2 semantic search (BETA) — AI-powered natural language search, companies only.

import { AffinityClient } from './client.js';
import type { AffinitySemanticResult, AffinityPaginatedResponse } from './types.js';

export class SemanticSearchApi {
  constructor(private client: AffinityClient) {}

  /**
   * Semantic (AI-powered) search over companies (v2 BETA).
   * Accepts natural language queries; currently supports companies only.
   * POST /v2/search with entity_types: ['company']
   */
  async search(
    query: string,
    params: { limit?: number; page_token?: string } = {},
  ): Promise<{ results: AffinitySemanticResult[]; nextPageToken?: string }> {
    const { limit = 25, page_token } = params;
    const body: Record<string, unknown> = { query, entity_types: ['company'], page_size: limit };
    if (page_token) body.page_token = page_token;

    const result = await this.client.post<AffinityPaginatedResponse<AffinitySemanticResult>>(
      '/search',
      body,
      'v2',
    );
    return {
      results: result.data ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
  }
}
