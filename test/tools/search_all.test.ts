import { describe, it, expect, vi } from 'vitest';
import { PeopleApi } from '../../src/affinity/people.js';
import { OrganizationsApi } from '../../src/affinity/organizations.js';
import { OpportunitiesApi } from '../../src/affinity/opportunities.js';
import { registerSearchAllTool } from '../../src/tools/search_all.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityPerson, AffinityOrganization, AffinityOpportunity } from '../../src/affinity/types.js';

const BASE_DATES = { first_email_date: null, last_email_date: null, first_event_date: null, last_event_date: null, last_interaction_date: null, next_event_date: null };

const MOCK_PERSON: AffinityPerson = {
  id: 1, type: 0, first_name: 'Alice', last_name: 'Smith',
  emails: ['alice@acme.com'], primary_email: 'alice@acme.com',
  phones: [], organization_ids: [], opportunity_ids: [], list_entries: [],
  interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z',
};

const MOCK_ORG: AffinityOrganization = {
  id: 10, name: 'Acme Corp', domain: 'acme.com', domains: ['acme.com'],
  person_ids: [], opportunity_ids: [], list_entries: [],
  interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z',
};

const MOCK_OPP: AffinityOpportunity = {
  id: 50, name: 'Acme Series A',
  person_ids: [], organization_ids: [], list_entries: [], created_at: '2023-01-01T00:00:00Z',
};

function setup(
  people: AffinityPerson[] = [],
  orgs: AffinityOrganization[] = [],
  opps: AffinityOpportunity[] = [],
) {
  const peopleApi = { search: vi.fn().mockResolvedValue(people) } as unknown as PeopleApi;
  const orgsApi = { search: vi.fn().mockResolvedValue(orgs) } as unknown as OrganizationsApi;
  const oppsApi = { search: vi.fn().mockResolvedValue(opps) } as unknown as OpportunitiesApi;
  const { server, callTool } = makeMockServer();
  registerSearchAllTool(server, peopleApi, orgsApi, oppsApi);
  return { callTool, peopleApi, orgsApi, oppsApi };
}

describe('search_all tool', () => {
  it('returns "no results" when all three APIs return empty', async () => {
    const { callTool } = setup();
    const result = await callTool('search_all', { query: 'xyz' });
    expect(result.content[0].text).toContain('No results found');
    expect(result.content[0].text).toContain('"xyz"');
  });

  it('returns a unified interleaved result set', async () => {
    const { callTool } = setup([MOCK_PERSON], [MOCK_ORG], [MOCK_OPP]);
    const result = await callTool('search_all', { query: 'acme' });
    const text = result.content[0].text;
    expect(text).toContain('[person:1]');
    expect(text).toContain('Alice Smith');
    expect(text).toContain('[org:10]');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('[opp:50]');
    expect(text).toContain('Acme Series A');
    expect(text).toContain('3 result(s)');
    expect(text).toContain('1 people, 1 orgs, 1 opps');
  });

  it('interleaves results by position (person[0], org[0], opp[0], person[1], ...)', async () => {
    const person2: AffinityPerson = { ...MOCK_PERSON, id: 2, first_name: 'Bob', last_name: 'Jones' };
    const { callTool } = setup([MOCK_PERSON, person2], [MOCK_ORG], []);
    const result = await callTool('search_all', { query: 'acme' });
    const text = result.content[0].text;
    const p1Pos = text.indexOf('[person:1]');
    const orgPos = text.indexOf('[org:10]');
    const p2Pos = text.indexOf('[person:2]');
    // person[0] before org[0] before person[1]
    expect(p1Pos).toBeLessThan(orgPos);
    expect(orgPos).toBeLessThan(p2Pos);
  });

  it('works when only one entity type returns results', async () => {
    const { callTool } = setup([], [MOCK_ORG], []);
    const result = await callTool('search_all', { query: 'acme' });
    const text = result.content[0].text;
    expect(text).toContain('[org:10]');
    expect(text).not.toContain('[person:');
    expect(text).not.toContain('[opp:');
    expect(text).toContain('1 result(s)');
  });

  it('passes query and limit to all three APIs', async () => {
    const { callTool, peopleApi, orgsApi, oppsApi } = setup();
    await callTool('search_all', { query: 'test', limit: 5 });
    expect(peopleApi.search).toHaveBeenCalledWith('test', 5);
    expect(orgsApi.search).toHaveBeenCalledWith('test', 5);
    expect(oppsApi.search).toHaveBeenCalledWith('test');
  });

  it('shows "(no name)" when person has no first or last name', async () => {
    const noName: AffinityPerson = { ...MOCK_PERSON, first_name: '', last_name: '' };
    const { callTool } = setup([noName]);
    const result = await callTool('search_all', { query: 'acme' });
    expect(result.content[0].text).toContain('(no name)');
  });

  it('shows "no email" when person has no primary email and no emails', async () => {
    const noEmail: AffinityPerson = { ...MOCK_PERSON, primary_email: null as unknown as string, emails: [] };
    const { callTool } = setup([noEmail]);
    const result = await callTool('search_all', { query: 'acme' });
    expect(result.content[0].text).toContain('no email');
  });

  it('uses domain fallback when org has no primary domain', async () => {
    const orgNoDomain: AffinityOrganization = { ...MOCK_ORG, domain: null as unknown as string, domains: [] };
    const { callTool } = setup([], [orgNoDomain], []);
    const result = await callTool('search_all', { query: 'acme' });
    expect(result.content[0].text).toContain('no domain');
  });
});
