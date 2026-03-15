// MCP tools for Affinity webhook subscriptions and the KV-backed event log.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebhooksApi } from '../affinity/webhooks.js';
import { KVCache } from '../cache.js';
import { PeopleApi } from '../affinity/people.js';
import { OrganizationsApi } from '../affinity/organizations.js';
import { toolError } from './_error.js';
import type { AffinityWebhookSubscription, AffinityWebhookEvent } from '../affinity/types.js';

const WEBHOOK_RECENT_KEY = 'webhook:recent';
const DEFAULT_WEBHOOK_URL = 'https://affinity.trulock.com/webhook';

function formatWebhook(w: AffinityWebhookSubscription): string {
  const events = w.subscriptions.length ? w.subscriptions.join(', ') : 'all';
  return `[webhook:${w.id}] ${w.disabled ? 'disabled' : 'active'} — ${w.webhook_url}\n  Events: ${events}`;
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
      try {
        const webhooks = await api.listWebhooks();
        if (webhooks.length === 0) {
          return { content: [{ type: 'text', text: 'No webhook subscriptions found.' }] };
        }
        const lines = webhooks.map(formatWebhook);
        return {
          content: [{ type: 'text', text: `${webhooks.length} webhook(s):\n\n${lines.join('\n\n')}` }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'create_webhook',
    `Register a new Affinity webhook subscription. The target URL defaults to ${DEFAULT_WEBHOOK_URL}.`,
    {
      webhook_url: z.string().url().refine(u => u.startsWith('https://'), { message: 'webhook_url must be an https:// URL' }).optional().describe(`Target URL to receive events (defaults to ${DEFAULT_WEBHOOK_URL})`),
    },
    async ({ webhook_url }) => {
      try {
        const url = webhook_url ?? DEFAULT_WEBHOOK_URL;
        const webhook = await api.createWebhook(url);
        return {
          content: [{
            type: 'text',
            text: `Created webhook [id:${webhook.id}] (${webhook.disabled ? 'disabled' : 'active'}) → ${webhook.webhook_url}`,
          }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'update_webhook',
    'Update an Affinity webhook subscription. Change the target URL, event list, or enable/disable it.',
    {
      webhook_id: z.coerce.number().int().min(1).describe('Webhook subscription ID (from list_webhooks)'),
      webhook_url: z.string().url().refine(u => u.startsWith('https://'), { message: 'webhook_url must be an https:// URL' }).optional().describe('New target URL'),
      subscriptions: z.array(z.string()).optional().describe('New event types list (replaces the existing list)'),
      disabled: z.boolean().optional().describe('Set to true to disable delivery, false to re-enable'),
    },
    async ({ webhook_id, webhook_url, subscriptions, disabled }) => {
      if (webhook_url === undefined && subscriptions === undefined && disabled === undefined) {
        return {
          content: [{ type: 'text', text: 'Provide at least one field to update.' }],
        };
      }
      try {
        const webhook = await api.updateWebhook(webhook_id, { webhook_url, subscriptions, disabled });
        return {
          content: [{
            type: 'text',
            text: `Updated webhook [id:${webhook.id}] (${webhook.disabled ? 'disabled' : 'active'}) → ${webhook.webhook_url}`,
          }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'delete_webhook',
    'Delete an Affinity webhook subscription by ID. Use list_webhooks to find webhook IDs.',
    {
      webhook_id: z.coerce.number().int().min(1).describe('Webhook subscription ID to delete (from list_webhooks)'),
    },
    async ({ webhook_id }) => {
      try {
        await api.deleteWebhook(webhook_id);
        return {
          content: [{ type: 'text', text: `Webhook ${webhook_id} deleted successfully.` }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'get_recent_events',
    'Get recent Affinity webhook events received by this Worker. Stores the most recent 100 events — older events are not available. Optionally filter by event_type (e.g. "person.created") or entity_id. Use enrich=true to append the current entity name to each event (enrichment capped at 5 events). Returns events newest-first.',
    {
      event_type: z.string().optional().describe('Filter to a specific event type (e.g. "person.created")'),
      entity_id: z.coerce.number().int().min(1).optional().describe('Filter to events involving a specific entity ID'),
      limit: z.coerce.number().int().min(1).max(100).optional().describe('Maximum number of events to return (default 20)'),
      enrich: z.boolean().optional().describe('Fetch and append the current entity name for each event (max 5, default false)'),
    },
    async ({ event_type, entity_id, limit = 20, enrich = false }) => {
      const recentIds = await cache.get<string[]>(WEBHOOK_RECENT_KEY) ?? [];
      if (recentIds.length === 0) {
        return { content: [{ type: 'text', text: 'No webhook events received yet.' }] };
      }

      const maybeEvents = await Promise.all(
        recentIds.map(id => cache.get<AffinityWebhookEvent>(`webhook:event:${id}`))
      );
      const events = maybeEvents.filter((e): e is AffinityWebhookEvent => e !== null);

      let filtered = events;
      if (event_type) filtered = filtered.filter(e => e.type === event_type);
      if (entity_id !== undefined) {
        filtered = filtered.filter(e => Number(e.body.id) === entity_id || Number(e.body.entity_id) === entity_id);
      }

      const limited = filtered.slice(0, limit);
      if (limited.length === 0) {
        return { content: [{ type: 'text', text: 'No events match the specified filters.' }] };
      }

      const formatTime = (ts: number) => new Date(ts * 1000).toISOString();
      const formatBase = (e: AffinityWebhookEvent) => {
        const entityId = typeof e.body.id === 'number' ? e.body.id
          : typeof e.body.entity_id === 'number' ? e.body.entity_id
          : null;
        const idPart = entityId !== null ? ` — entity:${entityId}` : '';
        return `[${e.type}] ${formatTime(e.sent_at)}${idPart}`;
      };

      if (enrich) {
        const ENRICH_LIMIT = 5;
        const toEnrich = limited.slice(0, ENRICH_LIMIT);
        const rest = limited.slice(ENRICH_LIMIT);

        const enrichedLines = await Promise.all(toEnrich.map(async e => {
          const baseText = formatBase(e);
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

        const restLines = rest.map(formatBase);
        const allLines = [...enrichedLines, ...restLines];
        return {
          content: [{ type: 'text', text: `${limited.length} event(s):\n\n${allLines.join('\n')}` }],
        };
      }

      const lines = limited.map(formatBase);
      return {
        content: [{ type: 'text', text: `${limited.length} event(s):\n\n${lines.join('\n')}` }],
      };
    }
  );
}
