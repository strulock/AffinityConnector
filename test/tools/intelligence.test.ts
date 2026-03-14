import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { IntelligenceApi } from '../../src/affinity/intelligence.js';
import { PeopleApi } from '../../src/affinity/people.js';
import { OrganizationsApi } from '../../src/affinity/organizations.js';
import { NotesApi } from '../../src/affinity/notes.js';
import { InteractionsV2Api } from '../../src/affinity/interactions_v2.js';
import { UtilityApi } from '../../src/affinity/utility.js';
import { registerIntelligenceTools } from '../../src/tools/intelligence.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityPerson, AffinityOrganization, AffinityRelationshipStrength } from '../../src/affinity/types.js';

const BASE_DATES = { first_email_date: '2023-01-01', last_email_date: '2024-01-20', first_event_date: null, last_event_date: null, last_interaction_date: '2024-01-20', next_event_date: null };

const MOCK_PERSON: AffinityPerson = { id: 1, type: 0, first_name: 'Alice', last_name: 'Smith', emails: ['alice@example.com'], primary_email: 'alice@example.com', phones: [], organization_ids: [10], opportunity_ids: [], list_entries: [], interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z' };
const MOCK_ORG: AffinityOrganization = { id: 10, name: 'Acme', domain: 'acme.com', domains: ['acme.com'], person_ids: [1, 2, 3], opportunity_ids: [], list_entries: [], interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z' };
const PERSON_3: AffinityPerson = { ...MOCK_PERSON, id: 3, first_name: 'Carol', last_name: 'White', emails: ['carol@example.com'], primary_email: 'carol@example.com' };
const PERSON_2: AffinityPerson = { ...MOCK_PERSON, id: 2, first_name: 'Bob', last_name: 'Jones', emails: ['bob@example.com'], primary_email: 'bob@example.com' };
const MOCK_STRENGTH: AffinityRelationshipStrength = { entity_id: 1, entity_type: 0, strength: 75, last_activity_date: '2024-01-20' };
// v1 /relationships-strengths returns an array of { internal_id, external_id, strength } where strength is 0–1 float
const MOCK_STRENGTH_V1 = [{ internal_id: 99, external_id: 1, strength: 0.75 }];

// Mock current user response (v2 /auth/whoami)
const MOCK_CURRENT_USER = {
  user: { id: 99, firstName: 'Me', lastName: 'User', emailAddress: 'me@example.com' },
  tenant: { id: 1, name: 'Test Org' },
};

afterEach(() => vi.unstubAllGlobals());

// Default mock UtilityApi — returns user.id = 99
function makeMockUtilityApi(): UtilityApi {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: 99, first_name: 'Me', last_name: 'User', email: 'me@example.com', organization_id: 1, organization_name: 'Test Org' }),
    getRateLimit: vi.fn(),
  } as unknown as UtilityApi;
}

function setupTools(fetchSequence: unknown[], utilityApi?: UtilityApi) {
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
  const interactionsV2Api = new InteractionsV2Api(client);
  const { server, callTool } = makeMockServer();
  registerIntelligenceTools(server, intelligenceApi, peopleApi, orgsApi, notesApi, interactionsV2Api, utilityApi ?? makeMockUtilityApi());
  return { callTool };
}

