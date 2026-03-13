// Affinity v1 webhook endpoints: /webhook

import { AffinityClient } from './client.js';
import type { AffinityWebhookSubscription } from './types.js';

export class WebhooksApi {
  constructor(private client: AffinityClient) {}

  /** List all registered webhook subscriptions. */
  async listWebhooks(): Promise<AffinityWebhookSubscription[]> {
    const result = await this.client.get<AffinityWebhookSubscription[]>('/webhook');
    return Array.isArray(result) ? result : [];
  }

  /** Register a new webhook subscription. */
  async createWebhook(webhookUrl: string): Promise<AffinityWebhookSubscription> {
    return this.client.post<AffinityWebhookSubscription>(
      `/webhook/subscribe?webhook_url=${encodeURIComponent(webhookUrl)}`,
      undefined,
    );
  }

  /** Update an existing webhook subscription (URL, event list, or disabled flag). */
  async updateWebhook(
    id: number,
    params: { webhook_url?: string; subscriptions?: string[]; disabled?: boolean },
  ): Promise<AffinityWebhookSubscription> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) qs.set(key, String(value));
    }
    return this.client.put<AffinityWebhookSubscription>(`/webhook/${id}?${qs}`, undefined);
  }

  /** Delete a webhook subscription by ID. */
  async deleteWebhook(id: number): Promise<void> {
    await this.client.del<{ success: boolean }>(`/webhook/${id}`);
  }
}
