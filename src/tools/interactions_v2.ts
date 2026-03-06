// MCP tools for v2 interaction history: emails, calls, meetings, chat messages.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InteractionsV2Api } from '../affinity/interactions_v2.js';
import type {
  AffinityEmailV2,
  AffinityCallV2,
  AffinityMeetingV2,
  AffinityChatMessageV2,
} from '../affinity/types.js';

function formatEmail(e: AffinityEmailV2): string {
  const subject = e.subject ? ` — "${e.subject}"` : '';
  return `[email:${e.id}] ${e.sent_at}${subject}`;
}

function formatCall(c: AffinityCallV2): string {
  return `[call:${c.id}] ${c.start_time}`;
}

function formatMeeting(m: AffinityMeetingV2): string {
  const title = m.title ? ` — "${m.title}"` : '';
  return `[meeting:${m.id}] ${m.start_time}${title}`;
}

function formatChatMessage(msg: AffinityChatMessageV2): string {
  const snippet = msg.content ? ` — ${msg.content.slice(0, 120)}` : '';
  return `[chat:${msg.id}] ${msg.sent_at}${snippet}`;
}

const COMMON_PARAMS = {
  person_id: z.number().int().optional().describe('Filter by person ID'),
  organization_id: z.number().int().optional().describe('Filter by organization ID'),
  created_after: z.string().optional().describe('ISO 8601 timestamp — only return items created after this date'),
  created_before: z.string().optional().describe('ISO 8601 timestamp — only return items created before this date'),
  limit: z.number().int().min(1).max(100).default(25).describe('Max items to return'),
  page_token: z.string().optional().describe('Pagination token from a previous call'),
};

export function registerInteractionsV2Tools(server: McpServer, api: InteractionsV2Api): void {
  server.tool(
    'get_emails',
    'Get email interaction history from Affinity (v2). Richer than get_interactions — filter by person, org, or date range.',
    COMMON_PARAMS,
    async ({ person_id, organization_id, created_after, created_before, limit, page_token }) => {
      const { emails, nextPageToken } = await api.getEmails({
        person_id, organization_id, created_after, created_before, limit, page_token,
      });
      if (emails.length === 0) {
        return { content: [{ type: 'text', text: 'No emails found.' }] };
      }
      const lines = emails.map(formatEmail);
      let text = `${emails.length} email(s):\n\n${lines.join('\n')}`;
      if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'get_calls',
    'Get call history from Affinity (v2). Calls are only available via the v2 API.',
    COMMON_PARAMS,
    async ({ person_id, organization_id, created_after, created_before, limit, page_token }) => {
      const { calls, nextPageToken } = await api.getCalls({
        person_id, organization_id, created_after, created_before, limit, page_token,
      });
      if (calls.length === 0) {
        return { content: [{ type: 'text', text: 'No calls found.' }] };
      }
      const lines = calls.map(formatCall);
      let text = `${calls.length} call(s):\n\n${lines.join('\n')}`;
      if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'get_meetings',
    'Get meeting history from Affinity (v2). Returns richer metadata than the v1 get_interactions tool.',
    COMMON_PARAMS,
    async ({ person_id, organization_id, created_after, created_before, limit, page_token }) => {
      const { meetings, nextPageToken } = await api.getMeetings({
        person_id, organization_id, created_after, created_before, limit, page_token,
      });
      if (meetings.length === 0) {
        return { content: [{ type: 'text', text: 'No meetings found.' }] };
      }
      const lines = meetings.map(formatMeeting);
      let text = `${meetings.length} meeting(s):\n\n${lines.join('\n')}`;
      if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'get_chat_messages',
    'Get Slack/chat message history from Affinity (v2). Chat messages are only available via the v2 API.',
    COMMON_PARAMS,
    async ({ person_id, organization_id, created_after, created_before, limit, page_token }) => {
      const { messages, nextPageToken } = await api.getChatMessages({
        person_id, organization_id, created_after, created_before, limit, page_token,
      });
      if (messages.length === 0) {
        return { content: [{ type: 'text', text: 'No chat messages found.' }] };
      }
      const lines = messages.map(formatChatMessage);
      let text = `${messages.length} chat message(s):\n\n${lines.join('\n')}`;
      if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
      return { content: [{ type: 'text', text }] };
    }
  );
}
