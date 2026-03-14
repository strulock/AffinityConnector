import { AffinityClient } from './client.js';
import { CACHE_TTL } from '../cache.js';
import type { AffinityRelationshipStrength } from './types.js';

export class IntelligenceApi {
  constructor(private client: AffinityClient) {}

  /**
   * Get relationship strength between the authenticated user and a person or organization.
   * v1 GET /relationships-strengths?external_id={entityId}&internal_id={authenticatedUserId}
   * Returns an array of { internal_id, external_id, strength } where strength is a 0–1 float.
   * entity_type is used only for display/caching — the API resolves entity type from the ID.
   */
  async getRelationshipStrength(
    entityId: number,
    entityType: number,
    internalId: number,
  ): Promise<AffinityRelationshipStrength> {
    const cacheKey = `strength:${entityType}:${entityId}`;
    const cached = await this.client.cache.get<AffinityRelationshipStrength>(cacheKey);
    if (cached) return cached;

    const results = await this.client.get<Array<{ internal_id: number; external_id: number; strength: number }>>(
      '/relationships-strengths',
      { external_id: entityId, internal_id: internalId },
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
