import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { SemanticSearchApi } from '../../src/affinity/semantic_search.js';
import type { AffinitySemanticResult } from '../../src/affinity/types.js';

const MOCK_RESULT: AffinitySemanticResult = {
  id: 1, name: 'Acme Corp', domain: 'acme.com', domains: ['acme.com'],
  person_ids: [10], created_at: '2024-01-01T00:00:00Z',
};

afterEach(() => vi.unstubAllGlobals());

function mockV2Post<T>(data: T[], next_page_token: string | null = null) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ data, next_page_token }), { status: 200 }))
  ));
}

describe('SemanticSearchApi.search', () => {
  it('returns results from v2 API', async () => {
    mockV2Post([MOCK_RESULT]);
    const api = new SemanticSearchApi(new AffinityClient('key'));
    const result = await api.search('fintech companies');
    expect(result.results).toEqual([MOCK_RESULT]);
    expect(result.nextPageToken).toBeUndefined();
  });

  it('returns nextPageToken when present', async () => {
    mockV2Post([MOCK_RESULT], 'tok-next');
    const api = new SemanticSearchApi(new AffinityClient('key'));
    const result = await api.search('fintech');
    expect(result.nextPageToken).toBe('tok-next');
  });

  it('returns empty array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    ));
    const api = new SemanticSearchApi(new AffinityClient('key'));
    expect((await api.search('test')).results).toEqual([]);
  });

  it('POSTs to /v2/search with entity_types and query', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new SemanticSearchApi(new AffinityClient('key'));
    await api.search('Series B startup');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v2/');
    expect(url).toContain('/search');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.query).toBe('Series B startup');
    expect(body.entity_types).toContain('company');
  });
});
