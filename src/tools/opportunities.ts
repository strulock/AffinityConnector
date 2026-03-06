// MCP tools for Affinity opportunity (deal) management.
// Opportunities are the primary deal record in Affinity, visible as entity_type 8
// in list entries. These tools expose them as first-class objects.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpportunitiesApi } from '../affinity/opportunities.js';
import type { AffinityOpportunity } from '../affinity/types.js';

function formatOpportunity(opp: AffinityOpportunity): string {
  const parts: string[] = [`[opp:${opp.id}] ${opp.name}`];
  if (opp.person_ids.length) parts.push(`${opp.person_ids.length} person(s)`);
  if (opp.organization_ids.length) parts.push(`${opp.organization_ids.length} org(s)`);
  if (opp.list_entries.length) parts.push(`in ${opp.list_entries.length} list(s)`);
  return parts.join(' — ');
}

export function registerOpportunityTools(server: McpServer, api: OpportunitiesApi): void {
  server.tool(
    'search_opportunities',
    'Search Affinity opportunities (deals) by name. Omit term to list all. Optionally scope to a specific list with list_id.',
    {
      term: z.string().optional().describe('Name search term. Omit to list all opportunities.'),
      list_id: z.number().int().optional().describe('Scope results to a specific list ID (from get_lists).'),
    },
    async ({ term, list_id }) => {
      const opps = await api.search(term, list_id);
      if (opps.length === 0) {
        const msg = term ? `No opportunities found matching "${term}".` : 'No opportunities found.';
        return { content: [{ type: 'text', text: msg }] };
      }
      const lines = opps.map(formatOpportunity);
      return {
        content: [{ type: 'text', text: `${opps.length} opportunity/ies:\n\n${lines.join('\n')}` }],
      };
    }
  );

  server.tool(
    'get_opportunity',
    'Get full details for an Affinity opportunity by ID, including associated people, organizations, and list memberships.',
    {
      opportunity_id: z.number().int().describe('Opportunity ID (from search_opportunities or get_list_entries)'),
    },
    async ({ opportunity_id }) => {
      const opp = await api.getById(opportunity_id);
      if (!opp) {
        return { content: [{ type: 'text', text: `Opportunity ${opportunity_id} not found.` }] };
      }
      const listMemberships = opp.list_entries.length
        ? opp.list_entries.map(e => `list ${e.list_id} (entry ${e.id})`).join(', ')
        : 'none';
      const lines = [
        `Name: ${opp.name}`,
        `ID: ${opp.id}`,
        `People: ${opp.person_ids.length ? opp.person_ids.join(', ') : 'none'}`,
        `Organizations: ${opp.organization_ids.length ? opp.organization_ids.join(', ') : 'none'}`,
        `Lists: ${listMemberships}`,
        `Created: ${new Date(opp.created_at).toLocaleDateString()}`,
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  server.tool(
    'create_opportunity',
    'Create a new Affinity opportunity (deal). Optionally associate people and organizations at creation time. Use add_to_list to add to a pipeline list after creation.',
    {
      name: z.string().describe('Opportunity name'),
      person_ids: z.array(z.number().int()).optional().describe('Person IDs to associate with this opportunity'),
      organization_ids: z.array(z.number().int()).optional().describe('Organization IDs to associate with this opportunity'),
    },
    async ({ name, person_ids, organization_ids }) => {
      const opp = await api.create({ name, person_ids, organization_ids });
      return {
        content: [{
          type: 'text',
          text: `Created opportunity [id:${opp.id}] "${opp.name}". Use add_to_list to add it to a pipeline.`,
        }],
      };
    }
  );

  server.tool(
    'update_opportunity',
    'Update an existing Affinity opportunity — rename it or replace its associated people and organizations. Note: person_ids and organization_ids replace the full current list.',
    {
      opportunity_id: z.number().int().describe('Opportunity ID to update'),
      name: z.string().optional().describe('New name'),
      person_ids: z.array(z.number().int()).optional().describe('Replacement list of person IDs (replaces current associations)'),
      organization_ids: z.array(z.number().int()).optional().describe('Replacement list of organization IDs (replaces current associations)'),
    },
    async ({ opportunity_id, name, person_ids, organization_ids }) => {
      if (!name && !person_ids && !organization_ids) {
        return {
          content: [{ type: 'text', text: 'Provide at least one of name, person_ids, or organization_ids to update.' }],
        };
      }
      const opp = await api.update(opportunity_id, { name, person_ids, organization_ids });
      return {
        content: [{ type: 'text', text: `Updated opportunity [id:${opp.id}] "${opp.name}".` }],
      };
    }
  );
}
