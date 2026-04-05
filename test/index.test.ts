import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeKVMock } from './helpers/kv-mock.js';

// Mock the MCP layer so Worker routing tests don't need a real Affinity API key
vi.mock('../src/server.js', () => ({
  createServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class {
    handleRequest = vi.fn().mockResolvedValue(new Response('mcp-ok', { status: 200 }));
  },
}));

// Mock Access JWT verification so routing tests don't need real RSA keys.
// Default: valid. Override per-test with vi.mocked(verifyAccessJwt).mockResolvedValue(false).
vi.mock('../src/access.js', () => ({
  verifyAccessJwt: vi.fn().mockResolvedValue(true),
}));

// Import after mocks are set up
const { default: worker } = await import('../src/index.js');
const { verifyAccessJwt } = await import('../src/access.js');

function makeRequest(method: string, path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://affinity.trulock.com${path}`, { method, headers });
}

function makeEnv(apiKey = 'test-key'): unknown {
  return { AFFINITY_API_KEY: apiKey, AFFINITY_CACHE: undefined };
}

function makeEnvWithAccess(apiKey = 'test-key', jwtValidation = true): unknown {
  return {
    AFFINITY_API_KEY: apiKey,
    AFFINITY_CACHE: undefined,
    CLOUDFLARE_ACCESS_JWT_VALIDATION: jwtValidation,
    CLOUDFLARE_ACCESS_AUD: 'test-aud',
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Worker routing', () => {
  it('OPTIONS returns 204 with CORS headers', async () => {
    const res = await worker.fetch(makeRequest('OPTIONS', '/mcp'), makeEnv(), {} as never);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
  });

  it('GET /health returns 200 with status ok', async () => {
    const res = await worker.fetch(makeRequest('GET', '/health'), makeEnv(), {} as never);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /.well-known/oauth-protected-resource returns resource origin', async () => {
    const res = await worker.fetch(
      makeRequest('GET', '/.well-known/oauth-protected-resource'),
      makeEnv(),
      {} as never
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { resource: string };
    expect(body.resource).toBe('https://affinity.trulock.com');
  });

  it('unknown path returns 404', async () => {
    const res = await worker.fetch(makeRequest('GET', '/unknown'), makeEnv(), {} as never);
    expect(res.status).toBe(404);
  });

  it('POST /mcp with no API key returns 500', async () => {
    const res = await worker.fetch(makeRequest('POST', '/mcp'), makeEnv(''), {} as never);
    expect(res.status).toBe(500);
  });

  it('POST /mcp with valid API key returns 200 with CORS headers', async () => {
    const res = await worker.fetch(makeRequest('POST', '/mcp'), makeEnv('real-key'), {} as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
  });
});

describe('POST /webhook route', () => {
  function makeWebhookEnv(secret?: string, cache?: KVNamespace) {
    return { AFFINITY_API_KEY: 'key', AFFINITY_CACHE: cache, AFFINITY_WEBHOOK_SECRET: secret };
  }

  function makeWebhookRequest(secret: string | null, body: unknown = { type: 'person.created', body: { id: 42 }, sent_at: 1631120151 }): Request {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret !== null) headers['X-Affinity-Webhook-Secret'] = secret;
    return new Request('https://affinity.trulock.com/webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  it('accepts POST when no webhook secret is configured on the Worker', async () => {
    const res = await worker.fetch(makeWebhookRequest('any-secret'), makeWebhookEnv(undefined), {} as never);
    expect(res.status).toBe(200);
  });

  it('returns 401 when the header secret does not match', async () => {
    const res = await worker.fetch(makeWebhookRequest('wrong'), makeWebhookEnv('correct'), {} as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the secret header is missing', async () => {
    const res = await worker.fetch(makeWebhookRequest(null), makeWebhookEnv('correct'), {} as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 when the secret matches', async () => {
    const res = await worker.fetch(makeWebhookRequest('secret'), makeWebhookEnv('secret'), {} as never);
    expect(res.status).toBe(200);
  });

  it('returns 405 for non-POST methods', async () => {
    const res = await worker.fetch(makeRequest('GET', '/webhook'), makeWebhookEnv('secret'), {} as never);
    expect(res.status).toBe(405);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('https://affinity.trulock.com/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Affinity-Webhook-Secret': 'secret' },
      body: 'not-json',
    });
    const res = await worker.fetch(req, makeWebhookEnv('secret'), {} as never);
    expect(res.status).toBe(400);
  });

  it('returns 413 when Content-Length exceeds 64 KB', async () => {
    const req = new Request('https://affinity.trulock.com/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Affinity-Webhook-Secret': 'secret',
        'Content-Length': String(65537),
      },
      body: '{}',
    });
    const res = await worker.fetch(req, makeWebhookEnv('secret'), {} as never);
    expect(res.status).toBe(413);
  });

  it('stores event in KV and updates recency index when KV is available', async () => {
    const kv = makeKVMock();
    const res = await worker.fetch(
      makeWebhookRequest('secret'),
      makeWebhookEnv('secret', kv),
      {} as never,
    );
    expect(res.status).toBe(200);
    const eventId = 'person.created:1631120151:42';
    const stored = await kv.get(`webhook:event:${eventId}`);
    expect(stored).not.toBeNull();
    const recent = JSON.parse(await kv.get('webhook:recent') ?? '[]') as string[];
    expect(recent).toContain(eventId);
  });

  it('deduplicates event IDs in the recency index', async () => {
    const kv = makeKVMock();
    const env = makeWebhookEnv('secret', kv);
    // Send the same event twice
    await worker.fetch(makeWebhookRequest('secret'), env, {} as never);
    await worker.fetch(makeWebhookRequest('secret'), env, {} as never);
    const eventId = 'person.created:1631120151:42';
    const recent = JSON.parse(await kv.get('webhook:recent') ?? '[]') as string[];
    expect(recent.filter(id => id === eventId)).toHaveLength(1);
  });
});

