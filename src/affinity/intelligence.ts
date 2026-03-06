import { AffinityClient } from './client.js';
import { CACHE_TTL } from '../cache.js';
import type { AffinityRelationshipStrength } from './types.js';

export class IntelligenceApi {
  constructor(private client: AffinityClient) {}

  /**
   * Get relationship strength between the authenticated user and a person or organization.
   * entity_type: 0 = person, 1 = organization
   */
  async getRelationshipStrength(
    entityId: number,
    entityType: number
  ): Promise<AffinityRelationshipStrength> {
    const cacheKey = `strength:${entityType}:${entityId}`;
    const cached = await this.client.cache.get<AffinityRelationshipStrength>(cacheKey);
    if (cached) return cached;

    const result = await this.client.get<AffinityRelationshipStrength>('/relationships-strengths', {
      entity_id: entityId,
      entity_type: entityType,
    });
    await this.client.cache.set(cacheKey, result, CACHE_TTL.strength);
    return result;
  }
}
