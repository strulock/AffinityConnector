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

// Import after mocks are set up
const { default: worker } = await import('../src/index.js');

function makeRequest(method: string, path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://affinity.trulock.com${path}`, { method, headers });
}

function makeEnv(apiKey = 'test-key'): unknown {
  return { AFFINITY_API_KEY: apiKey, AFFINITY_CACHE: undefined };
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

  function makeWebhookRequest(secret: string | null, body: unknown = { id: 'evt-1', type: 'person.created', body: {}, created_at: '2024-01-01T00:00:00Z' }): Request {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret !== null) headers['X-Affinity-Webhook-Secret'] = secret;
    return new Request('https://affinity.trulock.com/webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when no webhook secret is configured on the Worker', async () => {
    const res = await worker.fetch(makeWebhookRequest('any-secret'), makeWebhookEnv(undefined), {} as never);
    expect(res.status).toBe(401);
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
    const stored = await kv.get('webhook:event:evt-1');
    expect(stored).not.toBeNull();
    const recent = JSON.parse(await kv.get('webhook:recent') ?? '[]') as string[];
    expect(recent).toContain('evt-1');
  });

  it('deduplicates event IDs in the recency index', async () => {
    const kv = makeKVMock();
    const env = makeWebhookEnv('secret', kv);
    // Send the same event twice
    await worker.fetch(makeWebhookRequest('secret'), env, {} as never);
    await worker.fetch(makeWebhookRequest('secret'), env, {} as never);
    const recent = JSON.parse(await kv.get('webhook:recent') ?? '[]') as string[];
    expect(recent.filter(id => id === 'evt-1')).toHaveLength(1);
  });
});
