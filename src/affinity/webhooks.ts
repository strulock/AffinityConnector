// Affinity v1 webhook subscription endpoints: /webhook-subscriptions

import { AffinityClient } from './client.js';
import type { AffinityWebhookSubscription } from './types.js';

export class WebhooksApi {
  constructor(private client: AffinityClient) {}

  /** List all registered webhook subscriptions. */
  async listWebhooks(): Promise<AffinityWebhookSubscription[]> {
    const result = await this.client.get<AffinityWebhookSubscription[]>('/webhook-subscriptions');
    return Array.isArray(result) ? result : [];
  }

  /** Register a new webhook subscription. */
  async createWebhook(params: {
    webhook_url: string;
    subscriptions: string[];
  }): Promise<AffinityWebhookSubscription> {
    return this.client.post<AffinityWebhookSubscription>('/webhook-subscriptions', params);
  }

  /** Update an existing webhook subscription (URL, event list, or active state). */
  async updateWebhook(
    id: number,
    params: { webhook_url?: string; subscriptions?: string[]; state?: 'active' | 'inactive' },
  ): Promise<AffinityWebhookSubscription> {
    return this.client.put<AffinityWebhookSubscription>(`/webhook-subscriptions/${id}`, params);
  }

  /** Delete a webhook subscription by ID. */
  async deleteWebhook(id: number): Promise<void> {
    await this.client.del<{ success: boolean }>(`/webhook-subscriptions/${id}`);
  }
}
