import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { FieldsApi } from '../../src/affinity/fields.js';
import { makeKVMock } from '../helpers/kv-mock.js';

afterEach(() => vi.unstubAllGlobals());

const MOCK_FIELD = {
  id: 5,
  name: 'Stage',
  list_id: 1,
  value_type: 6,
  allows_multiple: false,
  is_required: false,
  is_read_only: false,
};

const MOCK_CHANGE = {
  id: 100,
  field_id: 5,
  entity_id: 10,
  entity_type: 1,
  list_entry_id: 50,
  value: 'Series A',
  changed_by_id: 99,
  changed_at: '2024-01-15T00:00:00Z',
};

function makeApi(fetchResponse: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(fetchResponse), { status: 200 }))
  );
  return new FieldsApi(new AffinityClient('key'));
}

describe('FieldsApi.getFields', () => {
  it('returns parsed field array', async () => {
    const api = makeApi([MOCK_FIELD]);
    const result = await api.getFields();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Stage');
  });

  it('passes list_id param when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_FIELD]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new FieldsApi(new AffinityClient('key'));
    await api.getFields(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('list_id=1');
  });

  it('returns empty array when API returns non-array', async () => {
    const api = makeApi({});
    const result = await api.getFields();
    expect(result).toEqual([]);
  });

  it('caches results and avoids a second fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_FIELD]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new FieldsApi(client);
    await api.getFields();
    await api.getFields();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('FieldsApi.getPersonFields', () => {
  it('calls /persons/fields and returns array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_FIELD]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new FieldsApi(new AffinityClient('key'));
    const result = await api.getPersonFields();
    expect(result).toHaveLength(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/persons/fields');
  });

  it('returns empty array when API returns non-array', async () => {
    const api = makeApi(null);
    const result = await api.getPersonFields();
    expect(result).toEqual([]);
  });

  it('caches results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_FIELD]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new FieldsApi(client);
    await api.getPersonFields();
    await api.getPersonFields();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('FieldsApi.getOrganizationFields', () => {
  it('calls /organizations/fields and returns array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_FIELD]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new FieldsApi(new AffinityClient('key'));
    const result = await api.getOrganizationFields();
    expect(result).toHaveLength(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/organizations/fields');
  });

  it('returns empty array when API returns non-array', async () => {
    const api = makeApi(null);
    const result = await api.getOrganizationFields();
    expect(result).toEqual([]);
  });

  it('caches results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_FIELD]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new FieldsApi(client);
    await api.getOrganizationFields();
    await api.getOrganizationFields();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('FieldsApi.getFieldValueChanges', () => {
  it('returns parsed changes array', async () => {
    const api = makeApi([MOCK_CHANGE]);
    const result = await api.getFieldValueChanges({ field_id: 5 });
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('Series A');
  });

  it('passes entity_id and list_entry_id params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_CHANGE]), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new FieldsApi(new AffinityClient('key'));
    await api.getFieldValueChanges({ field_id: 5, entity_id: 10, list_entry_id: 50 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('field_id=5');
    expect(url).toContain('entity_id=10');
    expect(url).toContain('list_entry_id=50');
  });

  it('returns empty array when API returns non-array', async () => {
    const api = makeApi({});
    const result = await api.getFieldValueChanges({ field_id: 5 });
    expect(result).toEqual([]);
  });

  it('does not cache — always fetches live data', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify([MOCK_CHANGE]), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new FieldsApi(client);
    await api.getFieldValueChanges({ field_id: 5 });
    await api.getFieldValueChanges({ field_id: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
