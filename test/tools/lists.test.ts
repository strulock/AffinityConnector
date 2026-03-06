import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { ListsApi } from '../../src/affinity/lists.js';
import { registerListTools } from '../../src/tools/lists.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityList, AffinityListEntry, AffinityFieldValue, AffinityPerson, AffinityOrganization, AffinityOpportunity } from '../../src/affinity/types.js';

const MOCK_LIST: AffinityList = { id: 1, type: 1, name: 'Pipeline', public: true, owner_id: 99, list_size: 5, created_at: '2023-01-01T00:00:00Z' };
const MOCK_PRIVATE_LIST: AffinityList = { ...MOCK_LIST, id: 2, type: 0, name: 'Contacts', public: false };

const BASE_DATES = { first_email_date: null, last_email_date: null, first_event_date: null, last_event_date: null, last_interaction_date: null, next_event_date: null };

const PERSON_ENTITY: AffinityPerson = { id: 1, type: 0, first_name: 'Alice', last_name: 'Smith', emails: ['alice@example.com'], primary_email: 'alice@example.com', phones: [], organization_ids: [], opportunity_ids: [], list_entries: [], interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z' };
const ORG_ENTITY: AffinityOrganization = { id: 10, name: 'Acme', domain: 'acme.com', domains: ['acme.com'], person_ids: [], opportunity_ids: [], list_entries: [], interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z' };
const OPP_ENTITY: AffinityOpportunity = { id: 50, name: 'Deal A', person_ids: [], organization_ids: [], list_entries: [], created_at: '2023-01-01T00:00:00Z' };

const PERSON_ENTRY: AffinityListEntry = { id: 100, list_id: 1, entity_id: 1, entity_type: 0, entity: PERSON_ENTITY, creator_id: 99, created_at: '2023-01-01T00:00:00Z' };
const ORG_ENTRY: AffinityListEntry = { id: 101, list_id: 1, entity_id: 10, entity_type: 1, entity: ORG_ENTITY, creator_id: 99, created_at: '2023-01-01T00:00:00Z' };
const OPP_ENTRY: AffinityListEntry = { id: 102, list_id: 1, entity_id: 50, entity_type: 8, entity: OPP_ENTITY, creator_id: 99, created_at: '2023-01-01T00:00:00Z' };
const UNKNOWN_ENTRY: AffinityListEntry = { id: 103, list_id: 1, entity_id: 99, entity_type: 99, entity: {} as AffinityPerson, creator_id: 99, created_at: '2023-01-01T00:00:00Z' };

const MOCK_FIELD_VALUE: AffinityFieldValue = { id: 200, field_id: 5, field: { id: 5, name: 'Stage', list_id: 1, value_type: 0, allows_multiple: false, is_required: false, is_read_only: false }, entity_type: 1, entity_id: 10, list_entry_id: 101, value: 'Series A' };
const NULL_FIELD_VALUE: AffinityFieldValue = { ...MOCK_FIELD_VALUE, id: 201, field: { ...MOCK_FIELD_VALUE.field!, name: 'Notes' }, value: null };
const OBJ_FIELD_VALUE: AffinityFieldValue = { ...MOCK_FIELD_VALUE, id: 202, field: { ...MOCK_FIELD_VALUE.field!, name: 'Meta' }, value: { key: 'val' } };

afterEach(() => vi.unstubAllGlobals());

function setup(fetchResponse: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(fetchResponse), { status: 200 })
  ));
  const client = new AffinityClient('key');
  const api = new ListsApi(client);
  const { server, callTool } = makeMockServer();
  registerListTools(server, api);
  return { callTool };
}

describe('get_lists tool', () => {
  it('returns formatted list of lists', async () => {
    const { callTool } = setup([MOCK_LIST, MOCK_PRIVATE_LIST]);
    const result = await callTool('get_lists');
    const text = result.content[0].text;
    expect(text).toContain('Pipeline');
    expect(text).toContain('Organization');
    expect(text).toContain('public');
    expect(text).toContain('Contacts');
    expect(text).toContain('Person');
    expect(text).toContain('private');
    expect(text).toContain('Found 2 list');
  });

  it('shows "Type X" for unknown list types', async () => {
    const unknownType = { ...MOCK_LIST, type: 99 };
    const { callTool } = setup([unknownType]);
    const result = await callTool('get_lists');
    expect(result.content[0].text).toContain('Type 99');
  });

  it('returns a message when no lists exist', async () => {
    const { callTool } = setup([]);
    const result = await callTool('get_lists');
    expect(result.content[0].text).toContain('No lists found');
  });
});

