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

  /** Create a new person record (v1 POST /persons). */
  async create(params: {
    first_name: string;
    last_name: string;
    emails?: string[];
    organization_ids?: number[];
    phone_numbers?: string[];
  }): Promise<AffinityPerson> {
    return this.client.post<AffinityPerson>('/persons', params);
  }

  /**
   * Update an existing person (v1 PUT /persons/{id}).
   * Only supplied fields are changed. Updates the cache on success.
   */
  async update(
    personId: number,
    params: { first_name?: string; last_name?: string; emails?: string[]; organization_ids?: number[]; phone_numbers?: string[] },
  ): Promise<AffinityPerson> {
    const person = await this.client.put<AffinityPerson>(`/persons/${personId}`, params);
    await this.client.cache.set(`people:${personId}`, person, CACHE_TTL.profile);
    return person;
  }

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
