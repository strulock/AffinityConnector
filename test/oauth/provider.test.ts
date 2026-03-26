import { describe, it, expect, beforeEach } from 'vitest';
import { makeKVMock } from '../helpers/kv-mock.js';
import { importEncryptionKey, sha256Hex } from '../../src/oauth/crypto.js';
import {
  registerClient,
  getClient,
  createAuthorizationCode,
  exchangeCodeForTokens,
  refreshAccessToken,
  resolveToken,
  OAuthError,
} from '../../src/oauth/provider.js';

const TEST_KEY_HEX = 'a'.repeat(64);

let kv: KVNamespace;
let encKey: CryptoKey;

beforeEach(async () => {
  kv = makeKVMock();
  encKey = await importEncryptionKey(TEST_KEY_HEX);
});

// --- Client Registration ---

describe('registerClient', () => {
  it('registers a client with valid metadata', async () => {
    const client = await registerClient(kv, {
      redirect_uris: ['https://example.com/callback'],
      client_name: 'Test App',
    });
    expect(client.client_id).toBeTruthy();
    expect(client.redirect_uris).toEqual(['https://example.com/callback']);
    expect(client.client_name).toBe('Test App');
    expect(client.token_endpoint_auth_method).toBe('none');
  });

  it('persists the client in KV', async () => {
    const client = await registerClient(kv, { redirect_uris: ['https://example.com/cb'] });
    const retrieved = await getClient(kv, client.client_id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.client_id).toBe(client.client_id);
  });

  it('rejects missing redirect_uris', async () => {
    await expect(registerClient(kv, {})).rejects.toThrow(OAuthError);
  });

  it('rejects empty redirect_uris array', async () => {
    await expect(registerClient(kv, { redirect_uris: [] })).rejects.toThrow('non-empty');
  });

  it('rejects invalid redirect_uri URL', async () => {
    await expect(registerClient(kv, { redirect_uris: ['not-a-url'] })).rejects.toThrow('Invalid redirect_uri');
  });

  it('rejects non-none auth method', async () => {
    await expect(registerClient(kv, {
      redirect_uris: ['https://example.com/cb'],
      token_endpoint_auth_method: 'client_secret_post',
    })).rejects.toThrow('public clients');
  });

  it('rejects missing authorization_code grant type', async () => {
    await expect(registerClient(kv, {
      redirect_uris: ['https://example.com/cb'],
      grant_types: ['client_credentials'],
    })).rejects.toThrow('authorization_code');
  });
});

// --- Authorization Code ---

describe('createAuthorizationCode', () => {
  it('creates a code for a valid client', async () => {
    const client = await registerClient(kv, { redirect_uris: ['https://example.com/cb'] });
    const code = await createAuthorizationCode(kv, encKey, {
      client_id: client.client_id,
      redirect_uri: 'https://example.com/cb',
      code_challenge: 'test-challenge',
      code_challenge_method: 'S256',
      scopes: ['affinity'],
      apiKey: 'test-api-key',
    });
    expect(code).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects non-S256 challenge method', async () => {
    const client = await registerClient(kv, { redirect_uris: ['https://example.com/cb'] });
    await expect(createAuthorizationCode(kv, encKey, {
      client_id: client.client_id,
      redirect_uri: 'https://example.com/cb',
      code_challenge: 'test',
      code_challenge_method: 'plain',
      scopes: ['affinity'],
      apiKey: 'key',
    })).rejects.toThrow('S256');
  });

  it('rejects unknown client_id', async () => {
    await expect(createAuthorizationCode(kv, encKey, {
      client_id: 'nonexistent',
      redirect_uri: 'https://example.com/cb',
      code_challenge: 'test',
      code_challenge_method: 'S256',
      scopes: ['affinity'],
      apiKey: 'key',
    })).rejects.toThrow('Unknown client_id');
  });

  it('rejects unregistered redirect_uri', async () => {
    const client = await registerClient(kv, { redirect_uris: ['https://example.com/cb'] });
    await expect(createAuthorizationCode(kv, encKey, {
      client_id: client.client_id,
      redirect_uri: 'https://evil.com/cb',
      code_challenge: 'test',
      code_challenge_method: 'S256',
      scopes: ['affinity'],
      apiKey: 'key',
    })).rejects.toThrow('redirect_uri');
  });
});

// --- Token Exchange ---

