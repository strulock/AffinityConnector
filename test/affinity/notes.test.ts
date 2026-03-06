import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { NotesApi } from '../../src/affinity/notes.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityNote, AffinityInteraction } from '../../src/affinity/types.js';

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

const MOCK_INTERACTION: AffinityInteraction = {
  id: 50,
  type: 0,
  date: '2024-01-10T09:00:00Z',
  subject: 'Follow-up email',
  body_text: 'Just checking in...',
  person_ids: [1],
  organization_ids: [],
  creator_ids: [99],
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

describe('NotesApi.getInteractions', () => {
  it('returns interactions from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_INTERACTION]), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new NotesApi(client);
    const result = await api.getInteractions({ person_id: 1 });
    expect(result.interactions).toEqual([MOCK_INTERACTION]);
  });

  it('returns empty interactions array when API returns non-array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(null), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new NotesApi(client);
    const result = await api.getInteractions({ person_id: 1 });
    expect(result.interactions).toEqual([]);
  });

  it('serves results from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_INTERACTION]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new NotesApi(client);
    await api.getInteractions({ person_id: 1 });
    await api.getInteractions({ person_id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
