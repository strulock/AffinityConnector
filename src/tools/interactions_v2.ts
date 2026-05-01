// MCP tools for v2 interaction history: emails, calls, meetings, chat messages.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InteractionsV2Api } from '../affinity/interactions_v2.js';
import { toolError } from './_error.js';
import type {
  AffinityEmailV2,
  AffinityCallV2,
  AffinityMeetingV2,
  AffinityChatMessageV2,
} from '../affinity/types.js';

function formatEmail(e: AffinityEmailV2): string {
  const subject = e.subject ? ` — "${e.subject}"` : '';
  return `[email:${e.id}] ${e.sentAt}${subject}`;
}

function formatCall(c: AffinityCallV2): string {
  const title = c.title ? ` — "${c.title}"` : '';
  return `[call:${c.id}] ${c.startTime}${title}`;
}

function formatMeeting(m: AffinityMeetingV2): string {
  const title = m.title ? ` — "${m.title}"` : '';
  return `[meeting:${m.id}] ${m.startTime}${title}`;
}

function formatChatMessage(msg: AffinityChatMessageV2): string {
  const snippet = msg.content ? ` — ${msg.content.slice(0, 120)}` : '';
  return `[chat:${msg.id}] ${msg.sentAt}${snippet}`;
}

// Affinity v2 interaction endpoints don't support entity (person/org) filtering.
// For entity-scoped queries, use get_activity_timeline.
const COMMON_PARAMS = {
  created_after: z.string().optional().describe('ISO 8601 timestamp — only return items created on or after this date'),
  created_before: z.string().optional().describe('ISO 8601 timestamp — only return items created on or before this date'),
  limit: z.coerce.number().int().min(1).max(100).default(25).describe('Max items to return'),
  page_token: z.string().optional().describe('Pagination token from a previous call'),
};

export function registerInteractionsV2Tools(server: McpServer, api: InteractionsV2Api): void {
  server.tool(
    'get_emails',
    'Get workspace-wide email interaction history from Affinity (v2). Filter by date range. For emails involving a specific person or organization, use get_activity_timeline instead.',
    COMMON_PARAMS,
    async ({ created_after, created_before, limit, page_token }) => {
      try {
        const { emails, nextPageToken } = await api.getEmails({
          created_after, created_before, limit, page_token,
        });
        if (emails.length === 0) {
          return { content: [{ type: 'text', text: 'No emails found.' }] };
        }
        const lines = emails.map(formatEmail);
        let text = `${emails.length} email(s):\n\n${lines.join('\n')}`;
        if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'get_calls',
    'Get workspace-wide call history from Affinity (v2). Filter by date range. For calls involving a specific person or organization, use get_activity_timeline instead.',
    COMMON_PARAMS,
    async ({ created_after, created_before, limit, page_token }) => {
      try {
        const { calls, nextPageToken } = await api.getCalls({
          created_after, created_before, limit, page_token,
        });
        if (calls.length === 0) {
          return { content: [{ type: 'text', text: 'No calls found.' }] };
        }
        const lines = calls.map(formatCall);
        let text = `${calls.length} call(s):\n\n${lines.join('\n')}`;
        if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'get_meetings',
    'Get workspace-wide meeting history from Affinity (v2). Filter by date range. For meetings involving a specific person or organization, use get_activity_timeline instead.',
    COMMON_PARAMS,
    async ({ created_after, created_before, limit, page_token }) => {
      try {
        const { meetings, nextPageToken } = await api.getMeetings({
          created_after, created_before, limit, page_token,
        });
        if (meetings.length === 0) {
          return { content: [{ type: 'text', text: 'No meetings found.' }] };
        }
        const lines = meetings.map(formatMeeting);
        let text = `${meetings.length} meeting(s):\n\n${lines.join('\n')}`;
        if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'get_chat_messages',
    'Get workspace-wide Slack/chat message history from Affinity (v2). Filter by date range. For chats involving a specific person or organization, use get_activity_timeline instead.',
    COMMON_PARAMS,
    async ({ created_after, created_before, limit, page_token }) => {
      try {
        const { messages, nextPageToken } = await api.getChatMessages({
          created_after, created_before, limit, page_token,
        });
        if (messages.length === 0) {
          return { content: [{ type: 'text', text: 'No chat messages found.' }] };
        }
        const lines = messages.map(formatChatMessage);
        let text = `${messages.length} chat message(s):\n\n${lines.join('\n')}`;
        if (nextPageToken) text += `\n\nMore available. Use page_token: "${nextPageToken}"`;
        return { content: [{ type: 'text', text }] };
      } catch (e) { return toolError(e); }
    }
  );
}
