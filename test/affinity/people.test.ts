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

describe('PeopleApi.create', () => {
  it('POSTs to /persons and returns the created person', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_PERSON), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new PeopleApi(new AffinityClient('key'));
    const result = await api.create({ first_name: 'Alice', last_name: 'Smith', emails: ['alice@example.com'] });
    expect(result).toEqual(MOCK_PERSON);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/persons');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('sends all provided fields in the request body', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_PERSON), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new PeopleApi(new AffinityClient('key'));
    await api.create({ first_name: 'Alice', last_name: 'Smith', emails: ['alice@example.com'], organization_ids: [10] });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.first_name).toBe('Alice');
    expect(body.last_name).toBe('Smith');
    expect(body.emails).toEqual(['alice@example.com']);
    expect(body.organization_ids).toEqual([10]);
  });
});

describe('PeopleApi.update', () => {
  it('PUTs to /persons/{id} and returns the updated person', async () => {
    const updated = { ...MOCK_PERSON, first_name: 'Alicia' };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(updated), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new PeopleApi(new AffinityClient('key'));
    const result = await api.update(1, { first_name: 'Alicia' });
    expect(result.first_name).toBe('Alicia');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/persons/1');
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('writes the updated person to the cache', async () => {
    const updated = { ...MOCK_PERSON, first_name: 'Alicia' };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(updated), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const cache = makeKVMock();
    const api = new PeopleApi(new AffinityClient('key', { cache }));
    await api.update(1, { first_name: 'Alicia' });
    // getById should now be served from cache without a second fetch
    vi.stubGlobal('fetch', vi.fn());
    const cached = await api.getById(1);
    expect(cached.first_name).toBe('Alicia');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
