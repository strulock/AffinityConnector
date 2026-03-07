// MCP tool for unified activity timeline across emails, meetings, and notes.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InteractionsV2Api } from '../affinity/interactions_v2.js';
import { NotesApi } from '../affinity/notes.js';

interface TimelineItem {
  date: string;
  type: 'Email' | 'Meeting' | 'Note';
  label: string;
}

function meetingDuration(start: string, end: string | null): string {
  if (!end) return '';
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return mins > 0 ? ` (${mins} min)` : '';
}

export function registerActivityTimelineTool(
  server: McpServer,
  interactionsV2Api: InteractionsV2Api,
  notesApi: NotesApi,
): void {
  server.tool(
    'get_activity_timeline',
    'Get a unified, chronologically sorted activity timeline for a person or organization — combines emails, meetings, and notes in a single view. Useful for pre-call prep or relationship reviews.',
    {
      person_id: z.number().int().optional().describe('Person ID to fetch activity for'),
      organization_id: z.number().int().optional().describe('Organization ID to fetch activity for'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max total items to return (default 20)'),
      since: z.string().optional().describe('ISO 8601 date — only return activity on or after this date'),
    },
    async ({ person_id, organization_id, limit, since }) => {
      if (person_id == null && organization_id == null) {
        return { content: [{ type: 'text', text: 'Provide either person_id or organization_id.' }] };
      }

      const scope = { person_id, organization_id, limit };

      const [{ emails }, { meetings }, { notes }] = await Promise.all([
        interactionsV2Api.getEmails(scope),
        interactionsV2Api.getMeetings(scope),
        notesApi.getNotes(scope),
      ]);

      const items: TimelineItem[] = [
        ...emails.map(e => ({
          date: e.sent_at,
          type: 'Email' as const,
          label: `Subject: ${e.subject ?? '(no subject)'}`,
        })),
        ...meetings.map(m => ({
          date: m.start_time,
          type: 'Meeting' as const,
          label: `${m.title ?? '(no title)'}${meetingDuration(m.start_time, m.end_time)}`,
        })),
        ...notes.map(n => ({
          date: n.created_at,
          type: 'Note' as const,
          label: n.content.slice(0, 120),
        })),
      ];

      const filtered = since
        ? items.filter(item => item.date >= since)
        : items;

      filtered.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      const limited = filtered.slice(0, limit);

      if (limited.length === 0) {
        return { content: [{ type: 'text', text: 'No activity found.' }] };
      }

      const scope_label = person_id != null ? `person ${person_id}` : `organization ${organization_id}`;
      const since_label = since ? ` (since ${since})` : '';
      const lines = limited.map(item => {
        const day = item.date.slice(0, 10);
        return `[${day} ${item.type}] ${item.label}`;
      });

      return {
        content: [{
          type: 'text',
          text: `${limited.length} activity item(s) for ${scope_label}${since_label}:\n\n${lines.join('\n')}`,
        }],
      };
    }
  );
}
