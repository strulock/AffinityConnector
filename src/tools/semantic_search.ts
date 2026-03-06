// MCP tool for Affinity v2 semantic (AI-powered) search — companies only (BETA).

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SemanticSearchApi } from '../affinity/semantic_search.js';
import type { AffinitySemanticResult } from '../affinity/types.js';

function formatResult(r: AffinitySemanticResult): string {
  const domain = r.domain ?? r.domains?.[0] ?? 'no domain';
  return `[org:${r.id}] ${r.name} (${domain})`;
}

export function registerSemanticSearchTools(server: McpServer, api: SemanticSearchApi): void {
  server.tool(
    'semantic_search',
    '(BETA) AI-powered natural language search over Affinity companies. Use this for fuzzy, conceptual, or partial-description queries (e.g. "Series B fintech companies in New York"). Currently supports companies only.',
    {
      query: z.string().describe('Natural language search query'),
      limit: z.number().int().min(1).max(100).default(25).describe('Max results to return'),
      page_token: z.string().optional().describe('Pagination token from a previous call'),
    },
    async ({ query, limit, page_token }) => {
      const { results, nextPageToken } = await api.search(query, { limit, page_token });
      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No results found.' }] };
      }
      const lines = results.map(formatResult);
      let text = `${results.length} result(s) for "${query}":\n\n${lines.join('\n')}`;
      if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
      return { content: [{ type: 'text', text }] };
    }
  );
}
