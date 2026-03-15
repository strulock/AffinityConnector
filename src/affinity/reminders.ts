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
    // Only include association arrays if non-empty — the v1 API rejects empty arrays
    const body: {
      content: string;
      due_date: string;
      person_ids?: number[];
      organization_ids?: number[];
      opportunity_ids?: number[];
    } = {
      content: params.content,
      // v1 API expects ISO 8601 datetime; append time if only date provided
      due_date: params.due_date.includes('T') ? params.due_date : `${params.due_date}T00:00:00Z`,
      ...(params.person_ids?.length ? { person_ids: params.person_ids } : {}),
      ...(params.organization_ids?.length ? { organization_ids: params.organization_ids } : {}),
      ...(params.opportunity_ids?.length ? { opportunity_ids: params.opportunity_ids } : {}),
    };
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
    const body = { ...params };
    if (body.due_date && !body.due_date.includes('T')) {
      body.due_date = `${body.due_date}T00:00:00Z`;
    }
    return this.client.put<AffinityReminder>(`/reminders/${reminderId}`, body);
  }

  /** Delete a reminder (v1 DELETE /reminders/{id}). */
  async deleteReminder(reminderId: number): Promise<void> {
    await this.client.del<{ success: boolean }>(`/reminders/${reminderId}`);
  }
}
