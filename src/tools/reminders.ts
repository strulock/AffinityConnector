// MCP tools for Affinity reminders (follow-up tasks).

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RemindersApi } from '../affinity/reminders.js';
import { UtilityApi } from '../affinity/utility.js';
import { toolError } from './_error.js';
import type { AffinityReminder } from '../affinity/types.js';

function formatReminder(r: AffinityReminder): string {
  const status = r.completed_at ? `completed ${r.completed_at}` : `due ${r.due_date}`;
  const assoc = r.person
    ? `person: ${[r.person.first_name, r.person.last_name].filter(Boolean).join(' ') || r.person.id}`
    : r.organization
    ? `org: ${r.organization.name ?? r.organization.id}`
    : r.opportunity
    ? `opp: ${r.opportunity.name ?? r.opportunity.id}`
    : '';
  const assocStr = assoc ? ` [${assoc}]` : '';
  return `[reminder:${r.id}] ${status} — ${r.content ?? '(no content)'}${assocStr}`;
}

export function registerReminderTools(server: McpServer, api: RemindersApi, utilityApi: UtilityApi): void {
  server.tool(
    'get_reminders',
    'List Affinity reminders. Optionally filter by person_id or organization_id to see follow-ups for a specific contact or company.',
    {
      person_id: z.coerce.number().int().min(1).optional().describe('Filter to reminders associated with this person ID'),
      organization_id: z.coerce.number().int().min(1).optional().describe('Filter to reminders associated with this org ID'),
      opportunity_id: z.coerce.number().int().min(1).optional().describe('Filter to reminders associated with this opportunity ID'),
    },
    async ({ person_id, organization_id, opportunity_id }) => {
      try {
        const reminders = await api.getReminders({ person_id, organization_id, opportunity_id });
        if (reminders.length === 0) {
          return { content: [{ type: 'text', text: 'No reminders found.' }] };
        }
        const lines = reminders.map(formatReminder);
        return {
          content: [{ type: 'text', text: `${reminders.length} reminder(s):\n\n${lines.join('\n')}` }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'create_reminder',
    'Create a follow-up reminder in Affinity. Provide content, a due date (YYYY-MM-DD), and exactly one associated entity (person_id, organization_id, or opportunity_id). Note: person_id must be an external contact — you cannot tag yourself (the authenticated user).',
    {
      content: z.string().describe('Reminder text / follow-up note'),
      due_date: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be in YYYY-MM-DD format')
        .describe('Due date in YYYY-MM-DD format'),
      person_id: z.coerce.number().int().min(1).optional().describe('Person ID to associate (external contact, not yourself)'),
      organization_id: z.coerce.number().int().min(1).optional().describe('Organization ID to associate'),
      opportunity_id: z.coerce.number().int().min(1).optional().describe('Opportunity ID to associate'),
      // Accept legacy array params for backwards compatibility
      person_ids: z.array(z.coerce.number().int()).optional().describe('(Legacy) Person IDs — first element used'),
      organization_ids: z.array(z.coerce.number().int()).optional().describe('(Legacy) Organization IDs — first element used'),
      opportunity_ids: z.array(z.coerce.number().int()).optional().describe('(Legacy) Opportunity IDs — first element used'),
    },
    async ({ content, due_date, person_id, organization_id, opportunity_id, person_ids, organization_ids, opportunity_ids }) => {
      // Support both singular and legacy array params
      const pid = person_id ?? person_ids?.[0];
      const oid = organization_id ?? organization_ids?.[0];
      const oppid = opportunity_id ?? opportunity_ids?.[0];
      const assocCount = [pid, oid, oppid].filter(v => v != null).length;
      if (assocCount !== 1) {
        return {
          content: [{
            type: 'text',
            text: 'Provide exactly one of person_id, organization_id, or opportunity_id.',
          }],
        };
      }

      try {
        const { id: owner_id } = await utilityApi.getCurrentUser();
        const reminder = await api.createReminder({
          content, due_date, owner_id, person_id: pid, organization_id: oid, opportunity_id: oppid,
        });
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
      reminder_id: z.coerce.number().int().min(1).describe('Reminder ID to update (from get_reminders)'),
      content: z.string().optional().describe('New reminder text'),
      due_date: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be in YYYY-MM-DD format')
        .optional()
        .describe('New due date in YYYY-MM-DD format'),
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
      reminder_id: z.coerce.number().int().min(1).describe('Reminder ID to delete (from get_reminders)'),
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