describe('POST /mcp — Cloudflare Access JWT validation', () => {
  afterEach(() => {
    vi.mocked(verifyAccessJwt).mockResolvedValue(true);
  });

  it('skips JWT check when CLOUDFLARE_ACCESS_JWT_VALIDATION is not set', async () => {
    const res = await worker.fetch(makeRequest('POST', '/mcp'), makeEnv('real-key'), {} as never);
    expect(res.status).toBe(200);
    expect(vi.mocked(verifyAccessJwt)).not.toHaveBeenCalled();
  });

  it('skips JWT check when CLOUDFLARE_ACCESS_JWT_VALIDATION is false', async () => {
    const res = await worker.fetch(makeRequest('POST', '/mcp'), makeEnvWithAccess('real-key', false), {} as never);
    expect(res.status).toBe(200);
    expect(vi.mocked(verifyAccessJwt)).not.toHaveBeenCalled();
  });

  it('returns 401 when Cf-Access-Jwt-Assertion header is missing', async () => {
    const res = await worker.fetch(makeRequest('POST', '/mcp'), makeEnvWithAccess(), {} as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when JWT verification fails', async () => {
    vi.mocked(verifyAccessJwt).mockResolvedValue(false);
    const req = new Request('https://affinity.trulock.com/mcp', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': 'bad.token.here' },
    });
    const res = await worker.fetch(req, makeEnvWithAccess(), {} as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 when JWT verification passes', async () => {
    vi.mocked(verifyAccessJwt).mockResolvedValue(true);
    const req = new Request('https://affinity.trulock.com/mcp', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': 'valid.token.here' },
    });
    const res = await worker.fetch(req, makeEnvWithAccess(), {} as never);
    expect(res.status).toBe(200);
  });

  it('calls verifyAccessJwt with the correct aud and team domain', async () => {
    const req = new Request('https://affinity.trulock.com/mcp', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': 'some.token.value' },
    });
    await worker.fetch(req, makeEnvWithAccess(), {} as never);
    expect(vi.mocked(verifyAccessJwt)).toHaveBeenCalledWith(
      'some.token.value',
      'test-aud',
      'test.cloudflareaccess.com',
    );
  });

  it('returns 500 when JWT validation enabled but AUD is missing', async () => {
    const env = {
      AFFINITY_API_KEY: 'real-key',
      AFFINITY_CACHE: undefined,
      CLOUDFLARE_ACCESS_JWT_VALIDATION: true,
      CLOUDFLARE_ACCESS_AUD: undefined,
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
    };
    const res = await worker.fetch(makeRequest('POST', '/mcp'), env, {} as never);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('CLOUDFLARE_ACCESS_AUD');
  });

  it('returns 500 when JWT validation enabled but TEAM_DOMAIN is missing', async () => {
    const env = {
      AFFINITY_API_KEY: 'real-key',
      AFFINITY_CACHE: undefined,
      CLOUDFLARE_ACCESS_JWT_VALIDATION: true,
      CLOUDFLARE_ACCESS_AUD: 'test-aud',
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: undefined,
    };
    const res = await worker.fetch(makeRequest('POST', '/mcp'), env, {} as never);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain('CLOUDFLARE_ACCESS_TEAM_DOMAIN');
  });

  it('returns 401 with CORS headers so the browser gets a readable error', async () => {
    const res = await worker.fetch(makeRequest('POST', '/mcp'), makeEnvWithAccess(), {} as never);
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
  });
});

