import { AffinityClient } from './client.js';
import { CACHE_TTL } from '../cache.js';
import type { AffinityOrganization } from './types.js';

export class OrganizationsApi {
  constructor(private client: AffinityClient) {}

  /**
   * Search organizations by name or domain term.
   */
  async search(term: string, limit = 20): Promise<AffinityOrganization[]> {
    const cacheKey = `orgs:search:${term}:${limit}`;
    const cached = await this.client.cache.get<AffinityOrganization[]>(cacheKey);
    if (cached) return cached;

    const result = await this.client.get<{ organizations: AffinityOrganization[] }>(
      '/organizations',
      { term, page_size: limit }
    );
    const orgs = result.organizations ?? [];
    await this.client.cache.set(cacheKey, orgs, CACHE_TTL.profile);
    return orgs;
  }

  /**
   * Get a single organization by ID, with full field data.
   */
  async getById(orgId: number): Promise<AffinityOrganization> {
    const cacheKey = `orgs:${orgId}`;
    const cached = await this.client.cache.get<AffinityOrganization>(cacheKey);
    if (cached) return cached;

    const org = await this.client.get<AffinityOrganization>(`/organizations/${orgId}`, {
      with_interaction_dates: true,
    });
    await this.client.cache.set(cacheKey, org, CACHE_TTL.profile);
    return org;
  }
}
