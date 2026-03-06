import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { FieldsApi } from '../../src/affinity/fields.js';
import { registerFieldTools } from '../../src/tools/fields.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityField, AffinityFieldValueChange } from '../../src/affinity/types.js';

afterEach(() => vi.unstubAllGlobals());

const MOCK_FIELD: AffinityField = {
  id: 5,
  name: 'Stage',
  list_id: 1,
  value_type: 6,
  allows_multiple: false,
  is_required: true,
  is_read_only: false,
};

const MOCK_GLOBAL_FIELD: AffinityField = {
  id: 7,
  name: 'LinkedIn',
  list_id: null,
  value_type: 0,
  allows_multiple: false,
  is_required: false,
  is_read_only: false,
};

const MOCK_MULTI_FIELD: AffinityField = {
  id: 8,
  name: 'Tags',
  list_id: 1,
  value_type: 6,
  allows_multiple: true,
  is_required: false,
  is_read_only: false,
};

const MOCK_READONLY_FIELD: AffinityField = {
  id: 9,
  name: 'Auto Score',
  list_id: 1,
  value_type: 1,
  allows_multiple: false,
  is_required: false,
  is_read_only: true,
};

const MOCK_CHANGE: AffinityFieldValueChange = {
  id: 100,
  field_id: 5,
  entity_id: 10,
  entity_type: 1,
  list_entry_id: 50,
  value: 'Series A',
  changed_by_id: 99,
  changed_at: '2024-01-15T00:00:00Z',
};

function setup(fetchResponse: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(fetchResponse), { status: 200 }))
  );
  const client = new AffinityClient('key');
  const api = new FieldsApi(client);
  const { server, callTool } = makeMockServer();
  registerFieldTools(server, api);
  return { callTool };
}

// ── get_field_definitions ──────────────────────────────────────────────────

describe('get_field_definitions tool', () => {
  it('returns formatted list of fields for scope=all', async () => {
    const { callTool } = setup([MOCK_FIELD, MOCK_GLOBAL_FIELD]);
    const result = await callTool('get_field_definitions', { scope: 'all' });
    const text = result.content[0].text;
    expect(text).toContain('Stage');
    expect(text).toContain('Dropdown');
    expect(text).toContain('list 1');
    expect(text).toContain('LinkedIn');
    expect(text).toContain('global');
    expect(text).toContain('2 field definition');
  });

  it('shows required flag', async () => {
    const { callTool } = setup([MOCK_FIELD]);
    const result = await callTool('get_field_definitions', { scope: 'all' });
    expect(result.content[0].text).toContain('required');
  });

  it('shows multi-value flag', async () => {
    const { callTool } = setup([MOCK_MULTI_FIELD]);
    const result = await callTool('get_field_definitions', { scope: 'all' });
    expect(result.content[0].text).toContain('multi-value');
  });

  it('shows read-only flag', async () => {
    const { callTool } = setup([MOCK_READONLY_FIELD]);
    const result = await callTool('get_field_definitions', { scope: 'all' });
    expect(result.content[0].text).toContain('read-only');
  });

  it('shows fallback type label for unknown value_type', async () => {
    const unknownType = { ...MOCK_FIELD, value_type: 99 };
    const { callTool } = setup([unknownType]);
    const result = await callTool('get_field_definitions', { scope: 'all' });
    expect(result.content[0].text).toContain('Type 99');
  });

  it('returns "No field definitions found" when empty', async () => {
    const { callTool } = setup([]);
    const result = await callTool('get_field_definitions', { scope: 'all' });
    expect(result.content[0].text).toContain('No field definitions found');
  });

  it('returns error when scope=list but list_id is missing', async () => {
    const { callTool } = setup([]);
    const result = await callTool('get_field_definitions', { scope: 'list' });
    expect(result.content[0].text).toContain('list_id is required');
  });

  it('calls getPersonFields for scope=person', async () => {
    const mockApi = {
      getPersonFields: vi.fn().mockResolvedValue([MOCK_GLOBAL_FIELD]),
      getOrganizationFields: vi.fn(),
      getFields: vi.fn(),
      getFieldValueChanges: vi.fn(),
    } as unknown as FieldsApi;
    const { server, callTool } = makeMockServer();
    registerFieldTools(server, mockApi);
    const result = await callTool('get_field_definitions', { scope: 'person' });
    expect(mockApi.getPersonFields).toHaveBeenCalled();
    expect(result.content[0].text).toContain('global person');
  });

  it('calls getOrganizationFields for scope=organization', async () => {
    const mockApi = {
      getPersonFields: vi.fn(),
      getOrganizationFields: vi.fn().mockResolvedValue([MOCK_GLOBAL_FIELD]),
      getFields: vi.fn(),
      getFieldValueChanges: vi.fn(),
    } as unknown as FieldsApi;
    const { server, callTool } = makeMockServer();
    registerFieldTools(server, mockApi);
    const result = await callTool('get_field_definitions', { scope: 'organization' });
    expect(mockApi.getOrganizationFields).toHaveBeenCalled();
    expect(result.content[0].text).toContain('global organization');
  });

  it('calls getFields with list_id for scope=list', async () => {
    const mockApi = {
      getPersonFields: vi.fn(),
      getOrganizationFields: vi.fn(),
      getFields: vi.fn().mockResolvedValue([MOCK_FIELD]),
      getFieldValueChanges: vi.fn(),
    } as unknown as FieldsApi;
    const { server, callTool } = makeMockServer();
    registerFieldTools(server, mockApi);
    const result = await callTool('get_field_definitions', { scope: 'list', list_id: 1 });
    expect(mockApi.getFields).toHaveBeenCalledWith(1);
    expect(result.content[0].text).toContain('list 1');
  });

  it('labels all known value_type codes correctly', async () => {
    const typeTests: [number, string][] = [
      [0, 'Text'], [1, 'Number'], [2, 'Date'], [3, 'Location'],
      [4, 'Person'], [5, 'Organization'], [6, 'Dropdown'],
    ];
    for (const [value_type, label] of typeTests) {
      const { callTool } = setup([{ ...MOCK_FIELD, value_type }]);
      const result = await callTool('get_field_definitions', { scope: 'all' });
      expect(result.content[0].text).toContain(label);
    }
  });
});

