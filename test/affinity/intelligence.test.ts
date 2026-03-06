import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { IntelligenceApi } from '../../src/affinity/intelligence.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityRelationshipStrength } from '../../src/affinity/types.js';

const MOCK_STRENGTH: AffinityRelationshipStrength = {
  entity_id: 1,
  entity_type: 0,
  strength: 75,
  last_activity_date: '2024-01-20',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('IntelligenceApi.getRelationshipStrength', () => {
  it('returns relationship strength from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_STRENGTH), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new IntelligenceApi(client);
    const result = await api.getRelationshipStrength(1, 0);
    expect(result).toEqual(MOCK_STRENGTH);
  });

  it('requests with correct entity_id and entity_type params', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_STRENGTH), { status: 200 })
    ));
    const client = new AffinityClient('key');
    const api = new IntelligenceApi(client);
    await api.getRelationshipStrength(42, 1);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('entity_id=42');
    expect(url).toContain('entity_type=1');
  });

  it('serves the result from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_STRENGTH), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new IntelligenceApi(client);
    await api.getRelationshipStrength(1, 0);
    await api.getRelationshipStrength(1, 0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes separate cache entries for different entities', async () => {
    const strength2: AffinityRelationshipStrength = { ...MOCK_STRENGTH, entity_id: 2, strength: 30 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_STRENGTH), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(strength2), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AffinityClient('key', { cache: makeKVMock() });
    const api = new IntelligenceApi(client);
    const r1 = await api.getRelationshipStrength(1, 0);
    const r2 = await api.getRelationshipStrength(2, 0);
    expect(r1.strength).toBe(75);
    expect(r2.strength).toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
