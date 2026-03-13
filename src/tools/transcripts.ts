// MCP tools for Affinity v2 transcripts (BETA): list and read call/meeting transcripts.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TranscriptsApi } from '../affinity/transcripts.js';
import { toolError } from './_error.js';
import type { AffinityTranscript, AffinityTranscriptFragment } from '../affinity/types.js';

function formatTranscript(t: AffinityTranscript): string {
  const title = t.title ? ` — "${t.title}"` : '';
  const assoc: string[] = [];
  if (t.person_ids?.length) assoc.push(`people: ${t.person_ids.join(', ')}`);
  if (t.organization_ids?.length) assoc.push(`orgs: ${t.organization_ids.join(', ')}`);
  const assocStr = assoc.length ? ` [${assoc.join('; ')}]` : '';
  return `[transcript:${t.id}] ${t.created_at}${title}${assocStr}`;
}

function formatFragment(f: AffinityTranscriptFragment): string {
  const speaker = f.speaker_label ? `${f.speaker_label}: ` : '';
  const ts = `[${(f.start_ms / 1000).toFixed(1)}s]`;
  return `${ts} ${speaker}${f.content}`;
}

export function registerTranscriptTools(server: McpServer, api: TranscriptsApi): void {
  server.tool(
    'get_transcripts',
    '(BETA) List call and meeting transcripts from Affinity. Filter using Affinity filter syntax (e.g. "id=1" or "createdAt<2025-02-04T10:48:24Z").',
    {
      filter: z.string().optional().describe('Filter string (e.g. "id=1" or "createdAt<2025-02-04T10:48:24Z")'),
      limit: z.number().int().min(1).max(100).default(25).describe('Max transcripts to return'),
      cursor: z.string().optional().describe('Pagination cursor from a previous call'),
    },
    async ({ filter, limit, cursor }) => {
      try {
        const { transcripts, nextCursor } = await api.getTranscripts({ filter, limit, cursor });
        if (transcripts.length === 0) {
          return { content: [{ type: 'text', text: 'No transcripts found.' }] };
        }
        const lines = transcripts.map(formatTranscript);
        let text = `${transcripts.length} transcript(s):\n\n${lines.join('\n')}`;
        if (nextCursor) text += `\n\nMore available. Use cursor: "${nextCursor}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'get_transcript',
    '(BETA) Get the full content of an Affinity transcript including all speaker fragments. Use get_transcripts to find transcript IDs.',
    {
      transcript_id: z.string().describe('Transcript ID (from get_transcripts)'),
      limit: z.number().int().min(1).max(500).default(100).describe('Max fragments to return'),
      page_token: z.string().optional().describe('Pagination token for long transcripts'),
    },
    async ({ transcript_id, limit, page_token }) => {
      try {
        const [transcript, { fragments, nextPageToken }] = await Promise.all([
          api.getTranscript(transcript_id),
          api.getTranscriptFragments(transcript_id, { limit, page_token }),
        ]);

        const header = formatTranscript(transcript);
        if (fragments.length === 0) {
          return { content: [{ type: 'text', text: `${header}\n\nNo transcript content available.` }] };
        }
        const lines = fragments.map(formatFragment);
        let text = `${header}\n\n${lines.join('\n')}`;
        if (nextPageToken) text += `\n\nMore content available. Use page_token: "${nextPageToken}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );
}
