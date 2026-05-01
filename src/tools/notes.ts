// MCP tools for Affinity notes and interaction history (emails, meetings).

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NotesApi } from '../affinity/notes.js';
import { toolError } from './_error.js';
import type { AffinityNote, AffinityNoteAttachedEntity } from '../affinity/types.js';

function formatAttachedEntity(e: AffinityNoteAttachedEntity, entityType: 0 | 1 | 8): string {
  if (entityType === 0) {
    const name = [e.firstName, e.lastName].filter(Boolean).join(' ') || '(no name)';
    const email = e.primaryEmailAddress ? ` <${e.primaryEmailAddress}>` : '';
    return `  [person:${e.id}] ${name}${email}`;
  }
  if (entityType === 1) {
    const domain = e.domain ? ` (${e.domain})` : '';
    return `  [organization:${e.id}] ${e.name ?? '(no name)'}${domain}`;
  }
  return `  [opportunity:${e.id}] ${e.name ?? '(no name)'}`;
}

function formatNote(note: AffinityNote): string {
  const date = new Date(note.created_at).toLocaleDateString();
  const targets: string[] = [];
  if (note.person_ids.length) targets.push(`people: ${note.person_ids.join(', ')}`);
  if (note.organization_ids.length) targets.push(`orgs: ${note.organization_ids.join(', ')}`);
  const targetStr = targets.length ? ` [${targets.join('; ')}]` : '';
  return `[note:${note.id}] ${date}${targetStr}\n${note.content}`;
}

export function registerNotesTools(server: McpServer, api: NotesApi): void {
  server.tool(
    'get_notes',
    'Get notes attached to a person or organization in Affinity.',
    {
      person_id: z.coerce.number().int().min(1).optional().describe('Filter notes by person ID'),
      organization_id: z.coerce.number().int().min(1).optional().describe('Filter notes by organization ID'),
      opportunity_id: z.coerce.number().int().min(1).optional().describe('Filter notes by opportunity ID'),
      limit: z.coerce.number().int().min(1).max(100).default(25).describe('Max notes to return'),
      page_token: z.string().optional().describe('Pagination token from a previous call'),
    },
    async ({ person_id, organization_id, opportunity_id, limit, page_token }) => {
      try {
      const { notes, nextPageToken } = await api.getNotes({
        person_id,
        organization_id,
        opportunity_id,
        limit,
        page_token,
      });
      if (notes.length === 0) {
        return { content: [{ type: 'text', text: 'No notes found.' }] };
      }
      const lines = notes.map(formatNote);
      let text = `${notes.length} note(s):\n\n${lines.join('\n\n')}`;
      if (nextPageToken) {
        text += `\n\nMore notes available. Use page_token: "${nextPageToken}"`;
      }
      return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'create_note',
    'Create a new note on a person, organization, or opportunity in Affinity.',
    {
      content: z.string().min(1).describe('Note text content'),
      person_ids: z.array(z.coerce.number().int()).optional().describe('Person IDs to attach the note to'),
      organization_ids: z
        .array(z.coerce.number().int())
        .optional()
        .describe('Organization IDs to attach the note to'),
      opportunity_ids: z
        .array(z.coerce.number().int())
        .optional()
        .describe('Opportunity IDs to attach the note to'),
    },
    async ({ content, person_ids, organization_ids, opportunity_ids }) => {
      try {
        const note = await api.createNote({ content, person_ids, organization_ids, opportunity_ids });
        return {
          content: [{ type: 'text', text: `Note created (ID: ${note.id}) at ${note.created_at}` }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'get_note_replies',
    'Fetch the reply thread for a specific Affinity note. Note: the v2 API excludes replies from the main notes list — use this tool to retrieve them separately.',
    {
      note_id: z.coerce.number().int().min(1).describe('Note ID to fetch replies for (from get_notes results)'),
      limit: z.coerce.number().int().min(1).max(100).default(25).describe('Max replies to return'),
      page_token: z.string().optional().describe('Pagination token from a previous call'),
    },
    async ({ note_id, limit, page_token }) => {
      try {
        const { replies, nextPageToken } = await api.getNoteReplies(note_id, { limit, page_token });
        if (replies.length === 0) {
          return { content: [{ type: 'text', text: `No replies found for note ${note_id}.` }] };
        }
        const lines = replies.map(r => {
          const date = new Date(r.created_at).toLocaleDateString();
          return `[reply:${r.id}] ${date} (by user ${r.creator_id})\n${r.content}`;
        });
        let text = `${replies.length} reply/replies for note ${note_id}:\n\n${lines.join('\n\n')}`;
        if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'update_note',
    'Update the content of an existing Affinity note by its ID.',
    {
      note_id: z.coerce.number().int().min(1).describe('Note ID to update (from get_notes results)'),
      content: z.string().min(1).describe('New note content (replaces existing content)'),
    },
    async ({ note_id, content }) => {
      try {
        const note = await api.updateNote(note_id, content);
        return {
          content: [{ type: 'text', text: `Updated note [id:${note.id}].` }],
        };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'get_entities_attached_to_note',
    'List entities (people, companies, or opportunities) directly attached to a note. Reverse of get_notes — use when you have a note ID and need its targets. Call once per entity_type if you want all three.',
    {
      note_id: z.coerce.number().int().min(1).describe('Note ID (from get_notes)'),
      entity_type: z
        .union([z.literal(0), z.literal(1), z.literal(8)])
        .describe('Entity type to retrieve: 0 = person, 1 = organization, 8 = opportunity'),
      limit: z.coerce.number().int().min(1).max(100).default(25).describe('Max entities per page'),
      cursor: z.string().optional().describe('Pagination cursor from a previous call'),
    },
    async ({ note_id, entity_type, limit, cursor }) => {
      try {
        const { entities, nextCursor } = await api.getAttachedEntities(note_id, entity_type, { limit, cursor });
        const typeLabel = entity_type === 0 ? 'person(s)' : entity_type === 1 ? 'organization(s)' : 'opportunity(ies)';
        if (entities.length === 0) {
          return { content: [{ type: 'text', text: `Note ${note_id} has no attached ${typeLabel}.` }] };
        }
        const lines = entities.map(e => formatAttachedEntity(e, entity_type));
        let text = `Note ${note_id} → ${entities.length} attached ${typeLabel}:\n\n${lines.join('\n')}`;
        if (nextCursor) text += `\n\nMore available. Use cursor: "${nextCursor}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'delete_note',
    'Delete an Affinity note by its ID. This is permanent and cannot be undone.',
    {
      note_id: z.coerce.number().int().min(1).describe('Note ID to delete (from get_notes results)'),
    },
    async ({ note_id }) => {
      try {
        await api.deleteNote(note_id);
        return {
          content: [{ type: 'text', text: `Note ${note_id} deleted successfully.` }],
        };
      } catch (e) { return toolError(e); }
    }
  );
}
