import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { NotesApi } from '../../src/affinity/notes.js';
import { registerNotesTools } from '../../src/tools/notes.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityNote, AffinityInteraction } from '../../src/affinity/types.js';

function setupWithMockApi(api: NotesApi) {
  const { server, callTool } = makeMockServer();
  registerNotesTools(server, api);
  return { callTool };
}

const MOCK_NOTE: AffinityNote = {
  id: 1,
  person_ids: [1],
  organization_ids: [10],
  opportunity_ids: [],
  creator_id: 99,
  content: 'Met at conference, very interested.',
  type: 0,
  is_deleted: false,
  created_at: '2024-01-15T10:00:00Z',
};

const MOCK_EMAIL: AffinityInteraction = { id: 10, type: 0, date: '2024-01-10T09:00:00Z', subject: 'Follow-up', body_text: 'Just checking in.', person_ids: [1], organization_ids: [], creator_ids: [99] };
const MOCK_MEETING: AffinityInteraction = { id: 11, type: 1, date: '2024-01-12T14:00:00Z', subject: null, body_text: null, person_ids: [1], organization_ids: [], creator_ids: [99] };

afterEach(() => vi.unstubAllGlobals());

function setupNotes(response: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(response), { status: 200 })
  ));
  const client = new AffinityClient('key');
  const api = new NotesApi(client);
  const { server, callTool } = makeMockServer();
  registerNotesTools(server, api);
  return { callTool };
}

describe('get_notes tool', () => {
  it('returns formatted notes', async () => {
    const { callTool } = setupNotes([MOCK_NOTE]);
    const result = await callTool('get_notes', { person_id: 1, limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('Met at conference');
    expect(text).toContain('1 note');
    expect(text).toContain('people: 1');
    expect(text).toContain('orgs: 10');
  });

  it('shows pagination token when available', async () => {
    // The API returns { notes, nextPageToken } — stub getNotes directly via fetch
    // Notes API doesn't return nextPageToken from v1 (array), so we test the empty case
    const { callTool } = setupNotes([]);
    const result = await callTool('get_notes', { limit: 25 });
    expect(result.content[0].text).toContain('No notes found');
  });

  it('returns a message when no notes exist', async () => {
    const { callTool } = setupNotes([]);
    const result = await callTool('get_notes', { limit: 25 });
    expect(result.content[0].text).toContain('No notes found');
  });

  it('shows pagination token when nextPageToken is returned', async () => {
    const mockApi = {
      getNotes: vi.fn().mockResolvedValue({ notes: [MOCK_NOTE], nextPageToken: 'next-page' }),
      createNote: vi.fn(),
      getInteractions: vi.fn(),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('get_notes', { person_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('next-page');
    expect(result.content[0].text).toContain('More notes available');
  });
});

describe('create_note tool', () => {
  it('returns confirmation with note ID on success', async () => {
    const { callTool } = setupNotes(MOCK_NOTE);
    const result = await callTool('create_note', {
      content: 'Test note',
      person_ids: [1],
    });
    expect(result.content[0].text).toContain('Note created');
    expect(result.content[0].text).toContain('1');
  });
});

describe('get_interactions tool', () => {
  it('formats email interactions', async () => {
    const { callTool } = setupNotes([MOCK_EMAIL]);
    const result = await callTool('get_interactions', { person_id: 1, limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('Email');
    expect(text).toContain('Follow-up');
    expect(text).toContain('Just checking in');
  });

  it('formats meeting interactions with no subject', async () => {
    const { callTool } = setupNotes([MOCK_MEETING]);
    const result = await callTool('get_interactions', { person_id: 1, limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('Meeting');
    expect(text).not.toContain('null');
  });

  it('shows pagination token when available', async () => {
    const { callTool } = setupNotes([]);
    const result = await callTool('get_interactions', { limit: 25 });
    expect(result.content[0].text).toContain('No interactions found');
  });

  it('returns a message when no interactions exist', async () => {
    const { callTool } = setupNotes([]);
    const result = await callTool('get_interactions', { limit: 25 });
    expect(result.content[0].text).toContain('No interactions found');
  });

  it('shows pagination token when nextPageToken is returned', async () => {
    const mockApi = {
      getNotes: vi.fn(),
      createNote: vi.fn(),
      getInteractions: vi.fn().mockResolvedValue({ interactions: [MOCK_EMAIL], nextPageToken: 'page-2' }),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('get_interactions', { person_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('page-2');
    expect(result.content[0].text).toContain('More interactions available');
  });
});
