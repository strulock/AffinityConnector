import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server.js";

export interface Env {
  AFFINITY_API_KEY: string;
  AFFINITY_V1_BASE_URL?: string;
  AFFINITY_V2_BASE_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/mcp") {
      return handleMcp(request, env);
    }

    if (pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (!env.AFFINITY_API_KEY) {
    return new Response("AFFINITY_API_KEY secret is not configured.", { status: 500 });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless mode: no sessionIdGenerator. Each request is independent.
    // Suitable for Cloudflare Workers where no per-session state is maintained.
  });

  const server = createServer(env.AFFINITY_API_KEY);
  await server.connect(transport);

  return transport.handleRequest(request);
}
