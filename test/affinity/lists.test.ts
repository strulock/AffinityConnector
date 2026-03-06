import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { ListsApi } from '../../src/affinity/lists.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityList, AffinityListEntry, AffinityFieldValue, AffinitySavedView } from '../../src/affinity/types.js';

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

  it('includes page_token in request when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ list_entries: [], next_page_token: null }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key');
    const api = new ListsApi(client);
    await api.getListEntries(1, 25, 'tok-abc');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('page_token=tok-abc');
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

describe('ListsApi.setFieldValue', () => {
  it('POSTs to /field-values when no field_value_id is provided (create)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_FIELD_VALUE), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key'));
    const result = await api.setFieldValue({ field_id: 5, entity_id: 10, entity_type: 1, list_entry_id: 100, value: 'Series B' });
    expect(result).toEqual(MOCK_FIELD_VALUE);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/field-values');
    expect(url).not.toContain('/field-values/');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('PUTs to /field-values/{id} when field_value_id is provided (update)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_FIELD_VALUE), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key'));
    await api.setFieldValue({ field_id: 5, entity_id: 10, entity_type: 1, list_entry_id: 100, value: 'Series B', field_value_id: 200 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/field-values/200');
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('sends only { value } in the body for an update', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_FIELD_VALUE), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key'));
    await api.setFieldValue({ field_id: 5, entity_id: 10, entity_type: 1, list_entry_id: 100, value: 'Series B', field_value_id: 200 });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ value: 'Series B' });
  });
});

describe('ListsApi.deleteFieldValue', () => {
  it('sends DELETE to /field-values/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key'));
    await api.deleteFieldValue(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/field-values/200');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('handles 204 No Content response without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const api = new ListsApi(new AffinityClient('key'));
    await expect(api.deleteFieldValue(200)).resolves.toBeUndefined();
  });
});

const MOCK_ENTRY_RESULT: AffinityListEntry = {
  id: 500,
  list_id: 1,
  entity_id: 10,
  entity_type: 1,
  entity: { id: 10, name: 'Acme', domain: 'acme.com', domains: ['acme.com'], person_ids: [], opportunity_ids: [], list_entries: [], interaction_dates: { first_email_date: null, last_email_date: null, first_event_date: null, last_event_date: null, last_interaction_date: null, next_event_date: null }, created_at: '2023-01-01T00:00:00Z' },
  creator_id: 99,
  created_at: '2024-01-01T00:00:00Z',
};

const MOCK_SAVED_VIEW: AffinitySavedView = {
  id: 10,
  list_id: 1,
  name: 'My View',
  creator_id: 99,
  is_public: true,
};

describe('ListsApi.addListEntry', () => {
  it('POSTs to /lists/{id}/list-entries and returns the new entry', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_ENTRY_RESULT), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key'));
    const result = await api.addListEntry(1, 10, 1);
    expect(result).toEqual(MOCK_ENTRY_RESULT);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/lists/1/list-entries');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ entity_id: 10, entity_type: 1 });
  });
});

describe('ListsApi.removeListEntry', () => {
  it('sends DELETE to /lists/{id}/list-entries/{entry_id}', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key'));
    await api.removeListEntry(1, 500);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/lists/1/list-entries/500');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('handles 204 No Content response without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const api = new ListsApi(new AffinityClient('key'));
    await expect(api.removeListEntry(1, 500)).resolves.toBeUndefined();
  });
});

describe('ListsApi.getSavedViews', () => {
  it('returns saved views from the v2 API', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify([MOCK_SAVED_VIEW]), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key'));
    const result = await api.getSavedViews(1);
    expect(result).toEqual([MOCK_SAVED_VIEW]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/v2/');
    expect(url).toContain('/lists/1/saved-views');
  });

  it('serves results from cache on the second call', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify([MOCK_SAVED_VIEW]), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key', { cache: makeKVMock() }));
    await api.getSavedViews(1);
    await api.getSavedViews(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ListsApi.getSavedViewEntries', () => {
  it('returns entries from the v2 API', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ list_entries: [MOCK_ENTRY_RESULT], next_page_token: null }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key'));
    const result = await api.getSavedViewEntries(1, 10);
    expect(result.entries).toEqual([MOCK_ENTRY_RESULT]);
    expect(result.nextPageToken).toBeUndefined();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/v2/');
    expect(url).toContain('/lists/1/saved-views/10/list-entries');
  });

  it('returns nextPageToken when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ list_entries: [], next_page_token: 'tok-xyz' }), { status: 200 }))
    ));
    const api = new ListsApi(new AffinityClient('key'));
    const result = await api.getSavedViewEntries(1, 10, 25);
    expect(result.nextPageToken).toBe('tok-xyz');
  });
});

describe('ListsApi.batchSetFieldValues', () => {
  it('POSTs to /v2/lists/{id}/list-entries/{entryId}/fields and returns data array', async () => {
    const updatedFields = [
      { id: 301, field_id: 5, entity_type: 1, entity_id: 10, list_entry_id: 101, value: 'Series B' },
    ];
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: updatedFields }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new ListsApi(new AffinityClient('key'));
    const result = await api.batchSetFieldValues(1, 101, [{ field_id: 5, value: 'Series B' }]);
    expect(result).toEqual(updatedFields);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v2/');
    expect(url).toContain('/lists/1/list-entries/101/fields');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.operation).toBe('update-fields');
    expect(body.fields).toEqual([{ field_id: 5, value: 'Series B' }]);
  });

  it('returns empty array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    ));
    const api = new ListsApi(new AffinityClient('key'));
    const result = await api.batchSetFieldValues(1, 101, [{ field_id: 5, value: 'test' }]);
    expect(result).toEqual([]);
  });
});
