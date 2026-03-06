// Affinity utility endpoints: current user (v2) and rate limit (v1).

import { AffinityClient } from './client.js';
import type { AffinityCurrentUser, AffinityRateLimit } from './types.js';

export class UtilityApi {
  constructor(private client: AffinityClient) {}

  /** Get the authenticated user and their org (v2 GET /auth/current-user). */
  async getCurrentUser(): Promise<AffinityCurrentUser> {
    return this.client.get<AffinityCurrentUser>('/auth/current-user', undefined, 'v2');
  }

  /** Get current API rate limit quota (v1 GET /rate-limit). */
  async getRateLimit(): Promise<AffinityRateLimit> {
    return this.client.get<AffinityRateLimit>('/rate-limit');
  }
}
