import { describe, it, expect, vi, afterEach } from 'vitest';

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
