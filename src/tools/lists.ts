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

  server.tool(
    'set_field_value',
    'Create or update a custom field value on an Affinity list entry. If field_value_id is provided the existing value is updated (PUT); otherwise a new value is created (POST). Call get_field_definitions first to find field IDs and types, and get_field_values to find existing field_value_ids.',
    {
      field_id: z.number().int().describe('Field ID (from get_field_definitions)'),
      value: z
        .union([z.string(), z.number(), z.boolean(), z.null()])
        .describe('New value for the field. Use a string for text/date/dropdown, number for numeric fields, null to clear.'),
      field_value_id: z
        .number().int().optional()
        .describe('Existing field value ID to update (from get_field_values). If omitted, a new value is created.'),
      list_entry_id: z
        .number().int().optional()
        .describe('List entry ID — required when creating a new value.'),
      entity_id: z
        .number().int().optional()
        .describe('Entity ID of the person, org, or opportunity — required when creating a new value.'),
      entity_type: z
        .number().int().optional()
        .describe('Entity type — required when creating: 0 = person, 1 = organization, 8 = opportunity.'),
    },
    async ({ field_id, value, field_value_id, list_entry_id, entity_id, entity_type }) => {
      if (field_value_id == null && (list_entry_id == null || entity_id == null || entity_type == null)) {
        return {
          content: [{
            type: 'text',
            text: 'list_entry_id, entity_id, and entity_type are required when creating a new field value (no field_value_id provided).',
          }],
        };
      }

      const result = await api.setFieldValue({
        field_id,
        entity_id: entity_id ?? 0,
        entity_type: entity_type ?? 0,
        list_entry_id: list_entry_id ?? 0,
        value,
        field_value_id,
      });

      const action = field_value_id != null ? 'Updated' : 'Created';
      return {
        content: [{
          type: 'text',
          text: `${action} field value [id:${result.id}] — field ${result.field_id} on list entry ${result.list_entry_id ?? list_entry_id}.`,
        }],
      };
    }
  );

  server.tool(
    'delete_field_value',
    'Delete a custom field value from an Affinity list entry by its field value ID. Use get_field_values to find field value IDs.',
    {
      field_value_id: z.number().int().describe('Field value ID to delete (from get_field_values results)'),
    },
    async ({ field_value_id }) => {
      await api.deleteFieldValue(field_value_id);
      return {
        content: [{ type: 'text', text: `Field value ${field_value_id} deleted successfully.` }],
      };
    }
  );
}
