import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server.js";

export interface Env {
  AFFINITY_API_KEY: string;
  AFFINITY_V1_BASE_URL?: string;
  AFFINITY_V2_BASE_URL?: string;
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
  });
  await server.connect(transport);

  return withCors(await transport.handleRequest(request));
}
