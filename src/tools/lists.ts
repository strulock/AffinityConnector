import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListsApi } from '../affinity/lists.js';
import type {
  AffinityList,
  AffinityListEntry,
  AffinityFieldValue,
  AffinityPerson,
  AffinityOrganization,
  AffinityOpportunity,
} from '../affinity/types.js';

const LIST_TYPE_LABELS: Record<number, string> = {
  0: 'Person',
  1: 'Organization',
  2: 'Opportunity',
};

function formatList(list: AffinityList): string {
  const type = LIST_TYPE_LABELS[list.type] ?? `Type ${list.type}`;
  const visibility = list.public ? 'public' : 'private';
  return `[${list.id}] ${list.name} — ${type}, ${list.list_size} entries, ${visibility}`;
}

function formatEntry(entry: AffinityListEntry): string {
  const e = entry.entity;
  let label: string;
  if (entry.entity_type === 0) {
    const p = e as AffinityPerson;
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)';
    const email = p.primary_email ?? p.emails?.[0] ?? 'no email';
    label = `${name} <${email}>`;
  } else if (entry.entity_type === 1) {
    const o = e as AffinityOrganization;
    const domain = o.domain ?? o.domains?.[0] ?? 'no domain';
    label = `${o.name} (${domain})`;
  } else if (entry.entity_type === 8) {
    const op = e as AffinityOpportunity;
    label = op.name;
  } else {
    label = `Entity ${entry.entity_id}`;
  }
  return `[entry:${entry.id}] ${label}`;
}

function formatFieldValue(fv: AffinityFieldValue): string {
  const name = fv.field?.name ?? `Field ${fv.field_id}`;
  const value =
    fv.value === null || fv.value === undefined
      ? '(empty)'
      : typeof fv.value === 'object'
      ? JSON.stringify(fv.value)
      : String(fv.value);
  return `${name}: ${value}`;
}

export function registerListTools(server: McpServer, api: ListsApi): void {
  server.tool(
    'get_lists',
    'List all Affinity lists (pipelines, contact lists, etc.) available in your workspace.',
    {},
    async () => {
      const lists = await api.getLists();
      if (lists.length === 0) {
        return { content: [{ type: 'text', text: 'No lists found in your Affinity workspace.' }] };
      }
      const lines = lists.map(formatList);
      return {
        content: [{ type: 'text', text: `Found ${lists.length} list(s):\n\n${lines.join('\n')}` }],
      };
    }
  );

  server.tool(
    'get_list_entries',
    'Get entries from an Affinity list by list ID. Each entry is a person, organization, or opportunity on that list.',
    {
      list_id: z.number().int().describe('Affinity list ID (use get_lists to find IDs)'),
      limit: z.number().int().min(1).max(100).default(25).describe('Max entries to return'),
      page_token: z.string().optional().describe('Pagination token from a previous call'),
    },
    async ({ list_id, limit, page_token }) => {
      const { entries, nextPageToken } = await api.getListEntries(list_id, limit, page_token);
      if (entries.length === 0) {
        return { content: [{ type: 'text', text: `No entries found in list ${list_id}.` }] };
      }
      const lines = entries.map(formatEntry);
      let text = `${entries.length} entries from list ${list_id}:\n\n${lines.join('\n')}`;
      if (nextPageToken) {
        text += `\n\nMore entries available. Use page_token: "${nextPageToken}"`;
      }
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'get_field_values',
    'Get custom field values for a specific list entry. Returns all field data attached to that entry.',
    {
      list_entry_id: z.number().int().describe('List entry ID (from get_list_entries results)'),
    },
    async ({ list_entry_id }) => {
      const values = await api.getFieldValues(list_entry_id);
      if (values.length === 0) {
        return {
          content: [{ type: 'text', text: `No field values found for list entry ${list_entry_id}.` }],
        };
      }
      const lines = values.map(formatFieldValue);
      return {
        content: [
          {
            type: 'text',
            text: `Field values for list entry ${list_entry_id}:\n\n${lines.join('\n')}`,
          },
        ],
      };
    }
  );
}
