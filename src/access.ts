// Validates Cloudflare Access JWTs for defense-in-depth on the /mcp endpoint.
// Cloudflare Access sets Cf-Access-Jwt-Assertion on all authenticated requests.
// Verifying it here ensures requests that bypass Access (e.g. hitting the Worker
// origin URL directly) are rejected even if Access is misconfigured or bypassed.
//
// Required env vars:
//   CLOUDFLARE_ACCESS_AUD         — Application Audience tag from the Access app
//   CLOUDFLARE_ACCESS_TEAM_DOMAIN — e.g. "myteam.cloudflareaccess.com"

interface JWK {
  kid: string;
  n: string;
  e: string;
}

// Module-level cache: persists for the lifetime of the Worker isolate.
let jwksCache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const { keys }: { keys: JWK[] } = await res.json();
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    const key = await crypto.subtle.importKey(
      "jwk", jwk as unknown as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["verify"],
    );
    map.set(jwk.kid, key);
  }
  return map;
}

async function getKey(kid: string, teamDomain: string): Promise<CryptoKey | null> {
  const now = Date.now();
  if (!jwksCache || now - jwksCache.fetchedAt > JWKS_TTL_MS) {
    jwksCache = { keys: await fetchKeys(teamDomain), fetchedAt: now };
  }
  return jwksCache.keys.get(kid) ?? null;
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

/**
 * Verifies a Cloudflare Access JWT.
 * Returns true only if the signature is valid, the token is not expired,
 * and the audience matches the configured Access application.
 */
export async function verifyAccessJwt(
  token: string,
  aud: string,
  teamDomain: string,
): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return false;
    if (payload.nbf && now < payload.nbf) return false;

    const audiences: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(aud)) return false;

    const key = await getKey(header.kid, teamDomain);
    if (!key) return false;

    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sig = b64urlDecode(parts[2]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  } catch {
    return false;
  }
}