describe('exchangeCodeForTokens', () => {
  // Helper: create a valid code with a known verifier
  async function createCodeWithVerifier() {
    const client = await registerClient(kv, { redirect_uris: ['https://example.com/cb'] });
    const codeVerifier = 'my-test-code-verifier-string-1234567890';
    // S256 challenge = base64url(sha256(verifier))
    const hash = await sha256Hex(codeVerifier);
    // Convert hex hash to base64url
    const bytes = new Uint8Array(hash.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const b64 = btoa(String.fromCharCode(...bytes));
    const codeChallenge = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const code = await createAuthorizationCode(kv, encKey, {
      client_id: client.client_id,
      redirect_uri: 'https://example.com/cb',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scopes: ['affinity'],
      apiKey: 'test-affinity-api-key',
    });
    return { client, code, codeVerifier };
  }

  it('exchanges a valid code for tokens', async () => {
    const { client, code, codeVerifier } = await createCodeWithVerifier();
    const tokens = await exchangeCodeForTokens(kv, encKey, {
      code,
      client_id: client.client_id,
      redirect_uri: 'https://example.com/cb',
      code_verifier: codeVerifier,
    });
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(3600);
  });

  it('rejects a code that has already been used (one-time use)', async () => {
    const { client, code, codeVerifier } = await createCodeWithVerifier();
    await exchangeCodeForTokens(kv, encKey, {
      code, client_id: client.client_id, code_verifier: codeVerifier,
    });
    await expect(exchangeCodeForTokens(kv, encKey, {
      code, client_id: client.client_id, code_verifier: codeVerifier,
    })).rejects.toThrow('invalid or expired');
  });

  it('rejects wrong client_id', async () => {
    const { code, codeVerifier } = await createCodeWithVerifier();
    await expect(exchangeCodeForTokens(kv, encKey, {
      code, client_id: 'wrong-client', code_verifier: codeVerifier,
    })).rejects.toThrow('client_id mismatch');
  });

  it('rejects wrong code_verifier (PKCE)', async () => {
    const { client, code } = await createCodeWithVerifier();
    await expect(exchangeCodeForTokens(kv, encKey, {
      code, client_id: client.client_id, code_verifier: 'wrong-verifier',
    })).rejects.toThrow('code_verifier');
  });
});

// --- Refresh Token ---

describe('refreshAccessToken', () => {
  async function getTokens() {
    const client = await registerClient(kv, { redirect_uris: ['https://example.com/cb'] });
    const codeVerifier = 'verifier-for-refresh-test-1234567890';
    const hash = await sha256Hex(codeVerifier);
    const bytes = new Uint8Array(hash.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const b64 = btoa(String.fromCharCode(...bytes));
    const codeChallenge = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const code = await createAuthorizationCode(kv, encKey, {
      client_id: client.client_id,
      redirect_uri: 'https://example.com/cb',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scopes: ['affinity'],
      apiKey: 'refresh-test-key',
    });
    const tokens = await exchangeCodeForTokens(kv, encKey, {
      code, client_id: client.client_id, code_verifier: codeVerifier,
    });
    return { client, tokens };
  }

  it('issues new tokens from a valid refresh token', async () => {
    const { client, tokens } = await getTokens();
    const newTokens = await refreshAccessToken(kv, encKey, {
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
    });
    expect(newTokens.access_token).toBeTruthy();
    expect(newTokens.access_token).not.toBe(tokens.access_token);
    expect(newTokens.refresh_token).not.toBe(tokens.refresh_token);
  });

  it('rejects the old refresh token after rotation', async () => {
    const { client, tokens } = await getTokens();
    await refreshAccessToken(kv, encKey, {
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
    });
    await expect(refreshAccessToken(kv, encKey, {
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
    })).rejects.toThrow('invalid or expired');
  });

  it('rejects wrong client_id', async () => {
    const { tokens } = await getTokens();
    await expect(refreshAccessToken(kv, encKey, {
      refresh_token: tokens.refresh_token,
      client_id: 'wrong-client',
    })).rejects.toThrow('client_id mismatch');
  });
});

// --- Token Resolution ---

describe('resolveToken', () => {
  it('resolves a valid access token to the API key', async () => {
    const client = await registerClient(kv, { redirect_uris: ['https://example.com/cb'] });
    const codeVerifier = 'verifier-for-resolve-test-1234567890';
    const hash = await sha256Hex(codeVerifier);
    const bytes = new Uint8Array(hash.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const b64 = btoa(String.fromCharCode(...bytes));
    const codeChallenge = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const code = await createAuthorizationCode(kv, encKey, {
      client_id: client.client_id,
      redirect_uri: 'https://example.com/cb',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scopes: ['affinity'],
      apiKey: 'the-real-api-key',
    });
    const tokens = await exchangeCodeForTokens(kv, encKey, {
      code, client_id: client.client_id, code_verifier: codeVerifier,
    });

    const apiKey = await resolveToken(kv, encKey, tokens.access_token);
    expect(apiKey).toBe('the-real-api-key');
  });

  it('returns null for unknown token', async () => {
    const result = await resolveToken(kv, encKey, 'nonexistent-token');
    expect(result).toBeNull();
  });
});
