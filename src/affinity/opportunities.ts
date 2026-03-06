// Affinity v1 opportunity endpoints: /opportunities, /opportunities/:id
//
// Opportunities are deal records in Affinity. They appear as entity_type 8 in
// list entries and can be associated with people and organizations.

import { AffinityClient, AffinityNotFoundError } from './client.js';
import { CACHE_TTL } from '../cache.js';
import type { AffinityOpportunity } from './types.js';

export class OpportunitiesApi {
  constructor(private client: AffinityClient) {}

  /**
   * Search/list opportunities. Pass `term` to filter by name;
   * pass `listId` to scope results to a specific list.
   * Not cached — search results are dynamic.
   */
  async search(term?: string, listId?: number): Promise<AffinityOpportunity[]> {
    const params: Record<string, unknown> = {};
    if (term) params.term = term;
    if (listId != null) params.list_id = listId;
    const result = await this.client.get<AffinityOpportunity[]>('/opportunities', params);
    return Array.isArray(result) ? result : [];
  }

  /** Fetch a single opportunity by ID. Returns null if not found. Cached at 5 min TTL. */
  async getById(id: number): Promise<AffinityOpportunity | null> {
    const cacheKey = `opportunity:${id}`;
    const cached = await this.client.cache.get<AffinityOpportunity>(cacheKey);
    if (cached) return cached;

    try {
      const opp = await this.client.get<AffinityOpportunity>(`/opportunities/${id}`);
      await this.client.cache.set(cacheKey, opp, CACHE_TTL.profile);
      return opp;
    } catch (e: unknown) {
      if (e instanceof AffinityNotFoundError) return null;
      throw e;
    }
  }

  /**
   * Create a new opportunity. Optionally supply `list_id` to add it to a list immediately.
   * Cache is not pre-populated — a subsequent getById will prime it.
   */
  async create(params: {
    name: string;
    person_ids?: number[];
    organization_ids?: number[];
    list_id?: number;
  }): Promise<AffinityOpportunity> {
    return this.client.post<AffinityOpportunity>('/opportunities', params);
  }

  /**
   * Update an existing opportunity (name, person associations, org associations).
   * Updates the cache entry on success.
   */
  async update(
    id: number,
    params: { name?: string; person_ids?: number[]; organization_ids?: number[] },
  ): Promise<AffinityOpportunity> {
    const opp = await this.client.put<AffinityOpportunity>(`/opportunities/${id}`, params);
    await this.client.cache.set(`opportunity:${id}`, opp, CACHE_TTL.profile);
    return opp;
  }
}
