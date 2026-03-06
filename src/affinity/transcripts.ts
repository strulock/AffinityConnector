// Affinity v2 transcript endpoints (BETA): /transcripts, /transcripts/{id}/fragments

import { AffinityClient } from './client.js';
import type { AffinityTranscript, AffinityTranscriptFragment, AffinityPaginatedResponse } from './types.js';

export class TranscriptsApi {
  constructor(private client: AffinityClient) {}

  /** List transcripts, optionally filtered by person or org (v2 GET /transcripts). */
  async getTranscripts(
    params: { person_id?: number; organization_id?: number; limit?: number; page_token?: string } = {},
  ): Promise<{ transcripts: AffinityTranscript[]; nextPageToken?: string }> {
    const { limit = 25, page_token, ...filters } = params;
    const q: Record<string, unknown> = { page_size: limit, ...filters };
    if (page_token) q.page_token = page_token;

    const result = await this.client.get<AffinityPaginatedResponse<AffinityTranscript>>(
      '/transcripts',
      q,
      'v2',
    );
    return {
      transcripts: result.data ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
  }

  /** Get metadata for a single transcript (v2 GET /transcripts/{id}). */
  async getTranscript(transcriptId: string): Promise<AffinityTranscript> {
    return this.client.get<AffinityTranscript>(`/transcripts/${transcriptId}`, undefined, 'v2');
  }

  /**
   * Get content fragments for a transcript (v2 GET /transcripts/{id}/fragments).
   * Defaults to 100 fragments per page; paginate for long transcripts.
   */
  async getTranscriptFragments(
    transcriptId: string,
    params: { limit?: number; page_token?: string } = {},
  ): Promise<{ fragments: AffinityTranscriptFragment[]; nextPageToken?: string }> {
    const { limit = 100, page_token } = params;
    const q: Record<string, unknown> = { page_size: limit };
    if (page_token) q.page_token = page_token;

    const result = await this.client.get<AffinityPaginatedResponse<AffinityTranscriptFragment>>(
      `/transcripts/${transcriptId}/fragments`,
      q,
      'v2',
    );
    return {
      fragments: result.data ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
  }
}
