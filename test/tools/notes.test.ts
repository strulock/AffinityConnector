import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient, AffinityNotFoundError } from '../../src/affinity/client.js';
import { NotesApi } from '../../src/affinity/notes.js';
import { registerNotesTools } from '../../src/tools/notes.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityNote } from '../../src/affinity/types.js';

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
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('get_notes', { person_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('next-page');
    expect(result.content[0].text).toContain('More notes available');
  });

  it('returns a Not found response when the API throws AffinityNotFoundError', async () => {
    const mockApi = {
      getNotes: vi.fn().mockRejectedValue(new AffinityNotFoundError('person 999 not found')),
      createNote: vi.fn(), getNoteReplies: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('get_notes', { person_id: 999, limit: 25 });
    expect(result.content[0].text).toContain('Not found:');
  });

  it('re-throws unknown errors from get_notes', async () => {
    const mockApi = {
      getNotes: vi.fn().mockRejectedValue(new Error('network failure')),
      createNote: vi.fn(), getNoteReplies: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    await expect(callTool('get_notes', { limit: 25 })).rejects.toThrow('network failure');
  });
});

describe('get_notes formatting', () => {
  it('formats a note with no person or org associations', async () => {
    const noteNoAssoc = { ...MOCK_NOTE, person_ids: [], organization_ids: [] };
    const { callTool } = setupNotes([noteNoAssoc]);
    const result = await callTool('get_notes', { limit: 25 });
    const text = result.content[0].text;
    // targetStr should be empty — no "[people:..." or "[orgs:..." bracket
    expect(text).not.toContain('[people:');
    expect(text).not.toContain('[orgs:');
    expect(text).toContain('Met at conference');
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

  it('returns a Not found response when the API throws AffinityNotFoundError', async () => {
    const mockApi = {
      getNotes: vi.fn(), createNote: vi.fn().mockRejectedValue(new AffinityNotFoundError('person 999 not found')),
      getNoteReplies: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('create_note', { content: 'Test', person_ids: [999] });
    expect(result.content[0].text).toContain('Not found:');
  });
});

const MOCK_REPLY = { id: 200, note_id: 1, creator_id: 99, content: 'Great meeting!', created_at: '2024-02-01T10:00:00Z' };

describe('get_note_replies tool', () => {
  it('returns formatted replies', async () => {
    const mockApi = {
      getNotes: vi.fn(), createNote: vi.fn(),
      getNoteReplies: vi.fn().mockResolvedValue({ replies: [MOCK_REPLY], nextPageToken: undefined }),
      updateNote: vi.fn(), deleteNote: vi.fn(),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('get_note_replies', { note_id: 1, limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('[reply:200]');
    expect(text).toContain('Great meeting!');
    expect(text).toContain('user 99');
    expect(text).toContain('1 reply');
  });

  it('shows pagination token when available', async () => {
    const mockApi = {
      getNotes: vi.fn(), createNote: vi.fn(),
      getNoteReplies: vi.fn().mockResolvedValue({ replies: [MOCK_REPLY], nextPageToken: 'tok-r' }),
      updateNote: vi.fn(), deleteNote: vi.fn(),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('get_note_replies', { note_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('tok-r');
  });

  it('returns a message when no replies exist', async () => {
    const mockApi = {
      getNotes: vi.fn(), createNote: vi.fn(),
      getNoteReplies: vi.fn().mockResolvedValue({ replies: [], nextPageToken: undefined }),
      updateNote: vi.fn(), deleteNote: vi.fn(),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('get_note_replies', { note_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('No replies found');
  });
});

describe('update_note tool', () => {
  it('returns success with the note ID', async () => {
    const mockApi = {
      getNotes: vi.fn(), createNote: vi.fn(),
      getNoteReplies: vi.fn(),
      updateNote: vi.fn().mockResolvedValue({ ...MOCK_NOTE, content: 'Updated' }),
      deleteNote: vi.fn(),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('update_note', { note_id: 1, content: 'Updated' });
    expect(result.content[0].text).toContain('Updated note');
    expect(result.content[0].text).toContain('[id:1]');
  });

  it('returns a Not found response when the API throws AffinityNotFoundError', async () => {
    const mockApi = {
      getNotes: vi.fn(), createNote: vi.fn(), getNoteReplies: vi.fn(),
      updateNote: vi.fn().mockRejectedValue(new AffinityNotFoundError('note 999 not found')),
      deleteNote: vi.fn(),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('update_note', { note_id: 999, content: 'Updated' });
    expect(result.content[0].text).toContain('Not found:');
  });
});

describe('delete_note tool', () => {
  it('returns a success message after deletion', async () => {
    const mockApi = {
      getNotes: vi.fn(), createNote: vi.fn(),
      getNoteReplies: vi.fn(), updateNote: vi.fn(),
      deleteNote: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('delete_note', { note_id: 1 });
    expect(result.content[0].text).toContain('1');
    expect(result.content[0].text).toContain('deleted successfully');
  });

  it('returns a Not found response when the API throws AffinityNotFoundError', async () => {
    const mockApi = {
      getNotes: vi.fn(), createNote: vi.fn(), getNoteReplies: vi.fn(), updateNote: vi.fn(),
      deleteNote: vi.fn().mockRejectedValue(new AffinityNotFoundError('note 999 not found')),
    } as unknown as NotesApi;
    const { callTool } = setupWithMockApi(mockApi);
    const result = await callTool('delete_note', { note_id: 999 });
    expect(result.content[0].text).toContain('Not found:');
  });
});
