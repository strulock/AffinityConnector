// Affinity utility endpoints: current user (v2) and rate limit (v1).

import { AffinityClient } from './client.js';
import type { AffinityCurrentUser, AffinityRateLimit } from './types.js';

export class UtilityApi {
  constructor(private client: AffinityClient) {}

  /** Get the authenticated user and their org (v2 GET /auth/whoami). */
  async getCurrentUser(): Promise<AffinityCurrentUser> {
    const raw = await this.client.get<{
      user: { id: number; firstName: string; lastName: string; emailAddress: string };
      tenant: { id: number; name: string | null };
    }>('/auth/whoami', undefined, 'v2');
    return {
      id: raw.user.id,
      first_name: raw.user.firstName,
      last_name: raw.user.lastName,
      email: raw.user.emailAddress,
      organization_id: raw.tenant.id,
      organization_name: raw.tenant.name,
    };
  }

  /** Get current API rate limit quota (v1 GET /rate-limit). */
  async getRateLimit(): Promise<AffinityRateLimit> {
    const raw = await this.client.get<{
      rate: {
        org_monthly?: { limit: number; remaining: number; reset: number };
        api_key_per_minute?: { limit: number; remaining: number; reset: number };
      };
    }>('/rate-limit');
    const bucket = raw.rate?.api_key_per_minute ?? raw.rate?.org_monthly;
    return {
      limit: bucket?.limit ?? 0,
      remaining: bucket?.remaining ?? 0,
      reset_in: bucket?.reset ?? 0,
    };
  }
}
