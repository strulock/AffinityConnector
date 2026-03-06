import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { OpportunitiesApi } from '../../src/affinity/opportunities.js';
import { makeKVMock } from '../helpers/kv-mock.js';

afterEach(() => vi.unstubAllGlobals());

const MOCK_OPP = {
  id: 1,
  name: 'Acme Deal',
  person_ids: [10, 11],
  organization_ids: [20],
  list_entries: [{ id: 100, list_id: 5, created_at: '2024-01-01T00:00:00Z' }],
  created_at: '2024-01-01T00:00:00Z',
};

function mockFetch(response: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(response), { status }))
  ));
}

describe('OpportunitiesApi.search', () => {
  it('returns opportunities array', async () => {
    mockFetch([MOCK_OPP]);
    const api = new OpportunitiesApi(new AffinityClient('key'));
    const result = await api.search();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Acme Deal');
  });

  it('passes term param when provided', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify([MOCK_OPP]), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new OpportunitiesApi(new AffinityClient('key'));
    await api.search('Acme');
    expect(fetchMock.mock.calls[0][0]).toContain('term=Acme');
  });

  it('passes list_id param when provided', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify([MOCK_OPP]), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new OpportunitiesApi(new AffinityClient('key'));
    await api.search(undefined, 5);
    expect(fetchMock.mock.calls[0][0]).toContain('list_id=5');
  });

  it('returns empty array when API returns non-array', async () => {
    mockFetch({});
    const api = new OpportunitiesApi(new AffinityClient('key'));
    expect(await api.search()).toEqual([]);
  });
});

describe('OpportunitiesApi.getById', () => {
  it('returns opportunity by ID', async () => {
    mockFetch(MOCK_OPP);
    const api = new OpportunitiesApi(new AffinityClient('key'));
    const result = await api.getById(1);
    expect(result?.name).toBe('Acme Deal');
  });

  it('returns null on 404', async () => {
    mockFetch({ message: 'Not Found' }, 404);
    const api = new OpportunitiesApi(new AffinityClient('key'));
    expect(await api.getById(999)).toBeNull();
  });

  it('caches result and avoids second fetch', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_OPP), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new OpportunitiesApi(client);
    await api.getById(1);
    await api.getById(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('OpportunitiesApi.create', () => {
  it('POSTs to /opportunities and returns created opp', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_OPP), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new OpportunitiesApi(new AffinityClient('key'));
    const result = await api.create({ name: 'Acme Deal', person_ids: [10] });
    expect(result.name).toBe('Acme Deal');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/opportunities');
    expect((init as RequestInit).method).toBe('POST');
  });
});

describe('OpportunitiesApi.update', () => {
  it('PUTs to /opportunities/{id} and returns updated opp', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ...MOCK_OPP, name: 'New Name' }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new OpportunitiesApi(new AffinityClient('key'));
    const result = await api.update(1, { name: 'New Name' });
    expect(result.name).toBe('New Name');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/opportunities/1');
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('updates cache on success', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_OPP), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new OpportunitiesApi(client);
    await api.update(1, { name: 'Updated' });
    // Cache should now be set — second getById should not fetch
    await api.getById(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
