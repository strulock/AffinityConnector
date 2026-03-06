import { AffinityClient } from './client.js';
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
    return this.client.get<AffinityRelationshipStrength>('/relationships-strengths', {
      entity_id: entityId,
      entity_type: entityType,
    });
  }
}
