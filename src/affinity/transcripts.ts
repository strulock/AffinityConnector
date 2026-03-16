// Affinity v2 transcript endpoints (BETA): /transcripts, /transcripts/{id}/fragments

import { AffinityClient } from './client.js';
import { extractCursor } from './pagination.js';
import type { AffinityTranscript, AffinityTranscriptFragment, AffinityCursorPaginatedResponse } from './types.js';

export class TranscriptsApi {
  constructor(private client: AffinityClient) {}

  /** List transcripts with optional filter string and cursor pagination (v2 GET /transcripts). */
  async getTranscripts(
    params: { filter?: string; limit?: number; cursor?: string } = {},
  ): Promise<{ transcripts: AffinityTranscript[]; nextCursor?: string }> {
    const { limit = 20, cursor, filter } = params;
    const q: Record<string, unknown> = { limit };
    if (cursor) q.cursor = cursor;
    if (filter) q.filter = filter;

    const result = await this.client.get<AffinityCursorPaginatedResponse<AffinityTranscript>>(
      '/transcripts',
      q,
      'v2',
    );
    return {
      transcripts: result.data ?? [],
      nextCursor: extractCursor(result.pagination?.nextUrl),
    };
  }

  /** Get metadata for a single transcript (v2 GET /transcripts/{id}). */
  async getTranscript(transcriptId: number): Promise<AffinityTranscript> {
    return this.client.get<AffinityTranscript>(`/transcripts/${transcriptId}`, undefined, 'v2');
  }

  /**
   * Get content fragments for a transcript (v2 GET /transcripts/{id}/fragments).
   * Defaults to 20 fragments per page; paginate for long transcripts.
   */
  async getTranscriptFragments(
    transcriptId: number,
    params: { limit?: number; cursor?: string } = {},
  ): Promise<{ fragments: AffinityTranscriptFragment[]; nextCursor?: string }> {
    const { limit = 20, cursor } = params;
    const q: Record<string, unknown> = { limit };
    if (cursor) q.cursor = cursor;

    const result = await this.client.get<AffinityCursorPaginatedResponse<AffinityTranscriptFragment>>(
      `/transcripts/${transcriptId}/fragments`,
      q,
      'v2',
    );
    return {
      fragments: result.data ?? [],
      nextCursor: extractCursor(result.pagination?.nextUrl),
    };
  }
}
