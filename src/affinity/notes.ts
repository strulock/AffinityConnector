import { AffinityClient } from './client.js';
import { CACHE_TTL } from '../cache.js';
import type { AffinityNote, AffinityInteraction } from './types.js';

export class NotesApi {
  constructor(private client: AffinityClient) {}

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
}
