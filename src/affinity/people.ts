import { AffinityClient } from './client.js';
import type { AffinityPerson, AffinityPaginatedResponse } from './types.js';

export class PeopleApi {
  constructor(private client: AffinityClient) {}

  /**
   * Search people by name or email term.
   */
  async search(term: string, limit = 20): Promise<AffinityPerson[]> {
    const result = await this.client.get<{ persons: AffinityPerson[] }>('/persons', {
      term,
      page_size: limit,
    });
    return result.persons ?? [];
  }

  /**
   * Get a single person by ID, with full field data.
   */
  async getById(personId: number): Promise<AffinityPerson> {
    return this.client.get<AffinityPerson>(`/persons/${personId}`, {
      with_interaction_dates: true,
    });
  }
}
