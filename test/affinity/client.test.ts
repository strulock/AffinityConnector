import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AffinityClient,
  AffinityAuthError,
  AffinityPermissionError,
  AffinityNotFoundError,
  AffinityConflictError,
  AffinityRateLimitError,
  AffinityServerError,
} from '../../src/affinity/client.js';

function mockFetch(status: number, body: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  );
}

function mockFetchSequence(...responses: Array<{ status: number; body?: unknown }>): void {
  const mock = vi.fn();
  for (const { status, body = {} } of responses) {
    mock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
  }
  vi.stubGlobal('fetch', mock);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AffinityClient constructor', () => {
  it('throws AffinityAuthError with an empty API key', () => {
    expect(() => new AffinityClient('')).toThrow(AffinityAuthError);
  });

  it('constructs successfully with a valid API key', () => {
    expect(() => new AffinityClient('valid-key')).not.toThrow();
  });
});

describe('AffinityClient request building', () => {
  beforeEach(() => {
    mockFetch(200, { result: true });
  });

  it('sends Authorization: Bearer header', async () => {
    const client = new AffinityClient('my-api-key');
    await client.get('/test');
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-api-key');
  });

  it('uses v1 base URL by default', async () => {
    const client = new AffinityClient('key');
    await client.get('/persons');
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('https://api.affinity.co/persons');
  });

  it('uses custom v1 base URL when provided', async () => {
    const client = new AffinityClient('key', { v1BaseUrl: 'https://custom.example.com' });
    await client.get('/persons');
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('https://custom.example.com');
  });

  it('uses v2 base URL when version is v2', async () => {
    const client = new AffinityClient('key');
    await client.get('/persons', {}, 'v2');
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('https://api.affinity.co/v2/persons');
  });

  it('appends query parameters to the URL', async () => {
    const client = new AffinityClient('key');
    await client.get('/persons', { term: 'alice', page_size: 10 });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain('term=alice');
    expect(url).toContain('page_size=10');
  });

  it('omits undefined and null query parameters', async () => {
    const client = new AffinityClient('key');
    await client.get('/persons', { term: undefined, page_size: null, valid: 'yes' });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).not.toContain('term=');
    expect(url).not.toContain('page_size=');
    expect(url).toContain('valid=yes');
  });

  it('sends POST with JSON body', async () => {
    const client = new AffinityClient('key');
    await client.post('/notes', { content: 'hello' });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ content: 'hello' });
  });
});

describe('AffinityClient error handling', () => {
  it('throws AffinityAuthError on 401', async () => {
    mockFetch(401, { message: 'Unauthorized' });
    const client = new AffinityClient('key');
    await expect(client.get('/test')).rejects.toThrow(AffinityAuthError);
  });

  it('throws AffinityPermissionError on 403', async () => {
    mockFetch(403, { message: 'Forbidden' });
    const client = new AffinityClient('key');
    await expect(client.get('/test')).rejects.toThrow(AffinityPermissionError);
  });

  it('throws AffinityNotFoundError on 404', async () => {
    mockFetch(404, { message: 'Not found' });
    const client = new AffinityClient('key');
    await expect(client.get('/test')).rejects.toThrow(AffinityNotFoundError);
  });

  it('throws AffinityConflictError on 409', async () => {
    mockFetch(409, { message: 'Conflict' });
    const client = new AffinityClient('key');
    await expect(client.get('/test')).rejects.toThrow(AffinityConflictError);
  });

  it('throws AffinityServerError on 500', async () => {
    mockFetch(500, { message: 'Internal Server Error' });
    const client = new AffinityClient('key');
    await expect(client.get('/test')).rejects.toThrow(AffinityServerError);
  });

  it('falls back to statusText when error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not-json', { status: 401, statusText: 'Unauthorized' }))
    );
    const client = new AffinityClient('key');
    const err = await client.get('/test').catch((e) => e);
    expect(err).toBeInstanceOf(AffinityAuthError);
    expect(err.message).toBe('Unauthorized');
  });

  it('throws a generic Error on unexpected status codes', async () => {
    mockFetch(418, { message: "I'm a teapot" });
    const client = new AffinityClient('key');
    await expect(client.get('/test')).rejects.toThrow(/418/);
  });

  it('includes status in AffinityServerError', async () => {
    mockFetch(503, { message: 'Service Unavailable' });
    const client = new AffinityClient('key');
    const err = await client.get('/test').catch((e) => e);
    expect(err).toBeInstanceOf(AffinityServerError);
    expect((err as AffinityServerError).status).toBe(503);
  });
});

describe('AffinityClient 429 retry logic', () => {
  it('retries on 429 and succeeds when a later attempt succeeds', async () => {
    vi.useFakeTimers();
    mockFetchSequence(
      { status: 429 },
      { status: 429 },
      { status: 200, body: { ok: true } }
    );
    const client = new AffinityClient('key');
    const promise = client.get('/test');
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it('throws AffinityRateLimitError after exhausting all retries', async () => {
    vi.useFakeTimers();
    // 4 calls: attempt 0, 1, 2, 3 — all 429
    mockFetchSequence(
      { status: 429 },
      { status: 429 },
      { status: 429 },
      { status: 429 }
    );
    const client = new AffinityClient('key');
    const promise = client.get('/test');
    // Attach catch handler immediately to prevent unhandled rejection, then advance timers
    const caught = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await caught;
    expect(err).toBeInstanceOf(AffinityRateLimitError);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
  });
});
