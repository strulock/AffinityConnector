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

    // v1 returns an array of { internal_id, external_id, strength } where strength is 0–1 float
    const results = await this.client.get<Array<{ internal_id: number; external_id: number; strength: number }>>(
      '/relationships-strengths',
      { entity_id: entityId, entity_type: entityType },
    );
    const raw = Array.isArray(results) ? results[0] : null;
    const result: AffinityRelationshipStrength = {
      entity_id: entityId,
      entity_type: entityType,
      strength: raw ? Math.round(raw.strength * 100) : 0,
      last_activity_date: null,
    };
    await this.client.cache.set(cacheKey, result, CACHE_TTL.strength);
    return result;
  }
}
