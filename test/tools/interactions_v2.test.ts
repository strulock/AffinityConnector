import { describe, it, expect, vi, afterEach } from 'vitest';
import { InteractionsV2Api } from '../../src/affinity/interactions_v2.js';
import { AffinityClient } from '../../src/affinity/client.js';
import { registerInteractionsV2Tools } from '../../src/tools/interactions_v2.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityEmailV2, AffinityCallV2, AffinityMeetingV2, AffinityChatMessageV2 } from '../../src/affinity/types.js';

const MOCK_EMAIL: AffinityEmailV2 = {
  id: 'email-1', subject: 'Hello there', sent_at: '2024-01-10T09:00:00Z',
  created_at: '2024-01-10T09:00:00Z', person_ids: [1], organization_ids: [],
};
const MOCK_EMAIL_NO_SUBJECT: AffinityEmailV2 = { ...MOCK_EMAIL, id: 'email-2', subject: null };

const MOCK_CALL: AffinityCallV2 = {
  id: 'call-1', start_time: '2024-01-11T14:00:00Z',
  created_at: '2024-01-11T14:00:00Z', person_ids: [1], organization_ids: [],
};

const MOCK_MEETING: AffinityMeetingV2 = {
  id: 'meeting-1', title: 'Intro call', start_time: '2024-01-12T10:00:00Z',
  end_time: '2024-01-12T11:00:00Z', created_at: '2024-01-12T10:00:00Z',
  person_ids: [1], organization_ids: [],
};
const MOCK_MEETING_NO_TITLE: AffinityMeetingV2 = { ...MOCK_MEETING, id: 'meeting-2', title: null };

const MOCK_CHAT: AffinityChatMessageV2 = {
  id: 'chat-1', content: 'Hey, checking in!', sent_at: '2024-01-13T08:00:00Z',
  created_at: '2024-01-13T08:00:00Z', person_ids: [1], organization_ids: [],
};
const MOCK_CHAT_NO_CONTENT: AffinityChatMessageV2 = { ...MOCK_CHAT, id: 'chat-2', content: null };

afterEach(() => vi.unstubAllGlobals());

const BASE_MOCK_API = () => ({
  getEmails: vi.fn(),
  getCalls: vi.fn(),
  getMeetings: vi.fn(),
  getChatMessages: vi.fn(),
});

describe('get_emails tool', () => {
  it('returns formatted emails', async () => {
    const mockApi = { ...BASE_MOCK_API(), getEmails: vi.fn().mockResolvedValue({ emails: [MOCK_EMAIL], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_emails', { limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('[email:email-1]');
    expect(text).toContain('Hello there');
    expect(text).toContain('1 email');
  });

  it('omits subject dash when subject is null', async () => {
    const mockApi = { ...BASE_MOCK_API(), getEmails: vi.fn().mockResolvedValue({ emails: [MOCK_EMAIL_NO_SUBJECT], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_emails', { limit: 25 });
    expect(result.content[0].text).not.toContain(' — ');
  });

  it('shows pagination token when available', async () => {
    const mockApi = { ...BASE_MOCK_API(), getEmails: vi.fn().mockResolvedValue({ emails: [MOCK_EMAIL], nextPageToken: 'tok-e' }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_emails', { limit: 25 });
    expect(result.content[0].text).toContain('tok-e');
  });

  it('returns a message when no emails found', async () => {
    const mockApi = { ...BASE_MOCK_API(), getEmails: vi.fn().mockResolvedValue({ emails: [], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_emails', { limit: 25 });
    expect(result.content[0].text).toContain('No emails found');
  });
});

describe('get_calls tool', () => {
  it('returns formatted calls', async () => {
    const mockApi = { ...BASE_MOCK_API(), getCalls: vi.fn().mockResolvedValue({ calls: [MOCK_CALL], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_calls', { limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('[call:call-1]');
    expect(text).toContain('1 call');
  });

  it('returns a message when no calls found', async () => {
    const mockApi = { ...BASE_MOCK_API(), getCalls: vi.fn().mockResolvedValue({ calls: [], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_calls', { limit: 25 });
    expect(result.content[0].text).toContain('No calls found');
  });
});

describe('get_meetings tool', () => {
  it('returns formatted meetings with title', async () => {
    const mockApi = { ...BASE_MOCK_API(), getMeetings: vi.fn().mockResolvedValue({ meetings: [MOCK_MEETING], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_meetings', { limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('[meeting:meeting-1]');
    expect(text).toContain('Intro call');
  });

  it('omits title dash when title is null', async () => {
    const mockApi = { ...BASE_MOCK_API(), getMeetings: vi.fn().mockResolvedValue({ meetings: [MOCK_MEETING_NO_TITLE], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_meetings', { limit: 25 });
    expect(result.content[0].text).not.toContain(' — ');
  });

  it('returns a message when no meetings found', async () => {
    const mockApi = { ...BASE_MOCK_API(), getMeetings: vi.fn().mockResolvedValue({ meetings: [], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_meetings', { limit: 25 });
    expect(result.content[0].text).toContain('No meetings found');
  });
});

describe('get_chat_messages tool', () => {
  it('returns formatted chat messages', async () => {
    const mockApi = { ...BASE_MOCK_API(), getChatMessages: vi.fn().mockResolvedValue({ messages: [MOCK_CHAT], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_chat_messages', { limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('[chat:chat-1]');
    expect(text).toContain('Hey, checking in!');
  });

  it('handles null content gracefully', async () => {
    const mockApi = { ...BASE_MOCK_API(), getChatMessages: vi.fn().mockResolvedValue({ messages: [MOCK_CHAT_NO_CONTENT], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_chat_messages', { limit: 25 });
    expect(result.content[0].text).not.toContain(' — ');
  });

  it('returns a message when no chat messages found', async () => {
    const mockApi = { ...BASE_MOCK_API(), getChatMessages: vi.fn().mockResolvedValue({ messages: [], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerInteractionsV2Tools(server, mockApi);
    const result = await callTool('get_chat_messages', { limit: 25 });
    expect(result.content[0].text).toContain('No chat messages found');
  });
});
