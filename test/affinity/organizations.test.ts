import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { OrganizationsApi } from '../../src/affinity/organizations.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityOrganization } from '../../src/affinity/types.js';

const MOCK_ORG: AffinityOrganization = {
  id: 10,
  name: 'Acme Corp',
  domain: 'acme.com',
  domains: ['acme.com'],
  person_ids: [1, 2],
  opportunity_ids: [],
  list_entries: [],
  interaction_dates: {
    first_email_date: null,
    last_email_date: null,
    first_event_date: null,
    last_event_date: null,
    last_interaction_date: '2024-02-01',
    next_event_date: null,
  },
  created_at: '2023-01-01T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrganizationsApi.search', () => {
  it('returns organizations from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ organizations: [MOCK_ORG] }), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new OrganizationsApi(client);
    expect(await api.search('Acme')).toEqual([MOCK_ORG]);
  });

  it('returns an empty array when no orgs match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ organizations: [] }), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new OrganizationsApi(client);
    expect(await api.search('nobody')).toEqual([]);
  });

  it('returns an empty array when response has no organizations key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new OrganizationsApi(client);
    expect(await api.search('anything')).toEqual([]);
  });

  it('serves results from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ organizations: [MOCK_ORG] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new OrganizationsApi(client);
    await api.search('Acme');
    await api.search('Acme');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('OrganizationsApi.getById', () => {
  it('returns the organization from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_ORG), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new OrganizationsApi(client);
    expect(await api.getById(10)).toEqual(MOCK_ORG);
  });

  it('serves the result from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_ORG), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new OrganizationsApi(client);
    await api.getById(10);
    await api.getById(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('OrganizationsApi.create', () => {
  it('POSTs to /organizations and returns the created org', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_ORG), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new OrganizationsApi(new AffinityClient('key'));
    const result = await api.create({ name: 'Acme Corp', domain: 'acme.com' });
    expect(result).toEqual(MOCK_ORG);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/organizations');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('sends all provided fields in the request body', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_ORG), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new OrganizationsApi(new AffinityClient('key'));
    await api.create({ name: 'Acme Corp', domain: 'acme.com', person_ids: [1, 2] });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.name).toBe('Acme Corp');
    expect(body.domain).toBe('acme.com');
    expect(body.person_ids).toEqual([1, 2]);
  });
});

describe('OrganizationsApi.update', () => {
  it('PUTs to /organizations/{id} and returns the updated org', async () => {
    const updated = { ...MOCK_ORG, name: 'Acme Inc' };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(updated), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new OrganizationsApi(new AffinityClient('key'));
    const result = await api.update(10, { name: 'Acme Inc' });
    expect(result.name).toBe('Acme Inc');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/organizations/10');
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('writes the updated org to the cache', async () => {
    const updated = { ...MOCK_ORG, name: 'Acme Inc' };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(updated), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const cache = makeKVMock();
    const api = new OrganizationsApi(new AffinityClient('key', { cache }));
    await api.update(10, { name: 'Acme Inc' });
    // getById should now be served from cache without a second fetch
    vi.stubGlobal('fetch', vi.fn());
    const cached = await api.getById(10);
    expect(cached.name).toBe('Acme Inc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
