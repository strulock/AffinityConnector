import { AffinityClient } from './client.js';
import type { AffinityOrganization } from './types.js';

export class OrganizationsApi {
  constructor(private client: AffinityClient) {}

  /**
   * Search organizations by name or domain term.
   */
  async search(term: string, limit = 20): Promise<AffinityOrganization[]> {
    const result = await this.client.get<{ organizations: AffinityOrganization[] }>(
      '/organizations',
      { term, page_size: limit }
    );
    return result.organizations ?? [];
  }

  /**
   * Get a single organization by ID, with full field data.
   */
  async getById(orgId: number): Promise<AffinityOrganization> {
    return this.client.get<AffinityOrganization>(`/organizations/${orgId}`, {
      with_interaction_dates: true,
    });
  }
}
