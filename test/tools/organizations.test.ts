import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient, AffinityNotFoundError } from '../../src/affinity/client.js';
import { OrganizationsApi } from '../../src/affinity/organizations.js';
import { registerOrganizationTools } from '../../src/tools/organizations.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityOrganization } from '../../src/affinity/types.js';

const MOCK_ORG: AffinityOrganization = {
  id: 10,
  name: 'Acme Corp',
  domain: 'acme.com',
  domains: ['acme.com', 'acme.io'],
  person_ids: [1, 2, 3],
  opportunity_ids: [],
  list_entries: [],
  interaction_dates: {
    first_email_date: '2023-03-01',
    last_email_date: '2024-01-20',
    first_event_date: null,
    last_event_date: null,
    last_interaction_date: '2024-01-20',
    next_event_date: null,
  },
  created_at: '2023-01-01T00:00:00Z',
};

afterEach(() => vi.unstubAllGlobals());

function setup(fetchResponse: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(fetchResponse), { status: 200 })
  ));
  const client = new AffinityClient('key');
  const api = new OrganizationsApi(client);
  const { server, callTool } = makeMockServer();
  registerOrganizationTools(server, api);
  return { callTool };
}

describe('search_organizations tool', () => {
  it('returns formatted results when orgs are found', async () => {
    const { callTool } = setup({ organizations: [MOCK_ORG] });
    const result = await callTool('search_organizations', { query: 'Acme', limit: 20 });
    const text = result.content[0].text;
    expect(text).toContain('Acme Corp');
    expect(text).toContain('acme.com');
    expect(text).toContain('Found 1 organization');
  });

  it('returns a not-found message when no orgs match', async () => {
    const { callTool } = setup({ organizations: [] });
    const result = await callTool('search_organizations', { query: 'Nobody', limit: 20 });
    expect(result.content[0].text).toContain('No organizations found matching "Nobody"');
  });

  it('shows "No recorded interactions" when last_interaction_date is null', async () => {
    const noInteraction = { ...MOCK_ORG, interaction_dates: { ...MOCK_ORG.interaction_dates, last_interaction_date: null } };
    const { callTool } = setup({ organizations: [noInteraction] });
    const result = await callTool('search_organizations', { query: 'x', limit: 20 });
    expect(result.content[0].text).toContain('No recorded interactions');
  });

  it('shows "no domain" when org has no domain or domains', async () => {
    const noDomain = { ...MOCK_ORG, domain: null, domains: [] };
    const { callTool } = setup({ organizations: [noDomain] });
    const result = await callTool('search_organizations', { query: 'x', limit: 20 });
    expect(result.content[0].text).toContain('no domain');
  });
});

describe('get_organization tool', () => {
  it('returns full org details', async () => {
    const { callTool } = setup(MOCK_ORG);
    const result = await callTool('get_organization', { org_id: 10 });
    const text = result.content[0].text;
    expect(text).toContain('Acme Corp');
    expect(text).toContain('acme.com, acme.io');
    expect(text).toContain('1, 2, 3');
    expect(text).toContain('2024-01-20');
  });

  it('handles org with no domains or people', async () => {
    const sparse: AffinityOrganization = {
      ...MOCK_ORG,
      domains: [],
      domain: null,
      person_ids: [],
      interaction_dates: {
        first_email_date: null,
        last_email_date: null,
        first_event_date: null,
        last_event_date: null,
        last_interaction_date: null,
        next_event_date: null,
      },
    };
    const { callTool } = setup(sparse);
    const result = await callTool('get_organization', { org_id: 10 });
    const text = result.content[0].text;
    expect(text).toContain('Domains: none');
    expect(text).toContain('Person IDs: none');
    expect(text).toContain('N/A');
  });

  it('returns a Not found response when the API returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    const api = new OrganizationsApi(new AffinityClient('key'));
    const { server, callTool } = makeMockServer();
    registerOrganizationTools(server, api);
    const result = await callTool('get_organization', { org_id: 999 });
    expect(result.content[0].text).toContain('Not found:');
  });

  it('re-throws unknown errors from get_organization', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));
    const api = new OrganizationsApi(new AffinityClient('key'));
    const { server, callTool } = makeMockServer();
    registerOrganizationTools(server, api);
    await expect(callTool('get_organization', { org_id: 10 })).rejects.toThrow('network failure');
  });
});

describe('create_organization tool', () => {
  it('returns a success message with the created org ID and name', async () => {
    const { callTool } = setup(MOCK_ORG);
    const result = await callTool('create_organization', { name: 'Acme Corp' });
    const text = result.content[0].text;
    expect(text).toContain('Created organization');
    expect(text).toContain('[id:10]');
    expect(text).toContain('Acme Corp');
  });

  it('returns a Not found response when the API returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    const api = new OrganizationsApi(new AffinityClient('key'));
    const { server, callTool } = makeMockServer();
    registerOrganizationTools(server, api);
    const result = await callTool('create_organization', { name: 'Ghost Corp' });
    expect(result.content[0].text).toContain('Not found:');
  });

  it('passes optional fields through to the API', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_ORG), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key');
    const api = new OrganizationsApi(client);
    const { server, callTool } = makeMockServer();
    registerOrganizationTools(server, api);
    await callTool('create_organization', { name: 'Acme Corp', domain: 'acme.com', person_ids: [1, 2] });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.domain).toBe('acme.com');
    expect(body.person_ids).toEqual([1, 2]);
  });
});

describe('update_organization tool', () => {
  it('returns a success message with the updated org ID and name', async () => {
    const updated = { ...MOCK_ORG, name: 'Acme Inc' };
    const { callTool } = setup(updated);
    const result = await callTool('update_organization', { org_id: 10, name: 'Acme Inc' });
    const text = result.content[0].text;
    expect(text).toContain('Updated organization');
    expect(text).toContain('[id:10]');
    expect(text).toContain('Acme Inc');
  });

  it('returns an error message when no fields are provided', async () => {
    const { callTool } = setup(MOCK_ORG);
    const result = await callTool('update_organization', { org_id: 10 });
    expect(result.content[0].text).toContain('Provide at least one field to update');
  });

  it('returns a Not found response when the API returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    const api = new OrganizationsApi(new AffinityClient('key'));
    const { server, callTool } = makeMockServer();
    registerOrganizationTools(server, api);
    const result = await callTool('update_organization', { org_id: 999, name: 'Ghost Corp' });
    expect(result.content[0].text).toContain('Not found:');
  });
});
