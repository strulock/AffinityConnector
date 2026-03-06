import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpportunitiesApi } from '../../src/affinity/opportunities.js';
import { registerOpportunityTools } from '../../src/tools/opportunities.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityOpportunity } from '../../src/affinity/types.js';

afterEach(() => vi.unstubAllGlobals());

const MOCK_OPP: AffinityOpportunity = {
  id: 1,
  name: 'Acme Deal',
  person_ids: [10, 11],
  organization_ids: [20],
  list_entries: [{ id: 100, list_id: 5, created_at: '2024-01-01T00:00:00Z' }],
  created_at: '2024-01-01T00:00:00Z',
};

const MOCK_OPP_BARE: AffinityOpportunity = {
  id: 2,
  name: 'Empty Deal',
  person_ids: [],
  organization_ids: [],
  list_entries: [],
  created_at: '2024-01-01T00:00:00Z',
};

function makeApi(overrides: Partial<Record<keyof OpportunitiesApi, unknown>> = {}) {
  return {
    search: vi.fn().mockResolvedValue([MOCK_OPP]),
    getById: vi.fn().mockResolvedValue(MOCK_OPP),
    create: vi.fn().mockResolvedValue(MOCK_OPP),
    update: vi.fn().mockResolvedValue(MOCK_OPP),
    ...overrides,
  } as unknown as OpportunitiesApi;
}

function setup(apiOverrides: Partial<Record<keyof OpportunitiesApi, unknown>> = {}) {
  const api = makeApi(apiOverrides);
  const { server, callTool } = makeMockServer();
  registerOpportunityTools(server, api);
  return { callTool, api };
}

// ── search_opportunities ──────────────────────────────────────────────────

describe('search_opportunities tool', () => {
  it('returns formatted opportunity list', async () => {
    const { callTool } = setup();
    const result = await callTool('search_opportunities', {});
    const text = result.content[0].text;
    expect(text).toContain('Acme Deal');
    expect(text).toContain('opp:1');
    expect(text).toContain('2 person(s)');
    expect(text).toContain('1 org(s)');
    expect(text).toContain('1 list(s)');
  });

  it('omits zero-count fields from summary line', async () => {
    const { callTool } = setup({ search: vi.fn().mockResolvedValue([MOCK_OPP_BARE]) });
    const result = await callTool('search_opportunities', {});
    const text = result.content[0].text;
    expect(text).toContain('Empty Deal');
    expect(text).not.toContain('person(s)');
    expect(text).not.toContain('org(s)');
  });

  it('returns no-results message with term when empty', async () => {
    const { callTool } = setup({ search: vi.fn().mockResolvedValue([]) });
    const result = await callTool('search_opportunities', { term: 'Xyz' });
    expect(result.content[0].text).toContain('"Xyz"');
  });

  it('returns generic no-results message without term', async () => {
    const { callTool } = setup({ search: vi.fn().mockResolvedValue([]) });
    const result = await callTool('search_opportunities', {});
    expect(result.content[0].text).toContain('No opportunities found.');
  });
});

// ── get_opportunity ───────────────────────────────────────────────────────

describe('get_opportunity tool', () => {
  it('returns formatted opportunity detail', async () => {
    const { callTool } = setup();
    const result = await callTool('get_opportunity', { opportunity_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('Acme Deal');
    expect(text).toContain('10, 11');
    expect(text).toContain('20');
    expect(text).toContain('list 5');
  });

  it('returns not-found message when getById returns null', async () => {
    const { callTool } = setup({ getById: vi.fn().mockResolvedValue(null) });
    const result = await callTool('get_opportunity', { opportunity_id: 999 });
    expect(result.content[0].text).toContain('not found');
  });

  it('shows "none" for empty associations', async () => {
    const { callTool } = setup({ getById: vi.fn().mockResolvedValue(MOCK_OPP_BARE) });
    const result = await callTool('get_opportunity', { opportunity_id: 2 });
    const text = result.content[0].text;
    expect(text).toContain('People: none');
    expect(text).toContain('Organizations: none');
    expect(text).toContain('Lists: none');
  });
});

// ── create_opportunity ────────────────────────────────────────────────────

describe('create_opportunity tool', () => {
  it('returns confirmation with new opportunity ID', async () => {
    const { callTool, api } = setup();
    const result = await callTool('create_opportunity', { name: 'Acme Deal' });
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme Deal' }));
    expect(result.content[0].text).toContain('id:1');
    expect(result.content[0].text).toContain('Acme Deal');
  });

  it('passes person_ids and organization_ids when provided', async () => {
    const { callTool, api } = setup();
    await callTool('create_opportunity', { name: 'Deal', person_ids: [10], organization_ids: [20] });
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ person_ids: [10], organization_ids: [20] })
    );
  });
});

// ── update_opportunity ────────────────────────────────────────────────────

describe('update_opportunity tool', () => {
  it('returns confirmation with updated opportunity ID', async () => {
    const { callTool, api } = setup();
    const result = await callTool('update_opportunity', { opportunity_id: 1, name: 'New Name' });
    expect(api.update).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'New Name' }));
    expect(result.content[0].text).toContain('id:1');
  });

  it('returns validation error when no update fields provided', async () => {
    const { callTool } = setup();
    const result = await callTool('update_opportunity', { opportunity_id: 1 });
    expect(result.content[0].text).toContain('at least one of');
  });
});