describe('get_list_entries tool', () => {
  it('formats person entries', async () => {
    const { callTool } = setup({ list_entries: [PERSON_ENTRY], next_page_token: null });
    const result = await callTool('get_list_entries', { list_id: 1, limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('Alice Smith');
    expect(text).toContain('alice@example.com');
  });

  it('shows "(no name)" and "no email" for person entry with no name/email', async () => {
    const noNameNoEmail = { ...PERSON_ENTITY, first_name: '', last_name: '', primary_email: null, emails: [] };
    const entry = { ...PERSON_ENTRY, entity: noNameNoEmail };
    const { callTool } = setup({ list_entries: [entry], next_page_token: null });
    const result = await callTool('get_list_entries', { list_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('(no name)');
    expect(result.content[0].text).toContain('no email');
  });

  it('shows "no domain" for org entry with no domain', async () => {
    const noDomainOrg = { ...ORG_ENTITY, domain: null, domains: [] };
    const entry = { ...ORG_ENTRY, entity: noDomainOrg };
    const { callTool } = setup({ list_entries: [entry], next_page_token: null });
    const result = await callTool('get_list_entries', { list_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('no domain');
  });

  it('formats organization entries', async () => {
    const { callTool } = setup({ list_entries: [ORG_ENTRY], next_page_token: null });
    const result = await callTool('get_list_entries', { list_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('Acme');
  });

  it('formats opportunity entries', async () => {
    const { callTool } = setup({ list_entries: [OPP_ENTRY], next_page_token: null });
    const result = await callTool('get_list_entries', { list_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('Deal A');
  });

  it('formats unknown entity type entries', async () => {
    const { callTool } = setup({ list_entries: [UNKNOWN_ENTRY], next_page_token: null });
    const result = await callTool('get_list_entries', { list_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('Entity 99');
  });

  it('shows pagination token when more entries available', async () => {
    const { callTool } = setup({ list_entries: [PERSON_ENTRY], next_page_token: 'next-tok' });
    const result = await callTool('get_list_entries', { list_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('next-tok');
  });

  it('returns a message when list is empty', async () => {
    const { callTool } = setup({ list_entries: [], next_page_token: null });
    const result = await callTool('get_list_entries', { list_id: 1, limit: 25 });
    expect(result.content[0].text).toContain('No entries found');
  });
});

describe('get_field_values tool', () => {
  it('returns formatted field values', async () => {
    const { callTool } = setup([MOCK_FIELD_VALUE]);
    const result = await callTool('get_field_values', { list_entry_id: 101 });
    expect(result.content[0].text).toContain('Stage: Series A');
  });

  it('formats null field value as (empty)', async () => {
    const { callTool } = setup([NULL_FIELD_VALUE]);
    const result = await callTool('get_field_values', { list_entry_id: 101 });
    expect(result.content[0].text).toContain('(empty)');
  });

  it('formats object field value as JSON', async () => {
    const { callTool } = setup([OBJ_FIELD_VALUE]);
    const result = await callTool('get_field_values', { list_entry_id: 101 });
    expect(result.content[0].text).toContain('{"key":"val"}');
  });

  it('falls back to field ID when field name is missing', async () => {
    const noField: AffinityFieldValue = { ...MOCK_FIELD_VALUE, field: null, field_id: 42 };
    const { callTool } = setup([noField]);
    const result = await callTool('get_field_values', { list_entry_id: 101 });
    expect(result.content[0].text).toContain('Field 42');
  });

  it('returns a message when no field values exist', async () => {
    const { callTool } = setup([]);
    const result = await callTool('get_field_values', { list_entry_id: 101 });
    expect(result.content[0].text).toContain('No field values found');
  });
});
