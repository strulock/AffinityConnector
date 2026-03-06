// MCP tools for Affinity utility endpoints: current user identity and rate limit.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UtilityApi } from '../affinity/utility.js';

export function registerUtilityTools(server: McpServer, api: UtilityApi): void {
  server.tool(
    'get_whoami',
    'Get the identity of the authenticated Affinity user — name, email, and organization. Useful for confirming which account is connected.',
    {},
    async () => {
      const user = await api.getCurrentUser();
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || '(unknown)';
      const org = user.organization_name ? ` at ${user.organization_name}` : '';
      const text = `Authenticated as: ${name} <${user.email}>${org} [user:${user.id}] [org:${user.organization_id}]`;
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'get_rate_limit',
    'Get the current Affinity API rate limit quota — how many requests remain and when the quota resets.',
    {},
    async () => {
      const rl = await api.getRateLimit();
      const text = `Rate limit: ${rl.remaining} / ${rl.limit} requests remaining. Resets in ${rl.reset_in}s.`;
      return { content: [{ type: 'text', text }] };
    }
  );
}
