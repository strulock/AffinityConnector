import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { PeopleApi } from '../../src/affinity/people.js';
import { registerPeopleTools } from '../../src/tools/people.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityPerson } from '../../src/affinity/types.js';

const MOCK_PERSON: AffinityPerson = {
  id: 1,
  type: 0,
  first_name: 'Alice',
  last_name: 'Smith',
  emails: ['alice@example.com'],
  primary_email: 'alice@example.com',
  phones: [],
  organization_ids: [10, 20],
  opportunity_ids: [],
  list_entries: [],
  interaction_dates: {
    first_email_date: '2023-01-01',
    last_email_date: '2024-01-10',
    first_event_date: null,
    last_event_date: null,
    last_interaction_date: '2024-01-10',
    next_event_date: '2024-03-15',
  },
  created_at: '2023-01-01T00:00:00Z',
};

afterEach(() => vi.unstubAllGlobals());

function setup(fetchResponse: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(fetchResponse), { status: 200 })
  ));
  const client = new AffinityClient('key');
  const api = new PeopleApi(client);
  const { server, callTool } = makeMockServer();
  registerPeopleTools(server, api);
  return { callTool };
}

describe('search_people tool', () => {
  it('returns formatted results when people are found', async () => {
    const { callTool } = setup({ persons: [MOCK_PERSON] });
    const result = await callTool('search_people', { query: 'Alice', limit: 20 });
    const text = result.content[0].text;
    expect(text).toContain('Alice Smith');
    expect(text).toContain('alice@example.com');
    expect(text).toContain('Found 1 person');
  });

  it('shows "(no name)" when person has no first or last name', async () => {
    const noName = { ...MOCK_PERSON, first_name: '', last_name: '' };
    const { callTool } = setup({ persons: [noName] });
    const result = await callTool('search_people', { query: 'x', limit: 20 });
    expect(result.content[0].text).toContain('(no name)');
  });

  it('shows "no email" when person has no email at all', async () => {
    const noEmail = { ...MOCK_PERSON, primary_email: null, emails: [] };
    const { callTool } = setup({ persons: [noEmail] });
    const result = await callTool('search_people', { query: 'x', limit: 20 });
    expect(result.content[0].text).toContain('no email');
  });

  it('shows "No recorded interactions" when last_interaction_date is null', async () => {
    const noInteraction = { ...MOCK_PERSON, interaction_dates: { ...MOCK_PERSON.interaction_dates, last_interaction_date: null } };
    const { callTool } = setup({ persons: [noInteraction] });
    const result = await callTool('search_people', { query: 'x', limit: 20 });
    expect(result.content[0].text).toContain('No recorded interactions');
  });

  it('returns a not-found message when no people match', async () => {
    const { callTool } = setup({ persons: [] });
    const result = await callTool('search_people', { query: 'Nobody', limit: 20 });
    expect(result.content[0].text).toContain('No people found matching "Nobody"');
  });
});

describe('get_person tool', () => {
  it('returns full person details', async () => {
    const { callTool } = setup(MOCK_PERSON);
    const result = await callTool('get_person', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('Alice Smith');
    expect(text).toContain('alice@example.com');
    expect(text).toContain('10, 20');
    expect(text).toContain('2024-01-10');
    expect(text).toContain('2024-03-15');
  });

  it('handles person with no emails or orgs', async () => {
    const sparse: AffinityPerson = {
      ...MOCK_PERSON,
      emails: [],
      primary_email: null,
      organization_ids: [],
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
    const result = await callTool('get_person', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('Emails: none');
    expect(text).toContain('Organization IDs: none');
    expect(text).toContain('N/A');
  });
});
