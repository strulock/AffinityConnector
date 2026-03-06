// MCP tools for exploring Affinity field definitions and field value change history.
// These are prerequisite tools for any write operation — callers need field IDs
// and value types before they can set or update field values.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FieldsApi } from '../affinity/fields.js';
import type { AffinityField, AffinityFieldValueChange } from '../affinity/types.js';

// Human-readable labels for AffinityField.value_type numeric codes
const VALUE_TYPE_LABELS: Record<number, string> = {
  0: 'Text',
  1: 'Number',
  2: 'Date',
  3: 'Location',
  4: 'Person',
  5: 'Organization',
  6: 'Dropdown',
};

function formatField(f: AffinityField): string {
  const type = VALUE_TYPE_LABELS[f.value_type] ?? `Type ${f.value_type}`;
  const scope = f.list_id != null ? `list ${f.list_id}` : 'global';
  const flags: string[] = [];
  if (f.is_required) flags.push('required');
  if (f.allows_multiple) flags.push('multi-value');
  if (f.is_read_only) flags.push('read-only');
  const flagStr = flags.length ? ` [${flags.join(', ')}]` : '';
  return `[field:${f.id}] ${f.name} — ${type}, ${scope}${flagStr}`;
}

function formatChange(c: AffinityFieldValueChange): string {
  const date = new Date(c.changed_at).toLocaleDateString();
  const value =
    c.value === null || c.value === undefined
      ? '(cleared)'
      : typeof c.value === 'object'
      ? JSON.stringify(c.value)
      : String(c.value);
  const target = c.list_entry_id
    ? `list entry ${c.list_entry_id}`
    : c.entity_id
    ? `entity ${c.entity_id}`
    : 'unknown';
  return `[change:${c.id}] ${date} — ${target} → "${value}" (by user ${c.changed_by_id})`;
}

export function registerFieldTools(server: McpServer, api: FieldsApi): void {
  server.tool(
    'get_field_definitions',
    'List Affinity custom field definitions. Use scope="person" or scope="organization" for global entity fields, scope="list" with a list_id for list-specific fields, or scope="all" for every field in the workspace. Returns field names, IDs, types, and constraints — use this before calling set_field_value.',
    {
      scope: z
        .enum(['all', 'person', 'organization', 'list'])
        .default('all')
        .describe('Which fields to return: "all" = entire workspace, "person" = global person fields, "organization" = global org fields, "list" = fields on a specific list (requires list_id)'),
      list_id: z
        .number()
        .int()
        .optional()
        .describe('Required when scope is "list". List ID from get_lists.'),
    },
    async ({ scope, list_id }) => {
      if (scope === 'list' && !list_id) {
        return {
          content: [{ type: 'text', text: 'list_id is required when scope is "list".' }],
        };
      }

      let fields: AffinityField[];
      let label: string;

      if (scope === 'person') {
        fields = await api.getPersonFields();
        label = 'global person';
      } else if (scope === 'organization') {
        fields = await api.getOrganizationFields();
        label = 'global organization';
      } else if (scope === 'list') {
        fields = await api.getFields(list_id);
        label = `list ${list_id}`;
      } else {
        fields = await api.getFields();
        label = 'workspace';
      }

      if (fields.length === 0) {
        return {
          content: [{ type: 'text', text: `No field definitions found for ${label}.` }],
        };
      }

      const lines = fields.map(formatField);
      return {
        content: [
          {
            type: 'text',
            text: `${fields.length} field definition(s) for ${label}:\n\n${lines.join('\n')}`,
          },
        ],
      };
    }
  );

  server.tool(
    'get_field_value_changes',
    'Get the audit history of changes to a specific Affinity field. Shows who changed the value, to what, and when. Useful for tracking pipeline stage transitions and other field mutations over time.',
    {
      field_id: z.number().int().describe('Field ID (from get_field_definitions)'),
      entity_id: z
        .number()
        .int()
        .optional()
        .describe('Filter changes to a specific person or organization by their ID'),
      list_entry_id: z
        .number()
        .int()
        .optional()
        .describe('Filter changes to a specific list entry by its ID'),
    },
    async ({ field_id, entity_id, list_entry_id }) => {
      const changes = await api.getFieldValueChanges({ field_id, entity_id, list_entry_id });
      if (changes.length === 0) {
        return {
          content: [{ type: 'text', text: `No value changes found for field ${field_id}.` }],
        };
      }
      const lines = changes.map(formatChange);
      return {
        content: [
          {
            type: 'text',
            text: `${changes.length} change(s) for field ${field_id}:\n\n${lines.join('\n')}`,
          },
        ],
      };
    }
  );
}
