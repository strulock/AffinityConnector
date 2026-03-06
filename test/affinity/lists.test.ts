import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { ListsApi } from '../../src/affinity/lists.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityList, AffinityListEntry, AffinityFieldValue } from '../../src/affinity/types.js';

const MOCK_LIST: AffinityList = {
  id: 1,
  type: 1,
  name: 'Pipeline',
  public: true,
  owner_id: 99,
  list_size: 42,
  created_at: '2023-01-01T00:00:00Z',
};

const MOCK_ENTRY: AffinityListEntry = {
  id: 100,
  list_id: 1,
  entity_id: 10,
  entity_type: 1,
  entity: { id: 10, name: 'Acme Corp', domain: 'acme.com', domains: ['acme.com'], person_ids: [], opportunity_ids: [], list_entries: [], interaction_dates: { first_email_date: null, last_email_date: null, first_event_date: null, last_event_date: null, last_interaction_date: null, next_event_date: null }, created_at: '2023-01-01T00:00:00Z' },
  creator_id: 99,
  created_at: '2023-06-01T00:00:00Z',
};

const MOCK_FIELD_VALUE: AffinityFieldValue = {
  id: 200,
  field_id: 5,
  entity_type: 1,
  entity_id: 10,
  list_entry_id: 100,
  value: 'Series A',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListsApi.getLists', () => {
  it('returns lists from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_LIST]), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new ListsApi(client);
    expect(await api.getLists()).toEqual([MOCK_LIST]);
  });

  it('serves results from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_LIST]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new ListsApi(client);
    await api.getLists();
    await api.getLists();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ListsApi.getListEntries', () => {
  it('returns entries and nextPageToken', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ list_entries: [MOCK_ENTRY], next_page_token: 'tok123' }), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new ListsApi(client);
    const result = await api.getListEntries(1);
    expect(result.entries).toEqual([MOCK_ENTRY]);
    expect(result.nextPageToken).toBe('tok123');
  });

  it('returns undefined nextPageToken when null in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ list_entries: [], next_page_token: null }), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new ListsApi(client);
    const result = await api.getListEntries(1);
    expect(result.nextPageToken).toBeUndefined();
  });

  it('serves results from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ list_entries: [MOCK_ENTRY], next_page_token: null }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new ListsApi(client);
    await api.getListEntries(1, 25);
    await api.getListEntries(1, 25);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ListsApi.getFieldValues', () => {
  it('returns field values from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_FIELD_VALUE]), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new ListsApi(client);
    expect(await api.getFieldValues(100)).toEqual([MOCK_FIELD_VALUE]);
  });

  it('serves results from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_FIELD_VALUE]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new ListsApi(client);
    await api.getFieldValues(100);
    await api.getFieldValues(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