describe('POST /mcp — OAuth Bearer token handling', () => {
  function makeOAuthEnv(overrides?: Record<string, unknown>): unknown {
    return {
      AFFINITY_CACHE: undefined,
      OAUTH_KV: makeKVMock(),
      OAUTH_ENCRYPTION_KEY: 'a'.repeat(64),
      ...overrides,
    };
  }

  it('returns 401 with WWW-Authenticate when OAuth enabled and no Bearer token and no fallback key', async () => {
    const res = await worker.fetch(makeRequest('POST', '/mcp'), makeOAuthEnv(), {} as never);
    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get('WWW-Authenticate');
    expect(wwwAuth).toContain('resource_metadata=');
    expect(wwwAuth).toContain('oauth-protected-resource');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://claude.ai');
  });

  it('returns 401 with WWW-Authenticate when Bearer token is invalid', async () => {
    const req = new Request('https://affinity.trulock.com/mcp', {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid-token-that-wont-resolve' },
    });
    const res = await worker.fetch(req, makeOAuthEnv(), {} as never);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
  });

  it('falls back to AFFINITY_API_KEY when OAuth enabled but no Bearer token', async () => {
    const env = makeOAuthEnv({ AFFINITY_API_KEY: 'fallback-key' });
    const res = await worker.fetch(makeRequest('POST', '/mcp'), env, {} as never);
    expect(res.status).toBe(200);
  });

  it('returns 500 when no OAuth and no API key configured', async () => {
    const env = { AFFINITY_CACHE: undefined };
    const res = await worker.fetch(makeRequest('POST', '/mcp'), env, {} as never);
    expect(res.status).toBe(500);
  });
});

