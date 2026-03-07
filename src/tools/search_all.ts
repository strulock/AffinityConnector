// MCP tool for cross-entity search: queries people, organizations, and
// opportunities in parallel and returns a unified interleaved result set.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PeopleApi } from '../affinity/people.js';
import { OrganizationsApi } from '../affinity/organizations.js';
import { OpportunitiesApi } from '../affinity/opportunities.js';

export function registerSearchAllTool(
  server: McpServer,
  peopleApi: PeopleApi,
  orgsApi: OrganizationsApi,
  oppsApi: OpportunitiesApi,
): void {
  server.tool(
    'search_all',
    'Search across people, organizations, and opportunities simultaneously. Returns a unified result set — useful when you are unsure of the record type. Results are interleaved: person[0], org[0], opp[0], person[1], …',
    {
      query: z.string().describe('Name, email, domain, or keyword to search for'),
      limit: z.number().int().min(1).max(50).default(10).describe('Max results per entity type (default 10)'),
    },
    async ({ query, limit }) => {
      const [people, orgs, opps] = await Promise.all([
        peopleApi.search(query, limit),
        orgsApi.search(query, limit),
        oppsApi.search(query),
      ]);

      const lines: string[] = [];
      const max = Math.max(people.length, orgs.length, opps.length);
      for (let i = 0; i < max; i++) {
        if (i < people.length) {
          const p = people[i];
          const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)';
          const email = p.primary_email ?? p.emails[0] ?? 'no email';
          lines.push(`[person:${p.id}] ${name} <${email}>`);
        }
        if (i < orgs.length) {
          const o = orgs[i];
          const domain = o.domain ?? o.domains[0] ?? 'no domain';
          lines.push(`[org:${o.id}] ${o.name} (${domain})`);
        }
        if (i < opps.length) {
          const op = opps[i];
          lines.push(`[opp:${op.id}] ${op.name}`);
        }
      }

      if (lines.length === 0) {
        return { content: [{ type: 'text', text: `No results found for "${query}".` }] };
      }

      const total = people.length + orgs.length + opps.length;
      return {
        content: [{
          type: 'text',
          text: `${total} result(s) for "${query}" (${people.length} people, ${orgs.length} orgs, ${opps.length} opps):\n\n${lines.join('\n')}`,
        }],
      };
    }
  );
}
