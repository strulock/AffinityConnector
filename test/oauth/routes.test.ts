import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeKVMock } from '../helpers/kv-mock.js';
import {
  handleOAuthMetadata,
  handleRegister,
  handleAuthorizeGet,
  handleAuthorizePost,
  handleToken,
} from '../../src/oauth/routes.js';
import { registerClient } from '../../src/oauth/provider.js';
import { sha256Hex } from '../../src/oauth/crypto.js';
import type { Env } from '../../src/index.js';

const TEST_ENC_KEY = 'a'.repeat(64);

function makeEnv(overrides?: Partial<Env>): Env {
  return {
    AFFINITY_CACHE: makeKVMock(),
    OAUTH_KV: makeKVMock(),
    OAUTH_ENCRYPTION_KEY: TEST_ENC_KEY,
    ...overrides,
  } as Env;
}

// --- OAuth Metadata ---

describe('handleOAuthMetadata', () => {
  it('returns correct metadata structure', () => {
    const req = new Request('https://affinity.example.com/.well-known/oauth-authorization-server');
    const res = handleOAuthMetadata(req, makeEnv());
    expect(res.status).toBe(200);
    return res.json().then((body: Record<string, unknown>) => {
      expect(body.issuer).toBe('https://affinity.example.com');
      expect(body.authorization_endpoint).toBe('https://affinity.example.com/oauth/authorize');
      expect(body.token_endpoint).toBe('https://affinity.example.com/oauth/token');
      expect(body.registration_endpoint).toBe('https://affinity.example.com/oauth/register');
      expect(body.code_challenge_methods_supported).toEqual(['S256']);
    });
  });
});

// --- Client Registration ---

describe('handleRegister', () => {
  it('returns 201 with client info for valid registration', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://example.com/cb'] }),
    });
    const res = await handleRegister(req, env);
    expect(res.status).toBe(201);
    const body = await res.json() as { client_id: string };
    expect(body.client_id).toBeTruthy();
  });

  it('returns 400 for invalid metadata', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [] }),
    });
    const res = await handleRegister(req, env);
    expect(res.status).toBe(400);
  });

  it('returns 405 for non-POST', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/register', { method: 'GET' });
    const res = await handleRegister(req, env);
    expect(res.status).toBe(405);
  });
});

describe('handleRegister — invalid JSON', () => {
  it('returns 400 for non-JSON body', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await handleRegister(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_client_metadata');
  });
});

// --- Authorize GET ---

describe('handleAuthorizeGet', () => {
  it('returns 400 for unsupported response_type', async () => {
    const env = makeEnv();
    const url = 'https://affinity.example.com/oauth/authorize?response_type=token&client_id=c&redirect_uri=https://example.com/cb&code_challenge=x&code_challenge_method=S256&state=s';
    const req = new Request(url);
    const res = await handleAuthorizeGet(req, env);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('response_type');
  });

  it('returns 400 for non-S256 code_challenge_method', async () => {
    const env = makeEnv();
    const client = await registerClient(env.OAUTH_KV!, { redirect_uris: ['https://example.com/cb'] });
    const url = `https://affinity.example.com/oauth/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=https://example.com/cb&code_challenge=x&code_challenge_method=plain&state=s`;
    const req = new Request(url);
    const res = await handleAuthorizeGet(req, env);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('S256');
  });

  it('returns 400 when redirect_uri does not match registered URI', async () => {
    const env = makeEnv();
    const client = await registerClient(env.OAUTH_KV!, { redirect_uris: ['https://example.com/cb'] });
    const url = `https://affinity.example.com/oauth/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=https://evil.com/cb&code_challenge=x&code_challenge_method=S256&state=s`;
    const req = new Request(url);
    const res = await handleAuthorizeGet(req, env);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('not registered');
  });

  it('renders the HTML form for valid params', async () => {
    const env = makeEnv();
    const client = await registerClient(env.OAUTH_KV!, { redirect_uris: ['https://example.com/cb'] });
    const url = `https://affinity.example.com/oauth/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=https://example.com/cb&code_challenge=test-challenge&code_challenge_method=S256&state=xyz`;
    const req = new Request(url);
    const res = await handleAuthorizeGet(req, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Connect your Affinity account');
    expect(html).toContain('api_key');
  });

  it('returns 400 for missing params', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/authorize?response_type=code');
    const res = await handleAuthorizeGet(req, env);
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown client_id', async () => {
    const env = makeEnv();
    const url = 'https://affinity.example.com/oauth/authorize?response_type=code&client_id=nonexistent&redirect_uri=https://example.com/cb&code_challenge=test&code_challenge_method=S256&state=xyz';
    const req = new Request(url);
    const res = await handleAuthorizeGet(req, env);
    expect(res.status).toBe(400);
  });
});

// --- Authorize POST ---

