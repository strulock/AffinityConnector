// Affinity v1 reminders endpoints: /reminders

import { AffinityClient } from './client.js';
import { CACHE_TTL, stableKey } from '../cache.js';
import type { AffinityReminder } from './types.js';

export class RemindersApi {
  constructor(private client: AffinityClient) {}

  /**
   * Fetch reminders, optionally filtered by person, org, or opportunity.
   * v1 returns a plain array.
   */
  async getReminders(params: {
    person_id?: number;
    organization_id?: number;
    opportunity_id?: number;
  } = {}): Promise<AffinityReminder[]> {
    const cacheKey = stableKey('reminders', params as Record<string, unknown>);
    const cached = await this.client.cache.get<AffinityReminder[]>(cacheKey);
    if (cached) return cached;

    const raw = await this.client.get<AffinityReminder[]>('/reminders', params);
    const reminders = Array.isArray(raw) ? raw : [];
    await this.client.cache.set(cacheKey, reminders, CACHE_TTL.reminders);
    return reminders;
  }

  /**
   * Create a reminder (v1 POST /reminders).
   * At least one of person_ids, organization_ids, or opportunity_ids must be non-empty.
   */
  async createReminder(params: {
    content: string;
    due_date: string;
    person_ids?: number[];
    organization_ids?: number[];
    opportunity_ids?: number[];
  }): Promise<AffinityReminder> {
    const body: Record<string, unknown> = {
      content: params.content,
      due_date: params.due_date,
    };
    // Only include association arrays if non-empty — the v1 API rejects empty arrays
    if (params.person_ids?.length) body.person_ids = params.person_ids;
    if (params.organization_ids?.length) body.organization_ids = params.organization_ids;
    if (params.opportunity_ids?.length) body.opportunity_ids = params.opportunity_ids;
    return this.client.post<AffinityReminder>('/reminders', body);
  }

  /**
   * Update a reminder (v1 PUT /reminders/{id}).
   * Only supplied fields are changed.
   */
  async updateReminder(
    reminderId: number,
    params: { content?: string; due_date?: string; completed?: boolean },
  ): Promise<AffinityReminder> {
    return this.client.put<AffinityReminder>(`/reminders/${reminderId}`, params);
  }

  /** Delete a reminder (v1 DELETE /reminders/{id}). */
  async deleteReminder(reminderId: number): Promise<void> {
    await this.client.del<{ success: boolean }>(`/reminders/${reminderId}`);
  }
}
