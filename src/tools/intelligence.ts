// MCP tools for relationship intelligence: strength scores, intro paths, and
// full relationship summaries that aggregate profile + notes + interactions.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { IntelligenceApi } from '../affinity/intelligence.js';
import { PeopleApi } from '../affinity/people.js';
import { OrganizationsApi } from '../affinity/organizations.js';
import { NotesApi } from '../affinity/notes.js';
import { AffinityNotFoundError } from '../affinity/client.js';
import type { AffinityRelationshipStrength } from '../affinity/types.js';

function strengthLabel(score: number): string {
  if (score >= 80) return 'Very Strong';
  if (score >= 60) return 'Strong';
  if (score >= 40) return 'Moderate';
  if (score >= 20) return 'Weak';
  return 'Very Weak';
}

export function registerIntelligenceTools(
  server: McpServer,
  api: IntelligenceApi,
  peopleApi: PeopleApi,
  orgsApi: OrganizationsApi,
  notesApi: NotesApi
): void {
  server.tool(
    'get_relationship_strength',
    'Get the relationship strength score between you and a person or organization in Affinity. Returns a 0–100 score and last activity date.',
    {
      entity_id: z.number().int().describe('Person or organization ID'),
      entity_type: z
        .number()
        .int()
        .describe('Entity type: 0 = person, 1 = organization'),
    },
    async ({ entity_id, entity_type }) => {
      const result = await api.getRelationshipStrength(entity_id, entity_type);
      const label = strengthLabel(result.strength);
      const lastActivity = result.last_activity_date
        ? new Date(result.last_activity_date).toLocaleDateString()
        : 'unknown';
      const typeLabel = entity_type === 0 ? 'person' : 'organization';
      return {
        content: [
          {
            type: 'text',
            text: `Relationship strength with ${typeLabel} ${entity_id}: ${result.strength}/100 (${label})\nLast activity: ${lastActivity}`,
          },
        ],
      };
    }
  );

  server.tool(
    'find_intro_path',
    'Find people in your network who can introduce you to a target person, based on shared organizations and relationship strength.',
    {
      person_id: z.number().int().describe('ID of the person you want an introduction to'),
    },
    async ({ person_id }) => {
      // 1. Get target person to find their organizations
      const target = await peopleApi.getById(person_id);
      const targetName = [target.first_name, target.last_name].filter(Boolean).join(' ') || `Person ${person_id}`;

      if (!target.organization_ids?.length) {
        return {
          content: [
            {
              type: 'text',
              text: `${targetName} has no associated organizations in Affinity — no intro path found.`,
            },
          ],
        };
      }

      // 2. For each org (max 3), collect member person IDs
      const orgIds = target.organization_ids.slice(0, 3);
      const orgResults = await Promise.all(
        orgIds.map((id) => orgsApi.getById(id).catch(() => null))
      );

      const connectorIds = new Set<number>();
      const orgNames: Record<number, string> = {};
      for (const org of orgResults) {
        if (!org) continue;
        orgNames[org.id] = org.name;
        for (const pid of org.person_ids ?? []) {
          if (pid !== person_id) connectorIds.add(pid);
        }
      }

      if (connectorIds.size === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No shared organization members found who could introduce you to ${targetName}.`,
            },
          ],
        };
      }

      // 3. Fetch relationship strengths for up to 20 connectors in parallel
      const candidateIds = [...connectorIds].slice(0, 20);
      const strengthResults = await Promise.all(
        candidateIds.map(async (id) => {
          try {
            const s = await api.getRelationshipStrength(id, 0);
            return { id, strength: s.strength, lastActivity: s.last_activity_date };
          } catch {
            // Strength unavailable for this connector — include them with score 0
            // rather than dropping them from results entirely.
            return { id, strength: 0, lastActivity: null };
          }
        })
      );

      // 4. Fetch names for top 10 by strength
      const top = strengthResults
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 10);

      const peopleResults = await Promise.all(
        top.map((c) => peopleApi.getById(c.id).catch(() => null))
      );

      const lines: string[] = [`Potential introducers to ${targetName}:\n`];
      for (let i = 0; i < top.length; i++) {
        const candidate = top[i];
        const person = peopleResults[i];
        const name = person
          ? [person.first_name, person.last_name].filter(Boolean).join(' ') || `Person ${candidate.id}`
          : `Person ${candidate.id}`;
        const email = person?.primary_email ?? person?.emails?.[0] ?? '';
        const emailStr = email ? ` <${email}>` : '';
        const label = strengthLabel(candidate.strength);
        const lastActivity = candidate.lastActivity
          ? new Date(candidate.lastActivity).toLocaleDateString()
          : 'no recent activity';
        lines.push(`${i + 1}. ${name}${emailStr} — strength: ${candidate.strength}/100 (${label}), last active: ${lastActivity}`);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  server.tool(
    'summarize_relationship',
    'Aggregate all available relationship data for a person or organization — profile, recent notes, recent interactions, and relationship strength — into a single briefing for analysis.',
    {
      person_id: z
        .number()
        .int()
        .optional()
        .describe('Person ID to summarize (provide either person_id or organization_id)'),
      organization_id: z
        .number()
        .int()
        .optional()
        .describe('Organization ID to summarize (provide either person_id or organization_id)'),
    },
    async ({ person_id, organization_id }) => {
      if (!person_id && !organization_id) {
        return {
          content: [{ type: 'text', text: 'Provide either person_id or organization_id.' }],
        };
      }

      const sections: string[] = [];

      if (person_id) {
        // Profile
        const person = await peopleApi.getById(person_id);
        const name = [person.first_name, person.last_name].filter(Boolean).join(' ') || `Person ${person_id}`;
        const email = person.primary_email ?? person.emails?.[0] ?? 'no email';
        const dates = person.interaction_dates;
        sections.push(`## Profile: ${name}\nEmail: ${email}\nOrganizations: ${person.organization_ids?.length ?? 0}\nLast interaction: ${dates?.last_interaction_date ?? 'none'}\nLast email: ${dates?.last_email_date ?? 'none'}\nLast meeting: ${dates?.last_event_date ?? 'none'}`);

        // Relationship strength
        try {
          const strength = await api.getRelationshipStrength(person_id, 0);
          sections.push(`## Relationship Strength\n${strength.strength}/100 (${strengthLabel(strength.strength)})\nLast activity: ${strength.last_activity_date ? new Date(strength.last_activity_date).toLocaleDateString() : 'unknown'}`);
        } catch (e) {
          if (!(e instanceof AffinityNotFoundError)) throw e;
        }

        // Recent notes
        const { notes } = await notesApi.getNotes({ person_id, limit: 5 });
        if (notes.length) {
          const noteLines = notes.map((n) => `[${new Date(n.created_at).toLocaleDateString()}] ${n.content}`);
          sections.push(`## Recent Notes (${notes.length})\n${noteLines.join('\n\n')}`);
        } else {
          sections.push('## Recent Notes\nNone.');
        }

        // Recent interactions
        const { interactions } = await notesApi.getInteractions({ person_id, limit: 5 });
        if (interactions.length) {
          const intLines = interactions.map(
            (i) => `[${i.type === 0 ? 'Email' : 'Meeting'} ${new Date(i.date).toLocaleDateString()}] ${i.subject ?? '(no subject)'}`
          );
          sections.push(`## Recent Interactions (${interactions.length})\n${intLines.join('\n')}`);
        } else {
          sections.push('## Recent Interactions\nNone.');
        }
      } else if (organization_id) {
        // Profile
        const org = await orgsApi.getById(organization_id);
        const domain = org.domain ?? org.domains?.[0] ?? 'no domain';
        const dates = org.interaction_dates;
        sections.push(`## Profile: ${org.name}\nDomain: ${domain}\nPeople: ${org.person_ids?.length ?? 0}\nLast interaction: ${dates?.last_interaction_date ?? 'none'}\nLast email: ${dates?.last_email_date ?? 'none'}\nLast meeting: ${dates?.last_event_date ?? 'none'}`);

        // Relationship strength
        try {
          const strength = await api.getRelationshipStrength(organization_id, 1);
          sections.push(`## Relationship Strength\n${strength.strength}/100 (${strengthLabel(strength.strength)})\nLast activity: ${strength.last_activity_date ? new Date(strength.last_activity_date).toLocaleDateString() : 'unknown'}`);
        } catch (e) {
          if (!(e instanceof AffinityNotFoundError)) throw e;
        }

        // Recent notes
        const { notes } = await notesApi.getNotes({ organization_id, limit: 5 });
        if (notes.length) {
          const noteLines = notes.map((n) => `[${new Date(n.created_at).toLocaleDateString()}] ${n.content}`);
          sections.push(`## Recent Notes (${notes.length})\n${noteLines.join('\n\n')}`);
        } else {
          sections.push('## Recent Notes\nNone.');
        }

        // Recent interactions
        const { interactions } = await notesApi.getInteractions({ organization_id, limit: 5 });
        if (interactions.length) {
          const intLines = interactions.map(
            (i) => `[${i.type === 0 ? 'Email' : 'Meeting'} ${new Date(i.date).toLocaleDateString()}] ${i.subject ?? '(no subject)'}`
          );
          sections.push(`## Recent Interactions (${interactions.length})\n${intLines.join('\n')}`);
        } else {
          sections.push('## Recent Interactions\nNone.');
        }
      }

      return { content: [{ type: 'text', text: sections.join('\n\n') }] };
    }
  );
}
