import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { IntelligenceApi } from '../../src/affinity/intelligence.js';
import { PeopleApi } from '../../src/affinity/people.js';
import { OrganizationsApi } from '../../src/affinity/organizations.js';
import { NotesApi } from '../../src/affinity/notes.js';
import { registerIntelligenceTools } from '../../src/tools/intelligence.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityPerson, AffinityOrganization, AffinityRelationshipStrength } from '../../src/affinity/types.js';

const BASE_DATES = { first_email_date: '2023-01-01', last_email_date: '2024-01-20', first_event_date: null, last_event_date: null, last_interaction_date: '2024-01-20', next_event_date: null };

const MOCK_PERSON: AffinityPerson = { id: 1, type: 0, first_name: 'Alice', last_name: 'Smith', emails: ['alice@example.com'], primary_email: 'alice@example.com', phones: [], organization_ids: [10], opportunity_ids: [], list_entries: [], interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z' };
const MOCK_ORG: AffinityOrganization = { id: 10, name: 'Acme', domain: 'acme.com', domains: ['acme.com'], person_ids: [1, 2], opportunity_ids: [], list_entries: [], interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z' };
const PERSON_2: AffinityPerson = { ...MOCK_PERSON, id: 2, first_name: 'Bob', last_name: 'Jones', emails: ['bob@example.com'], primary_email: 'bob@example.com' };
const MOCK_STRENGTH: AffinityRelationshipStrength = { entity_id: 1, entity_type: 0, strength: 75, last_activity_date: '2024-01-20' };

afterEach(() => vi.unstubAllGlobals());

function setupTools(fetchSequence: unknown[]) {
  let callCount = 0;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    const resp = fetchSequence[callCount] ?? fetchSequence[fetchSequence.length - 1];
    callCount++;
    return Promise.resolve(new Response(JSON.stringify(resp), { status: 200 }));
  }));
  const client = new AffinityClient('key');
  const intelligenceApi = new IntelligenceApi(client);
  const peopleApi = new PeopleApi(client);
  const orgsApi = new OrganizationsApi(client);
  const notesApi = new NotesApi(client);
  const { server, callTool } = makeMockServer();
  registerIntelligenceTools(server, intelligenceApi, peopleApi, orgsApi, notesApi);
  return { callTool };
}

describe('get_relationship_strength tool', () => {
  it('returns strength score and label for a person', async () => {
    const { callTool } = setupTools([MOCK_STRENGTH]);
    const result = await callTool('get_relationship_strength', { entity_id: 1, entity_type: 0 });
    const text = result.content[0].text;
    expect(text).toContain('75/100');
    expect(text).toContain('Strong');
    expect(text).toContain('person 1');
  });

  it('returns strength score for an organization', async () => {
    const orgStrength = { ...MOCK_STRENGTH, entity_type: 1, strength: 85 };
    const { callTool } = setupTools([orgStrength]);
    const result = await callTool('get_relationship_strength', { entity_id: 10, entity_type: 1 });
    const text = result.content[0].text;
    expect(text).toContain('organization 10');
    expect(text).toContain('Very Strong');
  });

  it('shows "unknown" when last_activity_date is null', async () => {
    const { callTool } = setupTools([{ ...MOCK_STRENGTH, last_activity_date: null }]);
    const result = await callTool('get_relationship_strength', { entity_id: 1, entity_type: 0 });
    expect(result.content[0].text).toContain('unknown');
  });

  it('labels strength correctly across all bands', async () => {
    for (const [strength, label] of [[85, 'Very Strong'], [65, 'Strong'], [45, 'Moderate'], [25, 'Weak'], [10, 'Very Weak']] as const) {
      const { callTool } = setupTools([{ ...MOCK_STRENGTH, strength }]);
      const result = await callTool('get_relationship_strength', { entity_id: 1, entity_type: 0 });
      expect(result.content[0].text).toContain(label);
    }
  });
});

