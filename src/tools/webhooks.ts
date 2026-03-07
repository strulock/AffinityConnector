// MCP tools for Affinity webhook subscriptions and the KV-backed event log.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebhooksApi } from '../affinity/webhooks.js';
import { KVCache } from '../cache.js';
import { PeopleApi } from '../affinity/people.js';
import { OrganizationsApi } from '../affinity/organizations.js';
import type { AffinityWebhookSubscription, AffinityWebhookEvent } from '../affinity/types.js';

const WEBHOOK_RECENT_KEY = 'webhook:recent';
const DEFAULT_WEBHOOK_URL = 'https://affinity.trulock.com/webhook';

function formatWebhook(w: AffinityWebhookSubscription): string {
  return `[webhook:${w.id}] ${w.state} — ${w.webhook_url}\n  Events: ${w.subscriptions.join(', ')}`;
}

export function registerWebhookTools(
  server: McpServer,
  api: WebhooksApi,
  cache: KVCache,
  peopleApi: PeopleApi,
  orgsApi: OrganizationsApi,
): void {
  server.tool(
    'list_webhooks',
    'List all Affinity webhook subscriptions registered for this workspace, including their IDs, target URLs, event types, and active/inactive state.',
    {},
    async () => {
      const webhooks = await api.listWebhooks();
      if (webhooks.length === 0) {
        return { content: [{ type: 'text', text: 'No webhook subscriptions found.' }] };
      }
      const lines = webhooks.map(formatWebhook);
      return {
        content: [{ type: 'text', text: `${webhooks.length} webhook(s):\n\n${lines.join('\n\n')}` }],
      };
    }
  );

  server.tool(
    'create_webhook',
    'Register a new Affinity webhook subscription. Available event types: person.created, person.updated, organization.created, organization.updated, note.created, field_value.created, field_value.updated, field_value.deleted, list_entry.created, list_entry.deleted. The target URL defaults to https://affinity.trulock.com/webhook.',
    {
      subscriptions: z.array(z.string()).describe('Event types to subscribe to (e.g. ["person.created", "note.created"])'),
      webhook_url: z.string().optional().describe(`Target URL to receive events (defaults to ${DEFAULT_WEBHOOK_URL})`),
    },
    async ({ subscriptions, webhook_url }) => {
      const url = webhook_url ?? DEFAULT_WEBHOOK_URL;
      const webhook = await api.createWebhook({ webhook_url: url, subscriptions });
      return {
        content: [{
          type: 'text',
          text: `Created webhook [id:${webhook.id}] (${webhook.state}) → ${webhook.webhook_url}\nEvents: ${webhook.subscriptions.join(', ')}`,
        }],
      };
    }
  );

  server.tool(
    'update_webhook',
    'Update an Affinity webhook subscription. Change the target URL, event list, or toggle active/inactive.',
    {
      webhook_id: z.number().int().describe('Webhook subscription ID (from list_webhooks)'),
      webhook_url: z.string().optional().describe('New target URL'),
      subscriptions: z.array(z.string()).optional().describe('New event types list (replaces the existing list)'),
      state: z.enum(['active', 'inactive']).optional().describe('Set to "inactive" to pause delivery'),
    },
    async ({ webhook_id, webhook_url, subscriptions, state }) => {
      if (webhook_url === undefined && subscriptions === undefined && state === undefined) {
        return {
          content: [{ type: 'text', text: 'Provide at least one field to update.' }],
        };
      }
      const webhook = await api.updateWebhook(webhook_id, { webhook_url, subscriptions, state });
      return {
        content: [{
          type: 'text',
          text: `Updated webhook [id:${webhook.id}] (${webhook.state}) → ${webhook.webhook_url}`,
        }],
      };
    }
  );

  server.tool(
    'delete_webhook',
    'Delete an Affinity webhook subscription by ID. Use list_webhooks to find webhook IDs.',
    {
      webhook_id: z.number().int().describe('Webhook subscription ID to delete (from list_webhooks)'),
    },
    async ({ webhook_id }) => {
      await api.deleteWebhook(webhook_id);
      return {
        content: [{ type: 'text', text: `Webhook ${webhook_id} deleted successfully.` }],
      };
    }
  );

  server.tool(
    'get_recent_events',
    'Get recent Affinity webhook events received by this Worker. Optionally filter by event_type (e.g. "person.created") or entity_id. Use enrich=true to append the current entity name to each event (capped at 5 enrichments). Returns events newest-first.',
    {
      event_type: z.string().optional().describe('Filter to a specific event type (e.g. "person.created")'),
      entity_id: z.number().int().optional().describe('Filter to events involving a specific entity ID'),
      limit: z.number().int().min(1).max(100).optional().describe('Maximum number of events to return (default 20)'),
      enrich: z.boolean().optional().describe('Fetch and append the current entity name for each event (max 5, default false)'),
    },
    async ({ event_type, entity_id, limit = 20, enrich = false }) => {
      const recentIds = await cache.get<string[]>(WEBHOOK_RECENT_KEY) ?? [];
      if (recentIds.length === 0) {
        return { content: [{ type: 'text', text: 'No webhook events received yet.' }] };
      }

      const events: AffinityWebhookEvent[] = [];
      for (const id of recentIds) {
        const event = await cache.get<AffinityWebhookEvent>(`webhook:event:${id}`);
        if (event) events.push(event);
      }

      let filtered = events;
      if (event_type) filtered = filtered.filter(e => e.type === event_type);
      if (entity_id !== undefined) {
        filtered = filtered.filter(e => e.body.id === entity_id || e.body.entity_id === entity_id);
      }

      const limited = filtered.slice(0, limit);
      if (limited.length === 0) {
        return { content: [{ type: 'text', text: 'No events match the specified filters.' }] };
      }

      if (enrich) {
        const ENRICH_LIMIT = 5;
        const toEnrich = limited.slice(0, ENRICH_LIMIT);
        const rest = limited.slice(ENRICH_LIMIT);

        const enrichedLines = await Promise.all(toEnrich.map(async e => {
          const baseText = `[${e.type}] ${e.created_at} — id:${e.id}`;
          const entityId = typeof e.body.id === 'number' ? e.body.id
            : typeof e.body.entity_id === 'number' ? e.body.entity_id
            : null;
          if (entityId === null) return baseText;

          const prefix = e.type.split('.')[0];
          try {
            if (prefix === 'person') {
              const p = await peopleApi.getById(entityId);
              const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)';
              return `${baseText} → ${name} <${p.primary_email ?? 'no email'}>`;
            } else if (prefix === 'organization') {
              const o = await orgsApi.getById(entityId);
              return `${baseText} → ${o.name}`;
            }
          } catch {
            // entity not found or API error — return base text
          }
          return baseText;
        }));

        const restLines = rest.map(e => `[${e.type}] ${e.created_at} — id:${e.id}`);
        const allLines = [...enrichedLines, ...restLines];
        return {
          content: [{ type: 'text', text: `${limited.length} event(s):\n\n${allLines.join('\n')}` }],
        };
      }

      const lines = limited.map(e => `[${e.type}] ${e.created_at} — id:${e.id}`);
      return {
        content: [{ type: 'text', text: `${limited.length} event(s):\n\n${lines.join('\n')}` }],
      };
    }
  );
}