describe('get_relationship_strength tool', () => {
  it('returns strength score and label for a person', async () => {
    const { callTool } = setupTools([MOCK_STRENGTH_V1]);
    const result = await callTool('get_relationship_strength', { entity_id: 1, entity_type: 0 });
    const text = result.content[0].text;
    expect(text).toContain('75/100');
    expect(text).toContain('Strong');
    expect(text).toContain('person 1');
  });

  it('returns strength score for an organization', async () => {
    const { callTool } = setupTools([[{ internal_id: 99, external_id: 10, strength: 0.85 }]]);
    const result = await callTool('get_relationship_strength', { entity_id: 10, entity_type: 1 });
    const text = result.content[0].text;
    expect(text).toContain('organization 10');
    expect(text).toContain('Very Strong');
  });

  it('shows "unknown" when last_activity_date is null', async () => {
    // v1 response never includes last_activity_date — the connector always returns null
    const { callTool } = setupTools([MOCK_STRENGTH_V1]);
    const result = await callTool('get_relationship_strength', { entity_id: 1, entity_type: 0 });
    expect(result.content[0].text).toContain('unknown');
  });

  it('labels strength correctly across all bands', async () => {
    for (const [strength, label] of [[0.85, 'Very Strong'], [0.65, 'Strong'], [0.45, 'Moderate'], [0.25, 'Weak'], [0.10, 'Very Weak']] as const) {
      const { callTool } = setupTools([[{ internal_id: 99, external_id: 1, strength }]]);
      const result = await callTool('get_relationship_strength', { entity_id: 1, entity_type: 0 });
      expect(result.content[0].text).toContain(label);
    }
  });
});

