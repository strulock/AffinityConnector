// MCP tools for searching and retrieving Affinity people (contacts).

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PeopleApi } from '../affinity/people.js';
import { toolError } from './_error.js';
import type { AffinityPerson } from '../affinity/types.js';

function formatPerson(p: AffinityPerson): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)';
  const email = p.primary_email ?? p.emails[0] ?? 'no email';
  const dates = p.interaction_dates;
  const lastContact = dates?.last_interaction_date
    ? `Last contact: ${dates.last_interaction_date}`
    : 'No recorded interactions';
  return `[${p.id}] ${name} <${email}> — ${lastContact}`;
}

export function registerPeopleTools(server: McpServer, api: PeopleApi): void {
  server.tool(
    'search_people',
    'Search Affinity contacts by name or email. Returns a list of matching people.',
    {
      query: z.string().describe('Name or email to search for'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max results to return'),
    },
    async ({ query, limit }) => {
      const people = await api.search(query, limit);
      if (people.length === 0) {
        return { content: [{ type: 'text', text: `No people found matching "${query}".` }] };
      }
      const lines = people.map(formatPerson);
      return {
        content: [
          {
            type: 'text',
            text: `Found ${people.length} person(s) matching "${query}":\n\n${lines.join('\n')}`,
          },
        ],
      };
    }
  );

  server.tool(
    'get_person',
    'Get full details for an Affinity contact by their numeric ID.',
    {
      person_id: z.number().int().describe('Affinity person ID'),
    },
    async ({ person_id }) => {
      try {
      const person = await api.getById(person_id);
      const name = [person.first_name, person.last_name].filter(Boolean).join(' ');
      const emails = person.emails.join(', ') || 'none';
      const orgs = person.organization_ids.length
        ? person.organization_ids.join(', ')
        : 'none';
      const dates = person.interaction_dates;

      const text = [
        `Name: ${name}`,
        `ID: ${person.id}`,
        `Emails: ${emails}`,
        `Organization IDs: ${orgs}`,
        `First email: ${dates?.first_email_date ?? 'N/A'}`,
        `Last email: ${dates?.last_email_date ?? 'N/A'}`,
        `Last interaction: ${dates?.last_interaction_date ?? 'N/A'}`,
        `Next event: ${dates?.next_event_date ?? 'N/A'}`,
        `Created: ${person.created_at}`,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'create_person',
    'Create a new Affinity contact. Provide first_name and last_name at minimum; optionally include emails, organization_ids, and phone_numbers.',
    {
      first_name: z.string().describe('First name'),
      last_name: z.string().describe('Last name'),
      emails: z.array(z.string().email()).optional().describe('Email addresses'),
      organization_ids: z.array(z.number().int()).optional().describe('Organization IDs to associate'),
      phone_numbers: z.array(z.string()).optional().describe('Phone numbers'),
    },
    async ({ first_name, last_name, emails, organization_ids, phone_numbers }) => {
      try {
        const person = await api.create({ first_name, last_name, emails, organization_ids, phone_numbers });
        const name = [person.first_name, person.last_name].filter(Boolean).join(' ');
        return {
          content: [{ type: 'text', text: `Created person [id:${person.id}] "${name}".` }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'update_person',
    'Update an existing Affinity contact by ID. Supply only the fields you want to change.',
    {
      person_id: z.number().int().describe('Person ID to update'),
      first_name: z.string().optional().describe('New first name'),
      last_name: z.string().optional().describe('New last name'),
      emails: z.array(z.string().email()).optional().describe('Replacement email list (replaces current)'),
      organization_ids: z.array(z.number().int()).optional().describe('Replacement organization ID list'),
      phone_numbers: z.array(z.string()).optional().describe('Replacement phone number list'),
    },
    async ({ person_id, first_name, last_name, emails, organization_ids, phone_numbers }) => {
      if (!first_name && !last_name && !emails && !organization_ids && !phone_numbers) {
        return {
          content: [{ type: 'text', text: 'Provide at least one field to update.' }],
        };
      }
      try {
        const person = await api.update(person_id, { first_name, last_name, emails, organization_ids, phone_numbers });
        const name = [person.first_name, person.last_name].filter(Boolean).join(' ');
        return {
          content: [{ type: 'text', text: `Updated person [id:${person.id}] "${name}".` }],
        };
      } catch (e) { return toolError(e); }
    }
  );
}
