import { describe, it, expect, vi } from 'vitest';
import { SemanticSearchApi } from '../../src/affinity/semantic_search.js';
import { registerSemanticSearchTools } from '../../src/tools/semantic_search.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinitySemanticResult } from '../../src/affinity/types.js';

const MOCK_RESULT: AffinitySemanticResult = {
  id: 1, name: 'Acme Corp', domain: 'acme.com', domains: ['acme.com'],
  person_ids: [10], created_at: '2024-01-01T00:00:00Z',
};

function setup(searchResult: ReturnType<SemanticSearchApi['search']>) {
  const mockApi = { search: vi.fn().mockResolvedValue(searchResult) } as unknown as SemanticSearchApi;
  const { server, callTool } = makeMockServer();
  registerSemanticSearchTools(server, mockApi);
  return { callTool };
}

describe('semantic_search tool', () => {
  it('returns formatted results', async () => {
    const { callTool } = setup(Promise.resolve({ results: [MOCK_RESULT], nextPageToken: undefined }));
    const result = await callTool('semantic_search', { query: 'fintech', limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('[org:1]');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('acme.com');
    expect(text).toContain('1 result');
    expect(text).toContain('"fintech"');
  });

  it('shows pagination token when available', async () => {
    const { callTool } = setup(Promise.resolve({ results: [MOCK_RESULT], nextPageToken: 'tok-s' }));
    const result = await callTool('semantic_search', { query: 'startup', limit: 25 });
    expect(result.content[0].text).toContain('tok-s');
  });

  it('returns message when no results found', async () => {
    const { callTool } = setup(Promise.resolve({ results: [], nextPageToken: undefined }));
    const result = await callTool('semantic_search', { query: 'nothing', limit: 25 });
    expect(result.content[0].text).toContain('No results found');
  });

  it('uses domains[0] as fallback when domain is null', async () => {
    const fallback = { ...MOCK_RESULT, domain: null, domains: ['fallback.io'] };
    const { callTool } = setup(Promise.resolve({ results: [fallback], nextPageToken: undefined }));
    const result = await callTool('semantic_search', { query: 'test', limit: 25 });
    expect(result.content[0].text).toContain('fallback.io');
  });

  it('shows "no domain" when both domain and domains are absent', async () => {
    const noDomain = { ...MOCK_RESULT, domain: null, domains: [] };
    const { callTool } = setup(Promise.resolve({ results: [noDomain], nextPageToken: undefined }));
    const result = await callTool('semantic_search', { query: 'test', limit: 25 });
    expect(result.content[0].text).toContain('no domain');
  });
});
