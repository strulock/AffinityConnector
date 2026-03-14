import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { UtilityApi } from '../../src/affinity/utility.js';
import type { AffinityCurrentUser, AffinityRateLimit } from '../../src/affinity/types.js';

const MOCK_USER: AffinityCurrentUser = {
  id: 1, first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com',
  organization_id: 42, organization_name: 'Example Corp',
};

// Raw v2 /auth/whoami response shape (camelCase fields, nested objects)
const MOCK_WHOAMI_RAW = {
  user: { id: 1, firstName: 'Jane', lastName: 'Doe', emailAddress: 'jane@example.com' },
  tenant: { id: 42, name: 'Example Corp' },
};

const MOCK_RATE_LIMIT: AffinityRateLimit = {
  limit: 900, remaining: 750, reset_in: 30,
};

// Raw v1 /rate-limit response shape (nested under rate.api_key_per_minute)
const MOCK_RATE_LIMIT_RAW = {
  rate: {
    api_key_per_minute: { limit: 900, remaining: 750, reset: 30 },
    org_monthly: { limit: 40000, remaining: 39993, reset: 2124845 },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('UtilityApi.getCurrentUser', () => {
  it('returns current user from v2 API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_WHOAMI_RAW), { status: 200 }))
    ));
    const api = new UtilityApi(new AffinityClient('key'));
    const result = await api.getCurrentUser();
    expect(result).toEqual(MOCK_USER);
  });

  it('uses v2 URL and /auth/whoami path', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_WHOAMI_RAW), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new UtilityApi(new AffinityClient('key'));
    await api.getCurrentUser();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/v2/');
    expect(url).toContain('/auth/whoami');
  });
});

describe('UtilityApi.getRateLimit', () => {
  it('returns rate limit data from v1 API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_RATE_LIMIT_RAW), { status: 200 }))
    ));
    const api = new UtilityApi(new AffinityClient('key'));
    const result = await api.getRateLimit();
    expect(result).toEqual(MOCK_RATE_LIMIT);
  });

  it('uses v1 URL and /rate-limit path', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_RATE_LIMIT_RAW), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new UtilityApi(new AffinityClient('key'));
    await api.getRateLimit();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('/v2/');
    expect(url).toContain('/rate-limit');
  });

  it('falls back to org_monthly when api_key_per_minute is missing', async () => {
    const raw = { rate: { org_monthly: { limit: 40000, remaining: 39993, reset: 2124845 } } };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(raw), { status: 200 }))
    ));
    const api = new UtilityApi(new AffinityClient('key'));
    const result = await api.getRateLimit();
    expect(result.limit).toBe(40000);
    expect(result.remaining).toBe(39993);
    expect(result.reset_in).toBe(2124845);
  });
});
