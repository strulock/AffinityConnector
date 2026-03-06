import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { ListsApi } from '../../src/affinity/lists.js';
import { registerListTools } from '../../src/tools/lists.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityList, AffinityListEntry, AffinityFieldValue, AffinityPerson, AffinityOrganization, AffinityOpportunity, AffinitySavedView } from '../../src/affinity/types.js';

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

const BASE_MOCK_API = () => ({
  getLists: vi.fn(),
  getListEntries: vi.fn(),
  getFieldValues: vi.fn(),
  setFieldValue: vi.fn(),
  deleteFieldValue: vi.fn(),
  batchSetFieldValues: vi.fn(),
  addListEntry: vi.fn(),
  removeListEntry: vi.fn(),
  getSavedViews: vi.fn(),
  getSavedViewEntries: vi.fn(),
});

describe('set_field_value tool', () => {
  const CREATED_VALUE = { id: 300, field_id: 5, entity_type: 1, entity_id: 10, list_entry_id: 101, value: 'Series B' };

  it('returns Created confirmation when creating a new value', async () => {
    const mockApi = { ...BASE_MOCK_API(), setFieldValue: vi.fn().mockResolvedValue(CREATED_VALUE) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('set_field_value', { field_id: 5, value: 'Series B', list_entry_id: 101, entity_id: 10, entity_type: 1 });
    expect(mockApi.setFieldValue).toHaveBeenCalledWith(expect.objectContaining({ field_id: 5, value: 'Series B', list_entry_id: 101, entity_id: 10, entity_type: 1 }));
    expect(result.content[0].text).toContain('Created');
    expect(result.content[0].text).toContain('300');
  });

  it('returns Updated confirmation when field_value_id is provided', async () => {
    const mockApi = { ...BASE_MOCK_API(), setFieldValue: vi.fn().mockResolvedValue({ ...CREATED_VALUE, id: 200 }) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('set_field_value', { field_id: 5, value: 'Series B', field_value_id: 200 });
    expect(mockApi.setFieldValue).toHaveBeenCalledWith(expect.objectContaining({ field_value_id: 200, value: 'Series B' }));
    expect(result.content[0].text).toContain('Updated');
    expect(result.content[0].text).toContain('200');
  });

  it('returns validation error when creating without required params', async () => {
    const { callTool } = setup([]);
    const result = await callTool('set_field_value', { field_id: 5, value: 'x' });
    expect(result.content[0].text).toContain('list_entry_id, entity_id, and entity_type are required');
  });
});

describe('delete_field_value tool', () => {
  it('returns success message after deletion', async () => {
    const mockApi = { ...BASE_MOCK_API(), deleteFieldValue: vi.fn().mockResolvedValue(undefined) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('delete_field_value', { field_value_id: 200 });
    expect(mockApi.deleteFieldValue).toHaveBeenCalledWith(200);
    expect(result.content[0].text).toContain('200');
    expect(result.content[0].text).toContain('deleted successfully');
  });
});

const MOCK_SAVED_VIEW: AffinitySavedView = {
  id: 10, list_id: 1, name: 'My View', creator_id: 99, is_public: true,
};

describe('add_to_list tool', () => {
  it('returns success with the new list entry ID', async () => {
    const newEntry = { ...PERSON_ENTRY, id: 999 };
    const mockApi = { ...BASE_MOCK_API(), addListEntry: vi.fn().mockResolvedValue(newEntry) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('add_to_list', { list_id: 1, entity_id: 1, entity_type: 0 });
    expect(mockApi.addListEntry).toHaveBeenCalledWith(1, 1, 0);
    expect(result.content[0].text).toContain('999');
    expect(result.content[0].text).toContain('list 1');
  });
});

describe('remove_from_list tool', () => {
  it('returns success message after removal', async () => {
    const mockApi = { ...BASE_MOCK_API(), removeListEntry: vi.fn().mockResolvedValue(undefined) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('remove_from_list', { list_id: 1, list_entry_id: 100 });
    expect(mockApi.removeListEntry).toHaveBeenCalledWith(1, 100);
    expect(result.content[0].text).toContain('100');
    expect(result.content[0].text).toContain('list 1');
  });
});

describe('get_saved_views tool', () => {
  it('returns formatted saved views', async () => {
    const mockApi = { ...BASE_MOCK_API(), getSavedViews: vi.fn().mockResolvedValue([MOCK_SAVED_VIEW]) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('get_saved_views', { list_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('My View');
    expect(text).toContain('[view:10]');
    expect(text).toContain('public');
    expect(text).toContain('1 saved view');
  });

  it('returns a message when no saved views exist', async () => {
    const mockApi = { ...BASE_MOCK_API(), getSavedViews: vi.fn().mockResolvedValue([]) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('get_saved_views', { list_id: 1 });
    expect(result.content[0].text).toContain('No saved views found');
  });

  it('labels private views correctly', async () => {
    const privateView = { ...MOCK_SAVED_VIEW, is_public: false };
    const mockApi = { ...BASE_MOCK_API(), getSavedViews: vi.fn().mockResolvedValue([privateView]) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('get_saved_views', { list_id: 1 });
    expect(result.content[0].text).toContain('private');
  });
});

describe('get_saved_view_entries tool', () => {
  it('returns formatted entries', async () => {
    const mockApi = { ...BASE_MOCK_API(), getSavedViewEntries: vi.fn().mockResolvedValue({ entries: [PERSON_ENTRY], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('get_saved_view_entries', { list_id: 1, view_id: 10, limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('Alice Smith');
    expect(text).toContain('view 10');
    expect(text).toContain('list 1');
  });

  it('shows pagination token when more entries available', async () => {
    const mockApi = { ...BASE_MOCK_API(), getSavedViewEntries: vi.fn().mockResolvedValue({ entries: [PERSON_ENTRY], nextPageToken: 'tok-abc' }) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('get_saved_view_entries', { list_id: 1, view_id: 10, limit: 25 });
    expect(result.content[0].text).toContain('tok-abc');
  });

  it('returns a message when no entries exist', async () => {
    const mockApi = { ...BASE_MOCK_API(), getSavedViewEntries: vi.fn().mockResolvedValue({ entries: [], nextPageToken: undefined }) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('get_saved_view_entries', { list_id: 1, view_id: 10, limit: 25 });
    expect(result.content[0].text).toContain('No entries found');
  });
});

describe('batch_set_field_values tool', () => {
  it('returns success message with updated field count', async () => {
    const updatedFields = [
      { id: 301, field_id: 5, entity_type: 1, entity_id: 10, list_entry_id: 101, value: 'Series B' },
      { id: 302, field_id: 6, entity_type: 1, entity_id: 10, list_entry_id: 101, value: '2024-01-01' },
    ];
    const mockApi = { ...BASE_MOCK_API(), batchSetFieldValues: vi.fn().mockResolvedValue(updatedFields) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    const result = await callTool('batch_set_field_values', {
      list_id: 1,
      list_entry_id: 101,
      fields: [{ field_id: 5, value: 'Series B' }, { field_id: 6, value: '2024-01-01' }],
    });
    const text = result.content[0].text;
    expect(text).toContain('2 field value');
    expect(text).toContain('101');
    expect(text).toContain('list 1');
  });

  it('passes correct args to batchSetFieldValues', async () => {
    const mockApi = { ...BASE_MOCK_API(), batchSetFieldValues: vi.fn().mockResolvedValue([]) };
    const { server, callTool } = makeMockServer();
    registerListTools(server, mockApi);
    await callTool('batch_set_field_values', {
      list_id: 2,
      list_entry_id: 200,
      fields: [{ field_id: 7, value: 42 }],
    });
    expect(mockApi.batchSetFieldValues).toHaveBeenCalledWith(2, 200, [{ field_id: 7, value: 42 }]);
  });
});