// ── get_field_value_changes ────────────────────────────────────────────────

describe('get_field_value_changes tool', () => {
  it('returns formatted list of changes', async () => {
    const { callTool } = setup([MOCK_CHANGE]);
    const result = await callTool('get_field_value_changes', { field_id: 5 });
    const text = result.content[0].text;
    expect(text).toContain('Series A');
    expect(text).toContain('list entry 50');
    expect(text).toContain('user 99');
    expect(text).toContain('1 change');
  });

  it('shows entity target when no list_entry_id', async () => {
    const noEntry = { ...MOCK_CHANGE, list_entry_id: null };
    const { callTool } = setup([noEntry]);
    const result = await callTool('get_field_value_changes', { field_id: 5 });
    expect(result.content[0].text).toContain('entity 10');
  });

  it('shows "unknown" target when both entity_id and list_entry_id are null', async () => {
    const noTarget = { ...MOCK_CHANGE, entity_id: null, list_entry_id: null };
    const { callTool } = setup([noTarget]);
    const result = await callTool('get_field_value_changes', { field_id: 5 });
    expect(result.content[0].text).toContain('unknown');
  });

  it('formats null value as (cleared)', async () => {
    const cleared = { ...MOCK_CHANGE, value: null };
    const { callTool } = setup([cleared]);
    const result = await callTool('get_field_value_changes', { field_id: 5 });
    expect(result.content[0].text).toContain('(cleared)');
  });

  it('formats object value as JSON', async () => {
    const objChange = { ...MOCK_CHANGE, value: { key: 'val' } };
    const { callTool } = setup([objChange]);
    const result = await callTool('get_field_value_changes', { field_id: 5 });
    expect(result.content[0].text).toContain('{"key":"val"}');
  });

  it('returns message when no changes found', async () => {
    const { callTool } = setup([]);
    const result = await callTool('get_field_value_changes', { field_id: 5 });
    expect(result.content[0].text).toContain('No value changes found for field 5');
  });
});
