// MCP tools for Affinity notes and interaction history (emails, meetings).

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NotesApi } from '../affinity/notes.js';
import { toolError } from './_error.js';
import type { AffinityNote } from '../affinity/types.js';

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
      person_id: z.number().int().optional().describe('Filter notes by person ID'),
      organization_id: z.number().int().optional().describe('Filter notes by organization ID'),
      opportunity_id: z.number().int().optional().describe('Filter notes by opportunity ID'),
      limit: z.number().int().min(1).max(100).default(25).describe('Max notes to return'),
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
      person_ids: z.array(z.number().int()).optional().describe('Person IDs to attach the note to'),
      organization_ids: z
        .array(z.number().int())
        .optional()
        .describe('Organization IDs to attach the note to'),
      opportunity_ids: z
        .array(z.number().int())
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
      note_id: z.number().int().describe('Note ID to fetch replies for (from get_notes results)'),
      limit: z.number().int().min(1).max(100).default(25).describe('Max replies to return'),
      page_token: z.string().optional().describe('Pagination token from a previous call'),
    },
    async ({ note_id, limit, page_token }) => {
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
    }
  );

  server.tool(
    'update_note',
    'Update the content of an existing Affinity note by its ID.',
    {
      note_id: z.number().int().describe('Note ID to update (from get_notes results)'),
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
    'delete_note',
    'Delete an Affinity note by its ID. This is permanent and cannot be undone.',
    {
      note_id: z.number().int().describe('Note ID to delete (from get_notes results)'),
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