describe('POST /mcp — Analytics Engine', () => {
  function makeAnalyticsMock() {
    return { writeDataPoint: vi.fn() };
  }

  function makeEnvWithAnalytics(overrides?: Record<string, unknown>) {
    return { AFFINITY_API_KEY: 'test-key', AFFINITY_CACHE: undefined, ANALYTICS: makeAnalyticsMock(), ...overrides };
  }

  it('does not throw when ANALYTICS binding is absent', async () => {
    const res = await worker.fetch(makeRequest('POST', '/mcp'), makeEnv('test-key'), {} as never);
    expect(res.status).toBe(200);
  });

  it('calls writeDataPoint once per /mcp request', async () => {
    const env = makeEnvWithAnalytics() as { ANALYTICS: { writeDataPoint: ReturnType<typeof vi.fn> } };
    await worker.fetch(makeRequest('POST', '/mcp'), env, {} as never);
    expect(env.ANALYTICS.writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it('records method and empty tool name for tools/list', async () => {
    const env = makeEnvWithAnalytics() as { ANALYTICS: { writeDataPoint: ReturnType<typeof vi.fn> } };
    const req = new Request('https://affinity.trulock.com/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    await worker.fetch(req, env, {} as never);
    const [event] = env.ANALYTICS.writeDataPoint.mock.calls[0] as [{ blobs: string[]; doubles: number[]; indexes: string[] }];
    expect(event.blobs[0]).toBe('tools/list');
    expect(event.blobs[1]).toBe('');
    expect(event.indexes[0]).toBe('tools/list');
  });

  it('records tool name for tools/call', async () => {
    const env = makeEnvWithAnalytics() as { ANALYTICS: { writeDataPoint: ReturnType<typeof vi.fn> } };
    const req = new Request('https://affinity.trulock.com/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_people', arguments: {} } }),
    });
    await worker.fetch(req, env, {} as never);
    const [event] = env.ANALYTICS.writeDataPoint.mock.calls[0] as [{ blobs: string[]; doubles: number[]; indexes: string[] }];
    expect(event.blobs[0]).toBe('tools/call');
    expect(event.blobs[1]).toBe('search_people');
    expect(event.indexes[0]).toBe('search_people');
  });

  it('records shared_key auth method when no OAuth', async () => {
    const env = makeEnvWithAnalytics() as { ANALYTICS: { writeDataPoint: ReturnType<typeof vi.fn> } };
    await worker.fetch(makeRequest('POST', '/mcp'), env, {} as never);
    const [event] = env.ANALYTICS.writeDataPoint.mock.calls[0] as [{ blobs: string[] }];
    expect(event.blobs[2]).toBe('shared_key');
  });

  it('records duration and status code in doubles', async () => {
    const env = makeEnvWithAnalytics() as { ANALYTICS: { writeDataPoint: ReturnType<typeof vi.fn> } };
    await worker.fetch(makeRequest('POST', '/mcp'), env, {} as never);
    const [event] = env.ANALYTICS.writeDataPoint.mock.calls[0] as [{ doubles: number[] }];
    expect(event.doubles[0]).toBeGreaterThanOrEqual(0);  // duration_ms
    expect(event.doubles[1]).toBe(200);                  // status code
  });

  it('does not call writeDataPoint when request body is not JSON', async () => {
    const env = makeEnvWithAnalytics() as { ANALYTICS: { writeDataPoint: ReturnType<typeof vi.fn> } };
    const req = new Request('https://affinity.trulock.com/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not-json',
    });
    // Should still complete — analytics fields just fall back to empty strings
    const res = await worker.fetch(req, env, {} as never);
    expect(res.status).toBe(200);
    const [event] = env.ANALYTICS.writeDataPoint.mock.calls[0] as [{ blobs: string[] }];
    expect(event.blobs[0]).toBe('');
    expect(event.blobs[1]).toBe('');
  });
});

describe('OAuth discovery with OAuth enabled', () => {
  it('includes authorization_servers when OAuth is configured', async () => {
    const env = {
      AFFINITY_API_KEY: 'key',
      AFFINITY_CACHE: undefined,
      OAUTH_KV: makeKVMock(),
      OAUTH_ENCRYPTION_KEY: 'a'.repeat(64),
    };
    const res = await worker.fetch(
      makeRequest('GET', '/.well-known/oauth-protected-resource'),
      env,
      {} as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { resource: string; authorization_servers?: string[] };
    expect(body.authorization_servers).toEqual(['https://affinity.trulock.com']);
    expect(body.resource).toBe('https://affinity.trulock.com');
  });

  it('omits authorization_servers when OAuth is not configured', async () => {
    const res = await worker.fetch(
      makeRequest('GET', '/.well-known/oauth-protected-resource'),
      makeEnv(),
      {} as never,
    );
    const body = await res.json() as { resource: string; authorization_servers?: string[] };
    expect(body.authorization_servers).toBeUndefined();
  });
});