describe('find_intro_path tool', () => {
  it('returns ranked introducers from shared organizations', async () => {
    // Sequence: getById(person), getById(org), strengths for persons 2 & 3, name lookups
    const strength2 = [{ internal_id: 99, external_id: 2, strength: 0.75 }];
    const strength3 = [{ internal_id: 99, external_id: 3, strength: 0.40 }];
    const { callTool } = setupTools([
      MOCK_PERSON,   // target person lookup
      MOCK_ORG,      // org lookup (has person_ids [1,2,3])
      strength2,     // strength for person 2
      strength3,     // strength for person 3
      PERSON_2,      // name lookup for person 2
      PERSON_3,      // name lookup for person 3
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
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client), new InteractionsV2Api(client), makeMockUtilityApi());
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
      if (call === 3) return Promise.resolve(new Response(JSON.stringify(MOCK_STRENGTH_V1), { status: 200 }));
      return Promise.resolve(new Response('{}', { status: 404 })); // person lookup fails
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client), new InteractionsV2Api(client), makeMockUtilityApi());
    const result = await callTool('find_intro_path', { person_id: 1 });
    // Falls back to "Person {id}"
    expect(result.content[0].text).toContain('Person 2');
  });

  it('returns friendly message when target person is not found', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client), new InteractionsV2Api(client), makeMockUtilityApi());
    const result = await callTool('find_intro_path', { person_id: 999 });
    expect(result.content[0].text).toContain('not found');
    expect(result.content[0].text).toContain('999');
  });

  it('surfaces skipped org count when an org fetch fails', async () => {
    const personTwoOrgs = { ...MOCK_PERSON, organization_ids: [10, 11] };
    let call = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify(personTwoOrgs), { status: 200 }));
      if (call === 2) return Promise.resolve(new Response(JSON.stringify(MOCK_ORG), { status: 200 })); // org 10 ok
      if (call === 3) return Promise.resolve(new Response('{}', { status: 404 }));                     // org 11 fails
      if (call === 4) return Promise.resolve(new Response(JSON.stringify([{ internal_id: 99, external_id: 2, strength: 0.70 }]), { status: 200 }));
      if (call === 5) return Promise.resolve(new Response(JSON.stringify([{ internal_id: 99, external_id: 3, strength: 0.50 }]), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify(call === 6 ? PERSON_2 : PERSON_3), { status: 200 }));
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client), new InteractionsV2Api(client), makeMockUtilityApi());
    const result = await callTool('find_intro_path', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('Bob Jones');
    expect(text).toContain('1 organization(s) could not be fetched');
  });

  it('returns single best introducer when only one connector exists', async () => {
    const orgOneConnector = { ...MOCK_ORG, person_ids: [1, 2] };
    const { callTool } = setupTools([
      MOCK_PERSON,
      orgOneConnector,
      [{ internal_id: 99, external_id: 2, strength: 0.60 }],
      PERSON_2,
    ]);
    const result = await callTool('find_intro_path', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('Bob Jones');
    expect(text).toContain('60/100');
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
      MOCK_STRENGTH_V1,         // getRelationshipStrength
      [],                       // getNotes
      { data: [] },             // getEmails (v2)
      { data: [] },             // getMeetings (v2)
    ]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('Alice Smith');
    expect(text).toContain('75/100');
    expect(text).toContain('Recent Notes');
    expect(text).toContain('Recent Interactions');
  });

  it('aggregates org profile, strength, notes, and interactions', async () => {
    const { callTool } = setupTools([
      MOCK_ORG,              // getById (profile)
      MOCK_STRENGTH_V1,      // getRelationshipStrength
      [],               // getNotes
      { data: [] },     // getEmails (v2)
      { data: [] },     // getMeetings (v2)
    ]);
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    const text = result.content[0].text;
    expect(text).toContain('Acme');
    expect(text).toContain('75/100');
  });

  it('includes org notes when present', async () => {
    const note = { id: 1, person_ids: [], organization_ids: [10], opportunity_ids: [], creator_id: 99, content: 'Key account', type: 0, is_deleted: false, created_at: '2024-01-15T00:00:00Z' };
    const orgStrength = MOCK_STRENGTH_V1;
    const { callTool } = setupTools([MOCK_ORG, orgStrength, [note], { data: [] }, { data: [] }]);
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    expect(result.content[0].text).toContain('Key account');
  });

  it('includes org interactions when present (meeting type)', async () => {
    const meeting = { id: 'm1', title: null, start_time: '2024-01-10T00:00:00Z', end_time: null, created_at: '2024-01-10T00:00:00Z', person_ids: [], organization_ids: [10] };
    const orgStrength = MOCK_STRENGTH_V1;
    const { callTool } = setupTools([MOCK_ORG, orgStrength, [], { data: [] }, { data: [meeting] }]);
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    const text = result.content[0].text;
    expect(text).toContain('Meeting');
    expect(text).toContain('(no title)');
  });

  it('handles NotFoundError from org getRelationshipStrength gracefully', async () => {
    let call = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify(MOCK_ORG), { status: 200 }));
      if (call === 2) return Promise.resolve(new Response('{}', { status: 404 }));
      // getNotes returns [], getEmails returns {data:[]}, getMeetings returns {data:[]}
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client), new InteractionsV2Api(client), makeMockUtilityApi());
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    expect(result.content[0].text).toContain('Acme');
  });

  it('handles NotFoundError from getRelationshipStrength gracefully', async () => {
    let call = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify(MOCK_PERSON), { status: 200 }));
      if (call === 2) return Promise.resolve(new Response('{}', { status: 404 }));
      // getNotes returns [], getEmails returns {data:[]}, getMeetings returns {data:[]}
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client), new InteractionsV2Api(client), makeMockUtilityApi());
    const result = await callTool('summarize_relationship', { person_id: 1 });
    // Should not throw — strength section simply omitted
    expect(result.content[0].text).toContain('Alice Smith');
  });

  it('includes note content when notes are present', async () => {
    const note = { id: 1, person_ids: [1], organization_ids: [], opportunity_ids: [], creator_id: 99, content: 'Very promising lead', type: 0, is_deleted: false, created_at: '2024-01-15T00:00:00Z' };
    const { callTool } = setupTools([MOCK_PERSON, MOCK_STRENGTH_V1, [note], { data: [] }, { data: [] }]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    expect(result.content[0].text).toContain('Very promising lead');
  });

  it('includes interaction details when interactions are present', async () => {
    const email = { id: 'e1', subject: 'Intro call', sent_at: '2024-01-10T00:00:00Z', created_at: '2024-01-10T00:00:00Z', person_ids: [1], organization_ids: [] };
    const { callTool } = setupTools([MOCK_PERSON, MOCK_STRENGTH_V1, [], { data: [email] }, { data: [] }]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    expect(result.content[0].text).toContain('Intro call');
  });

  it('includes meeting with title in person interactions', async () => {
    const meeting = { id: 'm1', title: 'Strategy call', start_time: '2024-01-11T00:00:00Z', end_time: null, created_at: '2024-01-11T00:00:00Z', person_ids: [1], organization_ids: [] };
    const { callTool } = setupTools([MOCK_PERSON, MOCK_STRENGTH_V1, [], { data: [] }, { data: [meeting] }]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    expect(result.content[0].text).toContain('Strategy call');
  });

  it('shows fallback labels when person email subject and meeting title are null', async () => {
    const email = { id: 'e3', subject: null, sent_at: '2024-01-08T00:00:00Z', created_at: '2024-01-08T00:00:00Z', person_ids: [1], organization_ids: [] };
    const meeting = { id: 'm2', title: null, start_time: '2024-01-09T00:00:00Z', end_time: null, created_at: '2024-01-09T00:00:00Z', person_ids: [1], organization_ids: [] };
    const { callTool } = setupTools([MOCK_PERSON, MOCK_STRENGTH_V1, [], { data: [email] }, { data: [meeting] }]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('(no subject)');
    expect(text).toContain('(no title)');
  });

  it('includes email in org interactions when present', async () => {
    const orgStrength = MOCK_STRENGTH_V1;
    const email = { id: 'e2', subject: null, sent_at: '2024-01-09T00:00:00Z', created_at: '2024-01-09T00:00:00Z', person_ids: [], organization_ids: [10] };
    const { callTool } = setupTools([MOCK_ORG, orgStrength, [], { data: [email] }, { data: [] }]);
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    expect(result.content[0].text).toContain('(no subject)');
  });

  it('falls back to emails[0] when person primary_email is null', async () => {
    const personNoEmail = { ...MOCK_PERSON, primary_email: null, emails: ['secondary@example.com'] };
    const { callTool } = setupTools([personNoEmail, MOCK_STRENGTH_V1, [], { data: [] }, { data: [] }]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    expect(result.content[0].text).toContain('secondary@example.com');
  });

  it('falls back to domains[0] when org domain is null', async () => {
    const orgNoDomain = { ...MOCK_ORG, domain: null, domains: ['fallback.com'] };
    const orgStrength = MOCK_STRENGTH_V1;
    const { callTool } = setupTools([orgNoDomain, orgStrength, [], { data: [] }, { data: [] }]);
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    expect(result.content[0].text).toContain('fallback.com');
  });

  it('shows "unknown" last activity for person when strength date is null', async () => {
    // v1 /relationships-strengths never returns last_activity_date, so it's always null → "unknown"
    const { callTool } = setupTools([MOCK_PERSON, MOCK_STRENGTH_V1, [], { data: [] }, { data: [] }]);
    const result = await callTool('summarize_relationship', { person_id: 1 });
    expect(result.content[0].text).toContain('unknown');
  });

  it('re-throws non-404 errors from getRelationshipStrength for person', async () => {
    let call = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify(MOCK_PERSON), { status: 200 }));
      return Promise.resolve(new Response('Internal Server Error', { status: 500 }));
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client), new InteractionsV2Api(client), makeMockUtilityApi());
    await expect(callTool('summarize_relationship', { person_id: 1 })).rejects.toThrow();
  });

  it('re-throws non-404 errors from getRelationshipStrength for organization', async () => {
    let call = 0;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(new Response(JSON.stringify(MOCK_ORG), { status: 200 }));
      return Promise.resolve(new Response('Internal Server Error', { status: 500 }));
    }));
    const client = new AffinityClient('key');
    const { server, callTool } = makeMockServer();
    registerIntelligenceTools(server, new IntelligenceApi(client), new PeopleApi(client), new OrganizationsApi(client), new NotesApi(client), new InteractionsV2Api(client), makeMockUtilityApi());
    await expect(callTool('summarize_relationship', { organization_id: 10 })).rejects.toThrow();
  });

  it('shows "unknown" last activity for org when strength date is null', async () => {
    // v1 /relationships-strengths never returns last_activity_date, so it's always null → "unknown"
    const { callTool } = setupTools([MOCK_ORG, MOCK_STRENGTH_V1, [], { data: [] }, { data: [] }]);
    const result = await callTool('summarize_relationship', { organization_id: 10 });
    expect(result.content[0].text).toContain('unknown');
  });
});
