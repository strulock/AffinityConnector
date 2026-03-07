// MCP tools for Affinity reminders (follow-up tasks).

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RemindersApi } from '../affinity/reminders.js';
import { toolError } from './_error.js';
import type { AffinityReminder } from '../affinity/types.js';

function formatReminder(r: AffinityReminder): string {
  const status = r.completed_at ? `completed ${r.completed_at}` : `due ${r.due_date}`;
  const associations: string[] = [];
  if (r.person_ids.length) associations.push(`people: ${r.person_ids.join(', ')}`);
  if (r.organization_ids.length) associations.push(`orgs: ${r.organization_ids.join(', ')}`);
  if (r.opportunity_ids.length) associations.push(`opps: ${r.opportunity_ids.join(', ')}`);
  const assocStr = associations.length ? ` [${associations.join('; ')}]` : '';
  return `[reminder:${r.id}] ${status} — ${r.content}${assocStr}`;
}

export function registerReminderTools(server: McpServer, api: RemindersApi): void {
  server.tool(
    'get_reminders',
    'List Affinity reminders. Optionally filter by person_id or organization_id to see follow-ups for a specific contact or company.',
    {
      person_id: z.number().int().optional().describe('Filter to reminders associated with this person ID'),
      organization_id: z.number().int().optional().describe('Filter to reminders associated with this org ID'),
      opportunity_id: z.number().int().optional().describe('Filter to reminders associated with this opportunity ID'),
    },
    async ({ person_id, organization_id, opportunity_id }) => {
      const reminders = await api.getReminders({ person_id, organization_id, opportunity_id });
      if (reminders.length === 0) {
        return { content: [{ type: 'text', text: 'No reminders found.' }] };
      }
      const lines = reminders.map(formatReminder);
      return {
        content: [{ type: 'text', text: `${reminders.length} reminder(s):\n\n${lines.join('\n')}` }],
      };
    }
  );

  server.tool(
    'create_reminder',
    'Create a follow-up reminder in Affinity. Provide content, a due date (YYYY-MM-DD), and at least one associated person, org, or opportunity.',
    {
      content: z.string().describe('Reminder text / follow-up note'),
      due_date: z.string().describe('Due date in YYYY-MM-DD format'),
      person_ids: z.array(z.number().int()).optional().describe('Person IDs to associate with this reminder'),
      organization_ids: z.array(z.number().int()).optional().describe('Organization IDs to associate'),
      opportunity_ids: z.array(z.number().int()).optional().describe('Opportunity IDs to associate'),
    },
    async ({ content, due_date, person_ids, organization_ids, opportunity_ids }) => {
      const hasAssociation =
        (person_ids && person_ids.length > 0) ||
        (organization_ids && organization_ids.length > 0) ||
        (opportunity_ids && opportunity_ids.length > 0);

      if (!hasAssociation) {
        return {
          content: [{
            type: 'text',
            text: 'At least one of person_ids, organization_ids, or opportunity_ids must be provided.',
          }],
        };
      }

      try {
        const reminder = await api.createReminder({ content, due_date, person_ids, organization_ids, opportunity_ids });
        return {
          content: [{ type: 'text', text: `Created reminder [id:${reminder.id}] due ${reminder.due_date} — "${reminder.content}".` }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'update_reminder',
    'Update an existing Affinity reminder. Supply only the fields you want to change. Mark completed: true to close it out.',
    {
      reminder_id: z.number().int().describe('Reminder ID to update (from get_reminders)'),
      content: z.string().optional().describe('New reminder text'),
      due_date: z.string().optional().describe('New due date in YYYY-MM-DD format'),
      completed: z.boolean().optional().describe('Set to true to mark the reminder as completed'),
    },
    async ({ reminder_id, content, due_date, completed }) => {
      if (content === undefined && due_date === undefined && completed === undefined) {
        return {
          content: [{ type: 'text', text: 'Provide at least one field to update.' }],
        };
      }
      try {
        const reminder = await api.updateReminder(reminder_id, { content, due_date, completed });
        const status = reminder.completed_at ? 'completed' : `due ${reminder.due_date}`;
        return {
          content: [{ type: 'text', text: `Updated reminder [id:${reminder.id}] — ${status} — "${reminder.content}".` }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'delete_reminder',
    'Delete an Affinity reminder by its ID. Use get_reminders to find reminder IDs.',
    {
      reminder_id: z.number().int().describe('Reminder ID to delete (from get_reminders)'),
    },
    async ({ reminder_id }) => {
      try {
        await api.deleteReminder(reminder_id);
        return {
          content: [{ type: 'text', text: `Reminder ${reminder_id} deleted successfully.` }],
        };
      } catch (e) { return toolError(e); }
    }
  );
}
