// MCP tool for an entity-scoped activity timeline (notes only).
//
// This previously also pulled emails and meetings via the v2 interaction endpoints,
// but those endpoints don't accept person/organization filters — every entity-scoped
// call returned 404 and was silently swallowed. The tool now reflects what the
// underlying API actually supports.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NotesApi } from '../affinity/notes.js';
import { toolError } from './_error.js';

export function registerActivityTimelineTool(
  server: McpServer,
  notesApi: NotesApi,
): void {
  server.tool(
    'get_activity_timeline',
    'Get a chronologically sorted note timeline for a person or organization. (Emails, meetings, calls, and chat messages cannot be filtered by entity in the v2 API; for last-interaction summary stats see get_person / get_organization, and for workspace-wide interaction lists see get_emails / get_meetings / get_calls / get_chat_messages.)',
    {
      person_id: z.coerce.number().int().min(1).optional().describe('Person ID to fetch activity for'),
      organization_id: z.coerce.number().int().min(1).optional().describe('Organization ID to fetch activity for'),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe('Max total items to return (default 20)'),
      since: z.string().optional().describe('ISO 8601 date — only return activity on or after this date'),
    },
    async ({ person_id, organization_id, limit, since }) => {
      if (person_id == null && organization_id == null) {
        return { content: [{ type: 'text', text: 'Provide either person_id or organization_id.' }] };
      }

      try {
        const { notes } = await notesApi.getNotes({ person_id, organization_id, limit });

        const items = notes.map(n => ({
          date: n.created_at,
          label: n.content.slice(0, 120),
        }));
        const filtered = since ? items.filter(i => i.date >= since) : items;
        filtered.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        const limited = filtered.slice(0, limit);

        if (limited.length === 0) {
          return { content: [{ type: 'text', text: 'No activity found.' }] };
        }

        const scope_label = person_id != null ? `person ${person_id}` : `organization ${organization_id}`;
        const since_label = since ? ` (since ${since})` : '';
        const lines = limited.map(item => `[${item.date.slice(0, 10)} Note] ${item.label}`);
        return {
          content: [{
            type: 'text',
            text: `${limited.length} activity item(s) for ${scope_label}${since_label}:\n\n${lines.join('\n')}`,
          }],
        };
      } catch (e) { return toolError(e); }
    }
  );
}