describe('handleAuthorizePost', () => {
  let env: Env;
  let clientId: string;

  beforeEach(async () => {
    env = makeEnv();
    const client = await registerClient(env.OAUTH_KV!, { redirect_uris: ['https://example.com/cb'] });
    clientId = client.client_id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects with auth code on valid API key', async () => {
    // Mock fetch to simulate Affinity /whoami success
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"email":"test@test.com"}', { status: 200 })));

    const form = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://example.com/cb',
      state: 'test-state',
      code_challenge: 'test-challenge',
      code_challenge_method: 'S256',
      scope: 'affinity',
      api_key: 'valid-api-key',
    });
    const req = new Request('https://affinity.example.com/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handleAuthorizePost(req, env);
    expect(res.status).toBe(302);
    const location = res.headers.get('Location')!;
    expect(location).toContain('https://example.com/cb');
    expect(location).toContain('code=');
    expect(location).toContain('state=test-state');
  });

  it('re-renders form with error on invalid API key (401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));

    const form = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://example.com/cb',
      state: 'xyz',
      code_challenge: 'c',
      code_challenge_method: 'S256',
      scope: 'affinity',
      api_key: 'bad-key',
    });
    const req = new Request('https://affinity.example.com/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handleAuthorizePost(req, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Invalid API key');
  });

  it('re-renders form on Affinity server error (500)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 })));

    const form = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://example.com/cb',
      state: 'xyz',
      code_challenge: 'c',
      code_challenge_method: 'S256',
      scope: 'affinity',
      api_key: 'some-key',
    });
    const req = new Request('https://affinity.example.com/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handleAuthorizePost(req, env);
    const html = await res.text();
    expect(html).toContain('Affinity returned an error');
  });

  it('re-renders form when fetch to Affinity throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));

    const form = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://example.com/cb',
      state: 'xyz',
      code_challenge: 'c',
      code_challenge_method: 'S256',
      scope: 'affinity',
      api_key: 'some-key',
    });
    const req = new Request('https://affinity.example.com/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handleAuthorizePost(req, env);
    const html = await res.text();
    expect(html).toContain('Could not reach Affinity');
  });

  it('re-renders form when API key is empty', async () => {
    const form = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://example.com/cb',
      state: 'xyz',
      code_challenge: 'c',
      code_challenge_method: 'S256',
      scope: 'affinity',
      api_key: '',
    });
    const req = new Request('https://affinity.example.com/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const res = await handleAuthorizePost(req, env);
    const html = await res.text();
    expect(html).toContain('Please enter');
  });
});

// --- Token Endpoint ---

describe('handleToken', () => {
  it('returns 405 for non-POST', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/token', { method: 'GET' });
    const res = await handleToken(req, env);
    expect(res.status).toBe(405);
  });

  it('returns error for unsupported grant_type', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const res = await handleToken(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unsupported_grant_type');
  });

  it('returns error for missing params on authorization_code', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code',
    });
    const res = await handleToken(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_request');
  });

  it('returns error for invalid code', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=bad-code&client_id=some-client&code_verifier=verifier',
    });
    const res = await handleToken(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_grant');
  });

  it('returns error for missing params on refresh_token', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token',
    });
    const res = await handleToken(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_request');
  });

  it('returns error for invalid refresh_token', async () => {
    const env = makeEnv();
    const req = new Request('https://affinity.example.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=bad-token&client_id=some-client',
    });
    const res = await handleToken(req, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid_grant');
  });
});

// --- Full OAuth Flow Integration ---

describe('full OAuth flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('register → authorize → token → resolves API key', async () => {
    const env = makeEnv();

    // 1. Register client
    const regReq = new Request('https://affinity.example.com/oauth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://example.com/cb'] }),
    });
    const regRes = await handleRegister(regReq, env);
    const { client_id } = await regRes.json() as { client_id: string };

    // 2. Prepare PKCE
    const codeVerifier = 'integration-test-verifier-1234567890abcdef';
    const hash = await sha256Hex(codeVerifier);
    const bytes = new Uint8Array(hash.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const b64 = btoa(String.fromCharCode(...bytes));
    const codeChallenge = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // 3. Authorize (POST — user submits API key)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"email":"test@test.com"}', { status: 200 })));

    const authForm = new URLSearchParams({
      client_id,
      redirect_uri: 'https://example.com/cb',
      state: 'mystate',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: 'affinity',
      api_key: 'my-real-affinity-key',
    });
    const authReq = new Request('https://affinity.example.com/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: authForm.toString(),
    });
    const authRes = await handleAuthorizePost(authReq, env);
    expect(authRes.status).toBe(302);
    const location = new URL(authRes.headers.get('Location')!);
    const code = location.searchParams.get('code')!;
    expect(code).toBeTruthy();

    // 4. Token exchange
    const tokenReq = new Request('https://affinity.example.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id,
        redirect_uri: 'https://example.com/cb',
        code_verifier: codeVerifier,
      }).toString(),
    });
    const tokenRes = await handleToken(tokenReq, env);
    expect(tokenRes.status).toBe(200);
    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string };
    expect(tokens.access_token).toBeTruthy();

    // 5. Resolve token to API key
    const { importEncryptionKey } = await import('../../src/oauth/crypto.js');
    const { resolveToken } = await import('../../src/oauth/provider.js');
    const encKey = await importEncryptionKey(TEST_ENC_KEY);
    const apiKey = await resolveToken(env.OAUTH_KV!, encKey, tokens.access_token);
    expect(apiKey).toBe('my-real-affinity-key');

    // 6. Refresh token exchange
    const refreshReq = new Request('https://affinity.example.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id,
      }).toString(),
    });
    const refreshRes = await handleToken(refreshReq, env);
    expect(refreshRes.status).toBe(200);
    const newTokens = await refreshRes.json() as { access_token: string; refresh_token: string };
    expect(newTokens.access_token).toBeTruthy();
    expect(newTokens.access_token).not.toBe(tokens.access_token);

    // 7. New token resolves to same API key
    const newApiKey = await resolveToken(env.OAUTH_KV!, encKey, newTokens.access_token);
    expect(newApiKey).toBe('my-real-affinity-key');
  });
});
