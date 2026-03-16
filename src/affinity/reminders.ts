// Affinity v1 reminders endpoints: /reminders

import { AffinityClient } from './client.js';
import { CACHE_TTL, stableKey } from '../cache.js';
import type { AffinityReminder } from './types.js';

export class RemindersApi {
  constructor(private client: AffinityClient) {}

  /**
   * Fetch reminders, optionally filtered by person, org, or opportunity.
   * v1 returns { reminders: [...] } (wrapped).
   */
  async getReminders(params: {
    person_id?: number;
    organization_id?: number;
    opportunity_id?: number;
  } = {}): Promise<AffinityReminder[]> {
    const cacheKey = stableKey('reminders', params as Record<string, unknown>);
    const cached = await this.client.cache.get<AffinityReminder[]>(cacheKey);
    if (cached) return cached;

    const raw = await this.client.get<AffinityReminder[] | { reminders: AffinityReminder[] } | null>('/reminders', params);
    const reminders = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && 'reminders' in raw) ? raw.reminders ?? [] : [];
    await this.client.cache.set(cacheKey, reminders, CACHE_TTL.reminders);
    return reminders;
  }

  /**
   * Create a reminder (v1 POST /reminders).
   * Requires: content, due_date, type, owner_id, and exactly one of person_id/organization_id/opportunity_id.
   */
  async createReminder(params: {
    content: string;
    due_date: string;
    owner_id: number;
    person_id?: number;
    organization_id?: number;
    opportunity_id?: number;
  }): Promise<AffinityReminder> {
    const body: Record<string, unknown> = {
      content: params.content,
      due_date: params.due_date.includes('T') ? params.due_date : `${params.due_date}T00:00:00Z`,
      type: 0, // one-time reminder
      owner_id: params.owner_id,
    };
    // API requires exactly one singular association ID
    if (params.person_id) body.person_id = params.person_id;
    if (params.organization_id) body.organization_id = params.organization_id;
    if (params.opportunity_id) body.opportunity_id = params.opportunity_id;
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
