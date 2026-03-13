// MCP tools for Affinity v2 transcripts (BETA): list and read call/meeting transcripts.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TranscriptsApi } from '../affinity/transcripts.js';
import { toolError } from './_error.js';
import type { AffinityTranscript, AffinityTranscriptFragment } from '../affinity/types.js';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function formatTranscriptSummary(t: AffinityTranscript): string {
  const title = t.note?.interaction?.subject
    ?? (t.note?.content?.html ? stripHtml(t.note.content.html).slice(0, 80) : null)
    ?? `Transcript from ${t.createdAt}`;
  return `[transcript:${t.id}] ${title} (${t.createdAt})`;
}

function formatFragment(f: AffinityTranscriptFragment): string {
  const speaker = f.speaker ? `${f.speaker}: ` : '';
  const ts = typeof f.startTimestamp === 'number' ? `[${f.startTimestamp.toFixed(1)}s] ` : '';
  return `${ts}${speaker}${f.content}`;
}

function formatCreator(t: AffinityTranscript): string {
  const c = t.note?.creator;
  if (!c) return '';
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  const email = c.emailAddress ? ` <${c.emailAddress}>` : '';
  return name || email ? `\nCreator: ${name}${email}` : '';
}

export function registerTranscriptTools(server: McpServer, api: TranscriptsApi): void {
  server.tool(
    'get_transcripts',
    '(BETA) List call and meeting transcripts from Affinity with AI summaries. Filter using Affinity filter syntax (e.g. "id=1" or "createdAt<2025-02-04T10:48:24Z").',
    {
      filter: z.string().optional().describe('Filter string (e.g. "id=1" or "createdAt<2025-02-04T10:48:24Z")'),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe('Number of transcripts per page'),
      cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    },
    async ({ filter, limit, cursor }) => {
      try {
        const { transcripts, nextCursor } = await api.getTranscripts({ filter, limit, cursor });
        if (transcripts.length === 0) {
          return { content: [{ type: 'text', text: 'No transcripts found.' }] };
        }
        const lines = transcripts.map(formatTranscriptSummary);
        let text = `${transcripts.length} transcript(s):\n\n${lines.join('\n')}`;
        if (nextCursor) text += `\n\nMore available. Use cursor: "${nextCursor}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'get_transcript',
    '(BETA) Get the full content of an Affinity transcript with speaker dialogue. Use get_transcripts to find transcript IDs.',
    {
      transcript_id: z.coerce.number().int().describe('Transcript ID (from get_transcripts)'),
      limit: z.coerce.number().int().min(1).max(100).default(20).describe('Max fragments per page'),
      cursor: z.string().optional().describe('Pagination cursor for long transcripts'),
    },
    async ({ transcript_id, limit, cursor }) => {
      try {
        const [transcript, { fragments, nextCursor }] = await Promise.all([
          api.getTranscript(transcript_id),
          api.getTranscriptFragments(transcript_id, { limit, cursor }),
        ]);

        const header = formatTranscriptSummary(transcript) + formatCreator(transcript);
        if (fragments.length === 0) {
          return { content: [{ type: 'text', text: `${header}\n\nNo transcript content available.` }] };
        }
        const lines = fragments.map(formatFragment);
        let text = `${header}\n\n${lines.join('\n')}`;
        if (nextCursor) text += `\n\nMore content available. Use cursor: "${nextCursor}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'get_transcript_info',
    '(BETA) Get transcript metadata, AI summary, and creator info. Use get_transcripts to find transcript IDs.',
    {
      transcript_id: z.coerce.number().int().describe('Transcript ID'),
    },
    async ({ transcript_id }) => {
      try {
        const transcript = await api.getTranscript(transcript_id);
        const lines: string[] = [formatTranscriptSummary(transcript)];
        const creator = formatCreator(transcript);
        if (creator) lines.push(creator.trimStart());
        const summary = transcript.note?.content?.html ? stripHtml(transcript.note.content.html) : null;
        if (summary) lines.push(`\nSummary:\n${summary}`);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (e) { return toolError(e); }
    }
  );
}
