import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { NotesApi } from '../../src/affinity/notes.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityNote, AffinityNoteReply } from '../../src/affinity/types.js';

const MOCK_NOTE: AffinityNote = {
  id: 1,
  person_ids: [1],
  organization_ids: [],
  opportunity_ids: [],
  creator_id: 99,
  content: 'Met at conference',
  type: 0,
  is_deleted: false,
  created_at: '2024-01-15T10:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotesApi.getNotes', () => {
  it('returns notes from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_NOTE]), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new NotesApi(client);
    const result = await api.getNotes({ person_id: 1 });
    expect(result.notes).toEqual([MOCK_NOTE]);
  });

  it('returns empty notes array when API returns non-array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new NotesApi(client);
    const result = await api.getNotes({ person_id: 1 });
    expect(result.notes).toEqual([]);
  });

  it('serves results from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_NOTE]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new NotesApi(client);
    await api.getNotes({ person_id: 1 });
    await api.getNotes({ person_id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('includes page_token in request when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key');
    const api = new NotesApi(client);
    await api.getNotes({ person_id: 1, page_token: 'tok-xyz' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('page_token=tok-xyz');
  });
});

describe('NotesApi.createNote', () => {
  it('posts to /notes and returns the created note', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_NOTE), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new NotesApi(client);
    const result = await api.createNote({ content: 'Met at conference', person_ids: [1] });
    expect(result).toEqual(MOCK_NOTE);

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/notes');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.content).toBe('Met at conference');
    expect(body.person_ids).toEqual([1]);
    expect(body.organization_ids).toEqual([]);
    expect(body.opportunity_ids).toEqual([]);
  });

  it('defaults empty arrays for missing IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_NOTE), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new NotesApi(client);
    await api.createNote({ content: 'note with no IDs' });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.person_ids).toEqual([]);
    expect(body.organization_ids).toEqual([]);
    expect(body.opportunity_ids).toEqual([]);
  });
});

const MOCK_REPLY: AffinityNoteReply = {
  id: 200, note_id: 1, creator_id: 99, content: 'Great meeting!', created_at: '2024-02-01T10:00:00Z',
};

describe('NotesApi.getNoteReplies', () => {
  it('returns replies from the v2 API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [MOCK_REPLY], next_page_token: null }), { status: 200 }))
    ));
    const api = new NotesApi(new AffinityClient('key'));
    const result = await api.getNoteReplies(1);
    expect(result.replies).toEqual([MOCK_REPLY]);
    expect(result.nextPageToken).toBeUndefined();
  });

  it('uses the v2 base URL and correct path', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new NotesApi(new AffinityClient('key'));
    await api.getNoteReplies(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/v2/');
    expect(url).toContain('/notes/1/replies');
  });

  it('returns nextPageToken when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [MOCK_REPLY], next_page_token: 'tok-r' }), { status: 200 }))
    ));
    const api = new NotesApi(new AffinityClient('key'));
    const result = await api.getNoteReplies(1);
    expect(result.nextPageToken).toBe('tok-r');
  });

  it('returns empty replies array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    ));
    const api = new NotesApi(new AffinityClient('key'));
    const result = await api.getNoteReplies(1);
    expect(result.replies).toEqual([]);
  });

  it('includes page_token in URL when provided', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new NotesApi(new AffinityClient('key'));
    await api.getNoteReplies(1, { page_token: 'tok-nr' });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('page_token=tok-nr');
  });
});

describe('NotesApi.updateNote', () => {
  it('PUTs to /notes/{id} and returns the updated note', async () => {
    const updated = { ...MOCK_NOTE, content: 'Updated content' };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(updated), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new NotesApi(new AffinityClient('key'));
    const result = await api.updateNote(1, 'Updated content');
    expect(result.content).toBe('Updated content');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/notes/1');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ content: 'Updated content' });
  });
});

describe('NotesApi.deleteNote', () => {
  it('sends DELETE to /notes/{id}', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new NotesApi(new AffinityClient('key'));
    await api.deleteNote(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/notes/1');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('handles 204 No Content without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const api = new NotesApi(new AffinityClient('key'));
    await expect(api.deleteNote(1)).resolves.toBeUndefined();
  });
});
