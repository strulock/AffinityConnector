import { AffinityClient } from './client.js';
import { CACHE_TTL } from '../cache.js';
import type { AffinityPerson, AffinityPaginatedResponse } from './types.js';

export class PeopleApi {
  constructor(private client: AffinityClient) {}

  /**
   * Search people by name or email term.
   */
  async search(term: string, limit = 20): Promise<AffinityPerson[]> {
    const cacheKey = `people:search:${term}:${limit}`;
    const cached = await this.client.cache.get<AffinityPerson[]>(cacheKey);
    if (cached) return cached;

    const result = await this.client.get<{ persons: AffinityPerson[] }>('/persons', {
      term,
      page_size: limit,
    });
    const people = result.persons ?? [];
    await this.client.cache.set(cacheKey, people, CACHE_TTL.profile);
    return people;
  }

  /**
   * Get a single person by ID, with full field data.
   */
  async getById(personId: number): Promise<AffinityPerson> {
    const cacheKey = `people:${personId}`;
    const cached = await this.client.cache.get<AffinityPerson>(cacheKey);
    if (cached) return cached;

    const person = await this.client.get<AffinityPerson>(`/persons/${personId}`, {
      with_interaction_dates: true,
    });
    await this.client.cache.set(cacheKey, person, CACHE_TTL.profile);
    return person;
  }
}
