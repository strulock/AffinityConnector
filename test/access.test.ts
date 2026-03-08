import { describe, it, expect, vi, afterEach } from 'vitest';

const AUD = 'test-aud-123';
const TEAM = 'test.cloudflareaccess.com';
const KID = 'key-1';

// ── helpers ──────────────────────────────────────────────────────────────────

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify'],
  );
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlStr(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function makeJwt(payload: object, privateKey: CryptoKey, keyId = KID): Promise<string> {
  const h = b64urlStr(JSON.stringify({ alg: 'RS256', kid: keyId }));
  const p = b64urlStr(JSON.stringify(payload));
  const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${sig}`;
}

async function jwksMockResponse(publicKey: CryptoKey, keyId = KID): Promise<Response> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return new Response(JSON.stringify({ keys: [{ ...jwk, kid: keyId }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function nowPayload(overrides: object = {}): object {
  const now = Math.floor(Date.now() / 1000);
  return { aud: AUD, iat: now, exp: now + 3600, ...overrides };
}

// Re-imports access.ts fresh (clearing module-level jwksCache) then returns verifyAccessJwt.
async function getVerify(): Promise<(token: string, aud: string, team: string) => Promise<boolean>> {
  vi.resetModules();
  const { verifyAccessJwt } = await import('../src/access.js');
  return verifyAccessJwt;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('verifyAccessJwt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true for a valid, correctly signed token', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey));
    const token = await makeJwt(nowPayload(), kp.privateKey);
    expect(await verify(token, AUD, TEAM)).toBe(true);
  });

  it('returns false when token has fewer than 3 parts', async () => {
    const verify = await getVerify();
    expect(await verify('only.two', AUD, TEAM)).toBe(false);
    expect(await verify('one', AUD, TEAM)).toBe(false);
    expect(await verify('', AUD, TEAM)).toBe(false);
  });

  it('returns false for an expired token', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey));
    const token = await makeJwt(nowPayload({ exp: Math.floor(Date.now() / 1000) - 1 }), kp.privateKey);
    expect(await verify(token, AUD, TEAM)).toBe(false);
  });

  it('returns false when nbf is in the future', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey));
    const token = await makeJwt(nowPayload({ nbf: Math.floor(Date.now() / 1000) + 300 }), kp.privateKey);
    expect(await verify(token, AUD, TEAM)).toBe(false);
  });

  it('returns false when string audience does not match', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey));
    const token = await makeJwt(nowPayload({ aud: 'wrong-aud' }), kp.privateKey);
    expect(await verify(token, AUD, TEAM)).toBe(false);
  });

  it('returns true when aud is an array containing the expected audience', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey));
    const token = await makeJwt(nowPayload({ aud: ['other-aud', AUD] }), kp.privateKey);
    expect(await verify(token, AUD, TEAM)).toBe(true);
  });

  it('returns false when aud array does not include the expected audience', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey));
    const token = await makeJwt(nowPayload({ aud: ['wrong-1', 'wrong-2'] }), kp.privateKey);
    expect(await verify(token, AUD, TEAM)).toBe(false);
  });

  it('returns false when kid is not found in JWKS', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    // JWKS has 'different-kid', token uses 'unknown-kid'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey, 'different-kid'));
    const token = await makeJwt(nowPayload(), kp.privateKey, 'unknown-kid');
    expect(await verify(token, AUD, TEAM)).toBe(false);
  });

  it('returns false when JWKS endpoint returns a non-200 status', async () => {
    const verify = await getVerify();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    const kp = await generateKeyPair();
    const token = await makeJwt(nowPayload(), kp.privateKey);
    expect(await verify(token, AUD, TEAM)).toBe(false);
  });

  it('returns false when JWKS fetch throws a network error', async () => {
    const verify = await getVerify();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const kp = await generateKeyPair();
    const token = await makeJwt(nowPayload(), kp.privateKey);
    expect(await verify(token, AUD, TEAM)).toBe(false);
  });

  it('returns false when the payload has been tampered with after signing', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey));
    const token = await makeJwt(nowPayload(), kp.privateKey);
    // Replace the payload part with different content, keeping the original signature
    const parts = token.split('.');
    parts[1] = b64urlStr(JSON.stringify(nowPayload({ sub: 'tampered' })));
    expect(await verify(parts.join('.'), AUD, TEAM)).toBe(false);
  });

  it('returns false when signed by a different key than the one in JWKS', async () => {
    const verify = await getVerify();
    const signingKp = await generateKeyPair();
    const jwksKp = await generateKeyPair(); // different key
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(jwksKp.publicKey));
    const token = await makeJwt(nowPayload(), signingKp.privateKey);
    expect(await verify(token, AUD, TEAM)).toBe(false);
  });

  it('uses the module-level JWKS cache and does not re-fetch on the second call', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey));
    const token = await makeJwt(nowPayload(), kp.privateKey);
    await verify(token, AUD, TEAM);
    await verify(token, AUD, TEAM);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('re-fetches JWKS after the 1-hour TTL expires', async () => {
    const verify = await getVerify();
    const kp = await generateKeyPair();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(await jwksMockResponse(kp.publicKey));
    // Use a 4-hour expiry so the token is still valid after we advance time by 61 minutes
    const token = await makeJwt(nowPayload({ exp: Math.floor(Date.now() / 1000) + 4 * 3600 }), kp.privateKey);

    // First call — populates cache
    await verify(token, AUD, TEAM);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance time past the 1-hour JWKS TTL (token exp is 4 hours, so it remains valid)
    const nowMs = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(nowMs + 61 * 60 * 1000);

    // Second call — cache is stale, should re-fetch
    fetchSpy.mockResolvedValue(await jwksMockResponse(kp.publicKey));
    await verify(token, AUD, TEAM);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
