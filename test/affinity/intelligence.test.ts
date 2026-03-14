import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { IntelligenceApi } from '../../src/affinity/intelligence.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityRelationshipStrength } from '../../src/affinity/types.js';

// v1 /relationships-strengths returns an array of { internal_id, external_id, strength }
// where strength is a 0–1 float. The API maps this to 0–100 int with last_activity_date: null.
const MOCK_V1_STRENGTH = [{ internal_id: 99, external_id: 1, strength: 0.75 }];
const EXPECTED_STRENGTH: AffinityRelationshipStrength = {
  entity_id: 1,
  entity_type: 0,
  strength: 75,
  last_activity_date: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('IntelligenceApi.getRelationshipStrength', () => {
  it('returns relationship strength from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_V1_STRENGTH), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new IntelligenceApi(client);
    const result = await api.getRelationshipStrength(1, 0, 99);
    expect(result).toEqual(EXPECTED_STRENGTH);
  });

  it('requests with external_id and internal_id params on the v1 base URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_V1_STRENGTH), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new IntelligenceApi(client);
    await api.getRelationshipStrength(42, 1, 99);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).not.toContain('/v2/');
    expect(url).toContain('external_id=42');
    expect(url).toContain('internal_id=99');
  });

  it('serves the result from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_V1_STRENGTH), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new IntelligenceApi(client);
    await api.getRelationshipStrength(1, 0, 99);
    await api.getRelationshipStrength(1, 0, 99);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes separate cache entries for different entities', async () => {
    const v1Strength2 = [{ internal_id: 99, external_id: 2, strength: 0.30 }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_V1_STRENGTH), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(v1Strength2), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new IntelligenceApi(client);
    const r1 = await api.getRelationshipStrength(1, 0, 99);
    const r2 = await api.getRelationshipStrength(2, 0, 99);
    expect(r1.strength).toBe(75);
    expect(r2.strength).toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
