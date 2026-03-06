// Affinity v1 notes and interactions endpoints: /notes, /interactions

import { AffinityClient } from './client.js';
import { CACHE_TTL } from '../cache.js';
import type { AffinityNote, AffinityInteraction, AffinityNoteReply, AffinityPaginatedResponse } from './types.js';

export class NotesApi {
  constructor(private client: AffinityClient) {}

  /**
   * Fetch notes, optionally filtered by person, organization, or opportunity.
   * v1 returns a plain array — we wrap it in `{ notes }` for consistency.
   */
  async getNotes(params: {
    person_id?: number;
    organization_id?: number;
    opportunity_id?: number;
    limit?: number;
    page_token?: string;
  }): Promise<{ notes: AffinityNote[]; nextPageToken?: string }> {
    const { limit = 25, page_token, ...filters } = params;
    const cacheKey = `notes:${JSON.stringify(filters)}:${limit}:${page_token ?? ''}`;
    const cached = await this.client.cache.get<{ notes: AffinityNote[] }>(cacheKey);
    if (cached) return cached;

    const queryParams: Record<string, unknown> = { page_size: limit, ...filters };
    if (page_token) queryParams.page_token = page_token;

    // v1 /notes returns an array directly
    const result = await this.client.get<AffinityNote[]>('/notes', queryParams);
    const response = { notes: Array.isArray(result) ? result : [] };
    await this.client.cache.set(cacheKey, response, CACHE_TTL.notes);
    return response;
  }

  /**
   * Create a plain-text note. `type: 0` is hardcoded — the Affinity v1 API only
   * supports plain text notes via the API (rich text types are UI-only).
   */
  async createNote(params: {
    content: string;
    person_ids?: number[];
    organization_ids?: number[];
    opportunity_ids?: number[];
  }): Promise<AffinityNote> {
    return this.client.post<AffinityNote>('/notes', {
      content: params.content,
      person_ids: params.person_ids ?? [],
      organization_ids: params.organization_ids ?? [],
      opportunity_ids: params.opportunity_ids ?? [],
      type: 0,
    });
  }

  /**
   * Fetch email and meeting interactions, optionally filtered by person or org.
   * v1 returns a plain array — we wrap it in `{ interactions }` for consistency.
   */
  async getInteractions(params: {
    person_id?: number;
    organization_id?: number;
    type?: number;
    limit?: number;
    page_token?: string;
  }): Promise<{ interactions: AffinityInteraction[]; nextPageToken?: string }> {
    const { limit = 25, page_token, ...filters } = params;
    const cacheKey = `interactions:${JSON.stringify(filters)}:${limit}:${page_token ?? ''}`;
    const cached = await this.client.cache.get<{ interactions: AffinityInteraction[] }>(cacheKey);
    if (cached) return cached;

    const queryParams: Record<string, unknown> = { page_size: limit, ...filters };
    if (page_token) queryParams.page_token = page_token;

    // v1 /interactions returns an array directly
    const result = await this.client.get<AffinityInteraction[]>('/interactions', queryParams);
    const response = { interactions: Array.isArray(result) ? result : [] };
    await this.client.cache.set(cacheKey, response, CACHE_TTL.interactions);
    return response;
  }

  /**
   * Fetch reply thread for a note (v2 GET /v2/notes/{id}/replies).
   * Note: the v2 main notes list excludes replies; they are fetched separately via this endpoint.
   */
  async getNoteReplies(
    noteId: number,
    params: { limit?: number; page_token?: string } = {},
  ): Promise<{ replies: AffinityNoteReply[]; nextPageToken?: string }> {
    const { limit = 25, page_token } = params;
    const queryParams: Record<string, unknown> = { page_size: limit };
    if (page_token) queryParams.page_token = page_token;

    const result = await this.client.get<AffinityPaginatedResponse<AffinityNoteReply>>(
      `/notes/${noteId}/replies`,
      queryParams,
      'v2',
    );
    return {
      replies: result.data ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
  }

  /** Update the content of an existing note (v1 PUT /notes/{id}). */
  async updateNote(noteId: number, content: string): Promise<AffinityNote> {
    return this.client.put<AffinityNote>(`/notes/${noteId}`, { content });
  }

  /** Delete a note by ID (v1 DELETE /notes/{id}). */
  async deleteNote(noteId: number): Promise<void> {
    await this.client.del<{ success: boolean }>(`/notes/${noteId}`);
  }
}
