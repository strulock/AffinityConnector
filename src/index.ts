import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server.js";
import { KVCache } from "./cache.js";
import type { AffinityWebhookEvent } from "./affinity/types.js";

export interface Env {
  AFFINITY_API_KEY: string;
  AFFINITY_V1_BASE_URL?: string;
  AFFINITY_V2_BASE_URL?: string;
  AFFINITY_CACHE: KVNamespace;
  AFFINITY_WEBHOOK_SECRET?: string;
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

    // MCP auth discovery endpoint (RFC 9728).
    // No authorization_servers means no OAuth required.
    if (pathname === "/.well-known/oauth-protected-resource") {
      const { origin } = new URL(request.url);
      return Response.json({ resource: origin }, { headers: CORS_HEADERS });
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

  const secret = request.headers.get("X-Affinity-Webhook-Secret");
  if (!env.AFFINITY_WEBHOOK_SECRET || !secret || !(await timingSafeEqual(secret, env.AFFINITY_WEBHOOK_SECRET))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: AffinityWebhookEvent;
  try {
    payload = await request.json() as AffinityWebhookEvent;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (env.AFFINITY_CACHE && payload.id) {
    const cache = new KVCache(env.AFFINITY_CACHE);
    const ttl = 7 * 24 * 3600; // 7 days
    await cache.set(`webhook:event:${payload.id}`, payload, ttl);
    // Update recency index: prepend new ID, deduplicate, cap at 100.
    const recent = (await cache.get<string[]>("webhook:recent")) ?? [];
    const updated = [payload.id, ...recent.filter(id => id !== payload.id)].slice(0, 100);
    await cache.set("webhook:recent", updated, ttl);
  }

  return new Response("OK", { status: 200 });
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (!env.AFFINITY_API_KEY) {
    return withCors(new Response("AFFINITY_API_KEY secret is not configured.", { status: 500 }));
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless mode: no sessionIdGenerator. Each request is independent.
  });

  const server = createServer(env.AFFINITY_API_KEY, {
    v1BaseUrl: env.AFFINITY_V1_BASE_URL,
    v2BaseUrl: env.AFFINITY_V2_BASE_URL,
    cache: env.AFFINITY_CACHE,
  });
  await server.connect(transport);

  return withCors(await transport.handleRequest(request));
}