describe('find_intro_path tool', () => {
  it('returns ranked introducers from shared organizations', async () => {
    // Sequence: getById(person), getById(org), getRelationshipStrength(2), getById(person 2)
    const { callTool } = setupTools([
      MOCK_PERSON,   // target person lookup
      MOCK_ORG,      // org lookup
      MOCK_STRENGTH, // strength for person 2
      PERSON_2,      // name lookup for person 2
    ]);
    const result = await callTool('find_intro_path', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('Bob Jones');
    expect(text).toContain('/100');
  });

  it('returns message when target person has no organizations', async () => {
    const personNoOrgs = { ...MOCK_PERSON, organization_ids: [] };
    const { callTool } = setupTools([personNoOrgs]);
    const result = await callTool('find_intro_path', { person_id: 1 });
    expect(result.content[0].text).toContain('no associated organizations');
  });

  it('returns message when orgs have no other members', async () => {
    const orgNoOthers = { ...MOCK_ORG, person_ids: [1] }; // only the target
    const { callTool } = setupTools([MOCK_PERSON, orgNoOthers]);
    const result = await callTool('find_intro_path', { person_id: 1 });
    expect(result.content[0].text).toContain('No shared organization members found');
  });

  it('handles strength fetch failure for a connector gracefully', async () => {
    // Strength call fails → connector still shown with strength 0
    let call = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify(MOCK_PERSON), { status: 200 }));
      if (call === 2) return Promise.resolve(new Response(JSON.stringify(MOCK_ORG), { status: 200 }));
      if (call === 3) return Promise.resolve(new Response('{}', { status: 500 })); // strength fails
      return Promise.resolve(new Response(JSON.stringify(PERSON_2), { status: 200 }));
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client));
    const result = await callTool('find_intro_path', { person_id: 1 });
    // Should not throw — connector shown with 0/100
    expect(result.content[0].text).toContain('/100');
  });

  it('handles getById failure for a connector gracefully', async () => {
    let call = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify(MOCK_PERSON), { status: 200 }));
      if (call === 2) return Promise.resolve(new Response(JSON.stringify(MOCK_ORG), { status: 200 }));
      if (call === 3) return Promise.resolve(new Response(JSON.stringify(MOCK_STRENGTH), { status: 200 }));
      return Promise.resolve(new Response('{}', { status: 404 })); // person lookup fails
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client));
    const result = await callTool('find_intro_path', { person_id: 1 });
    // Falls back to "Person {id}"
    expect(result.content[0].text).toContain('Person 2');
  });
});

describe('summarize_relationship tool', () => {
  it('returns error when neither person_id nor organization_id provided', async () => {
    const { callTool } = setupTools([]);
    const result = await callTool('summarize_relationship', {});
    expect(result.content[0].text).toContain('Provide either person_id or organization_id');
  });

  it('aggregates person profile, strength, notes, and interactions', async () => {
    const { callTool } = setupTools([
      MOCK_PERSON,              // getById (profile)
      MOCK_STRENGTH,            // getRelationshipStrength
      [],                       // getNotes
      [],                       // getInteractions
    ]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('Alice Smith');
    expect(text).toContain('75/100');
    expect(text).toContain('Recent Notes');
    expect(text).toContain('Recent Interactions');
  });

  it('aggregates org profile, strength, notes, and interactions', async () => {
    const orgStrength = { ...MOCK_STRENGTH, entity_type: 1, entity_id: 10 };
    const { callTool } = setupTools([
      MOCK_ORG,      // getById (profile)
      orgStrength,   // getRelationshipStrength
      [],            // getNotes
      [],            // getInteractions
    ]);
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    const text = result.content[0].text;
    expect(text).toContain('Acme');
    expect(text).toContain('75/100');
  });

  it('includes org notes when present', async () => {
    const note = { id: 1, person_ids: [], organization_ids: [10], opportunity_ids: [], creator_id: 99, content: 'Key account', type: 0, is_deleted: false, created_at: '2024-01-15T00:00:00Z' };
    const orgStrength = { ...MOCK_STRENGTH, entity_type: 1 };
    const { callTool } = setupTools([MOCK_ORG, orgStrength, [note], []]);
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    expect(result.content[0].text).toContain('Key account');
  });

  it('includes org interactions when present (meeting type)', async () => {
    const interaction = { id: 5, type: 1, date: '2024-01-10T00:00:00Z', subject: null, body_text: null, person_ids: [], organization_ids: [10], creator_ids: [99] };
    const orgStrength = { ...MOCK_STRENGTH, entity_type: 1 };
    const { callTool } = setupTools([MOCK_ORG, orgStrength, [], [interaction]]);
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    const text = result.content[0].text;
    expect(text).toContain('Meeting');
    expect(text).toContain('(no subject)');
  });

  it('handles NotFoundError from org getRelationshipStrength gracefully', async () => {
    let call = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify(MOCK_ORG), { status: 200 }));
      if (call === 2) return Promise.resolve(new Response('{}', { status: 404 }));
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client));
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    expect(result.content[0].text).toContain('Acme');
  });

  it('handles NotFoundError from getRelationshipStrength gracefully', async () => {
    // Simulate 404 for strength call
    let call = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify(MOCK_PERSON), { status: 200 }));
      if (call === 2) return Promise.resolve(new Response('{}', { status: 404 }));
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client));
    const result = await callTool('summarize_relationship', { person_id: 1 });
    // Should not throw — strength section simply omitted
    expect(result.content[0].text).toContain('Alice Smith');
  });

  it('includes note content when notes are present', async () => {
    const note = { id: 1, person_ids: [1], organization_ids: [], opportunity_ids: [], creator_id: 99, content: 'Very promising lead', type: 0, is_deleted: false, created_at: '2024-01-15T00:00:00Z' };
    const { callTool } = setupTools([MOCK_PERSON, MOCK_STRENGTH, [note], []]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    expect(result.content[0].text).toContain('Very promising lead');
  });

  it('includes interaction details when interactions are present', async () => {
    const interaction = { id: 5, type: 0, date: '2024-01-10T00:00:00Z', subject: 'Intro call', body_text: null, person_ids: [1], organization_ids: [], creator_ids: [99] };
    const { callTool } = setupTools([MOCK_PERSON, MOCK_STRENGTH, [], [interaction]]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    expect(result.content[0].text).toContain('Intro call');
  });
});
