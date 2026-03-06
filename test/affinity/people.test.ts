import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { PeopleApi } from '../../src/affinity/people.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityPerson } from '../../src/affinity/types.js';

const MOCK_PERSON: AffinityPerson = {
  id: 1,
  type: 0,
  first_name: 'Alice',
  last_name: 'Smith',
  emails: ['alice@example.com'],
  primary_email: 'alice@example.com',
  phones: [],
  organization_ids: [10],
  opportunity_ids: [],
  list_entries: [],
  interaction_dates: {
    first_email_date: null,
    last_email_date: null,
    first_event_date: null,
    last_event_date: null,
    last_interaction_date: '2024-01-15',
    next_event_date: null,
  },
  created_at: '2023-01-01T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PeopleApi.search', () => {
  it('returns people from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ persons: [MOCK_PERSON] }), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new PeopleApi(client);
    const result = await api.search('Alice');
    expect(result).toEqual([MOCK_PERSON]);
  });

  it('returns an empty array when no people match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ persons: [] }), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new PeopleApi(client);
    expect(await api.search('nobody')).toEqual([]);
  });

  it('returns an empty array when response has no persons key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new PeopleApi(client);
    expect(await api.search('anything')).toEqual([]);
  });

  it('serves results from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ persons: [MOCK_PERSON] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new PeopleApi(client);
    await api.search('Alice');
    await api.search('Alice');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('PeopleApi.getById', () => {
  it('returns the person from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_PERSON), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new PeopleApi(client);
    expect(await api.getById(1)).toEqual(MOCK_PERSON);
  });

  it('serves the result from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_PERSON), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new PeopleApi(client);
    await api.getById(1);
    await api.getById(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes separate cache entries for different person IDs', async () => {
    const person2 = { ...MOCK_PERSON, id: 2, first_name: 'Bob' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_PERSON), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(person2), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new PeopleApi(client);
    const p1 = await api.getById(1);
    const p2 = await api.getById(2);
    expect(p1.id).toBe(1);
    expect(p2.id).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
