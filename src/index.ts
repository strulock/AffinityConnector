import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server.js";
import { KVCache } from "./cache.js";
import type { AffinityWebhookEvent } from "./affinity/types.js";
import { verifyAccessJwt } from "./access.js";
import { importEncryptionKey } from "./oauth/crypto.js";
import { resolveToken } from "./oauth/provider.js";
import {
  handleOAuthMetadata,
  handleRegister,
  handleAuthorizeGet,
  handleAuthorizePost,
  handleToken,
} from "./oauth/routes.js";

export interface Env {
  AFFINITY_API_KEY?: string;
  AFFINITY_V1_BASE_URL?: string;
  AFFINITY_V2_BASE_URL?: string;
  AFFINITY_CACHE: KVNamespace;
  AFFINITY_WEBHOOK_SECRET?: string;
  // OAuth 2.1 per-user authentication.
  // When configured, users provide their own Affinity API key via the OAuth authorize flow.
  // Generate OAUTH_ENCRYPTION_KEY with: openssl rand -hex 32
  OAUTH_KV?: KVNamespace;
  OAUTH_ENCRYPTION_KEY?: string;
  // Cloudflare Access JWT validation (defense-in-depth for /mcp).
  // Set CLOUDFLARE_ACCESS_JWT_VALIDATION = true in wrangler.toml to enable.
  // When enabled, CLOUDFLARE_ACCESS_AUD (secret) and CLOUDFLARE_ACCESS_TEAM_DOMAIN (var)
  // must also be set. If the flag is false or unset, JWT validation is skipped entirely.
  CLOUDFLARE_ACCESS_JWT_VALIDATION?: boolean;
  CLOUDFLARE_ACCESS_AUD?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
}

// Claude.ai connects from the browser, so CORS is required.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://claude.ai",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, last-event-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (pathname === "/webhook") {
      return handleWebhook(request, env);
    }

    if (pathname === "/mcp") {
      return handleMcp(request, env);
    }

    // OAuth 2.1 endpoints
    if (pathname === "/.well-known/oauth-authorization-server") {
      return handleOAuthMetadata(request, env);
    }
    if (pathname === "/oauth/register") {
      return handleRegister(request, env);
    }
    if (pathname === "/oauth/authorize") {
      if (request.method === "POST") return handleAuthorizePost(request, env);
      return handleAuthorizeGet(request, env);
    }
    if (pathname === "/oauth/token") {
      return handleToken(request, env);
    }

    // MCP auth discovery endpoint (RFC 9728).
    if (pathname === "/.well-known/oauth-protected-resource") {
      const { origin } = new URL(request.url);
      const oauthEnabled = !!(env.OAUTH_KV && env.OAUTH_ENCRYPTION_KEY);
      return Response.json({
        resource: origin,
        ...(oauthEnabled ? {
          authorization_servers: [origin],
          bearer_methods_supported: ["header"],
          scopes_supported: ["affinity"],
        } : {}),
      }, { headers: CORS_HEADERS });
    }

    if (pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return new Response("Not found", { status: 404 });
  },
};

/**
 * Constant-time string equality using HMAC-SHA256 to prevent timing attacks.
 * Both inputs are signed with the same key; the resulting MACs are compared
 * via XOR so the loop runs in fixed time regardless of where the strings differ.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode("webhook-secret-check"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(a)),
    crypto.subtle.sign("HMAC", key, enc.encode(b)),
  ]);
  const va = new Uint8Array(sa);
  const vb = new Uint8Array(sb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > 65536) {
    return new Response("Payload Too Large", { status: 413 });
  }

  // Validate webhook secret if configured. The Affinity v1 API does not return a
  // shared secret on webhook creation, so this check is opt-in: set AFFINITY_WEBHOOK_SECRET
  // via `wrangler secret put` and configure the same value in Affinity if supported.
  if (env.AFFINITY_WEBHOOK_SECRET) {
    const secret = request.headers.get("X-Affinity-Webhook-Secret");
    if (!secret || !(await timingSafeEqual(secret, env.AFFINITY_WEBHOOK_SECRET))) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: AffinityWebhookEvent;
  try {
    payload = await request.json() as AffinityWebhookEvent;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (env.AFFINITY_CACHE && payload.type) {
    const cache = new KVCache(env.AFFINITY_CACHE);
    const ttl = 7 * 24 * 3600; // 7 days
    // Derive a deterministic event ID from type, sent_at, and body.id (if present).
    const bodyId = typeof payload.body?.id === "number" ? payload.body.id : "";
    const eventId = `${payload.type}:${payload.sent_at}:${bodyId}`;
    await cache.set(`webhook:event:${eventId}`, payload, ttl);
    // Update recency index: prepend new ID, deduplicate, cap at 100.
    const recent = (await cache.get<string[]>("webhook:recent")) ?? [];
    const updated = [eventId, ...recent.filter(id => id !== eventId)].slice(0, 100);
    await cache.set("webhook:recent", updated, ttl);
  }

  return new Response("OK", { status: 200 });
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
  // Defense-in-depth: Cloudflare Access JWT check (if enabled)
  if (env.CLOUDFLARE_ACCESS_JWT_VALIDATION) {
    if (!env.CLOUDFLARE_ACCESS_AUD || !env.CLOUDFLARE_ACCESS_TEAM_DOMAIN) {
      return withCors(new Response("Access JWT validation enabled but CLOUDFLARE_ACCESS_AUD or CLOUDFLARE_ACCESS_TEAM_DOMAIN is missing.", { status: 500 }));
    }
    const cfToken = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!cfToken || !(await verifyAccessJwt(cfToken, env.CLOUDFLARE_ACCESS_AUD, env.CLOUDFLARE_ACCESS_TEAM_DOMAIN))) {
      return withCors(new Response("Unauthorized", { status: 401 }));
    }
  }

  // Resolve the Affinity API key: per-user Bearer token or fallback to env
  let apiKey: string | null = null;
  const oauthEnabled = !!(env.OAUTH_KV && env.OAUTH_ENCRYPTION_KEY);

  if (oauthEnabled) {
    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (bearerToken) {
      const encKey = await importEncryptionKey(env.OAUTH_ENCRYPTION_KEY!);
      apiKey = await resolveToken(env.OAUTH_KV!, encKey, bearerToken);
      if (!apiKey) {
        const { origin } = new URL(request.url);
        return withCors(new Response("Unauthorized", {
          status: 401,
          headers: {
            "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
          },
        }));
      }
    }
  }

  // Fallback to shared API key if no Bearer token resolved
  if (!apiKey) {
    apiKey = env.AFFINITY_API_KEY ?? null;
  }

  if (!apiKey) {
    // No Bearer token and no fallback key — tell the client to authenticate
    if (oauthEnabled) {
      const { origin } = new URL(request.url);
      return withCors(new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        },
      }));
    }
    return withCors(new Response("Server configuration error.", { status: 500 }));
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless mode: no sessionIdGenerator. Each request is independent.
  });

  const server = createServer(apiKey, {
    v1BaseUrl: env.AFFINITY_V1_BASE_URL,
    v2BaseUrl: env.AFFINITY_V2_BASE_URL,
    cache: env.AFFINITY_CACHE,
  });
  await server.connect(transport);

  return withCors(await transport.handleRequest(request));
}
