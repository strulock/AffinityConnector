import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OrganizationsApi } from '../affinity/organizations.js';
import type { AffinityOrganization } from '../affinity/types.js';

function formatOrg(o: AffinityOrganization): string {
  const domain = o.domain ?? o.domains[0] ?? 'no domain';
  const dates = o.interaction_dates;
  const lastContact = dates?.last_interaction_date
    ? `Last contact: ${dates.last_interaction_date}`
    : 'No recorded interactions';
  return `[${o.id}] ${o.name} (${domain}) — ${lastContact}`;
}

export function registerOrganizationTools(server: McpServer, api: OrganizationsApi): void {
  server.tool(
    'search_organizations',
    'Search Affinity organizations (companies) by name or domain.',
    {
      query: z.string().describe('Company name or domain to search for'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max results to return'),
    },
    async ({ query, limit }) => {
      const orgs = await api.search(query, limit);
      if (orgs.length === 0) {
        return {
          content: [{ type: 'text', text: `No organizations found matching "${query}".` }],
        };
      }
      const lines = orgs.map(formatOrg);
      return {
        content: [
          {
            type: 'text',
            text: `Found ${orgs.length} organization(s) matching "${query}":\n\n${lines.join('\n')}`,
          },
        ],
      };
    }
  );

  server.tool(
    'get_organization',
    'Get full details for an Affinity organization by its numeric ID.',
    {
      org_id: z.number().int().describe('Affinity organization ID'),
    },
    async ({ org_id }) => {
      const org = await api.getById(org_id);
      const domains = org.domains.join(', ') || 'none';
      const people = org.person_ids.length ? org.person_ids.join(', ') : 'none';
      const dates = org.interaction_dates;

      const text = [
        `Name: ${org.name}`,
        `ID: ${org.id}`,
        `Domains: ${domains}`,
        `Person IDs: ${people}`,
        `First email: ${dates?.first_email_date ?? 'N/A'}`,
        `Last email: ${dates?.last_email_date ?? 'N/A'}`,
        `Last interaction: ${dates?.last_interaction_date ?? 'N/A'}`,
        `Next event: ${dates?.next_event_date ?? 'N/A'}`,
        `Created: ${org.created_at}`,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    }
  );
}
