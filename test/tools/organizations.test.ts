import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
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
});
