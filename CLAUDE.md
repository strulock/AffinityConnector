# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AffinityConnector is a production Cloudflare Worker that exposes [Affinity CRM](https://www.affinity.co/) as an MCP (Model Context Protocol) server, enabling Claude to read and write CRM data on behalf of a user.

**Stack:** TypeScript · Cloudflare Workers · Cloudflare KV (caching) · Vitest (tests)
**Protocol:** MCP Streamable HTTP transport (stateless, one server instance per request)
**APIs used:** Affinity v1 REST (`https://api.affinity.co`) and v2 REST (`https://api.affinity.co/v2`)

## Architecture

```
Claude (browser) → HTTPS → Cloudflare Worker (src/index.ts)
                                    │
                  ┌─────────────────┼──────────────────┐
                  │                 │                  │
            /mcp endpoint     /webhook endpoint    /health
                  │                 │
         MCP server (src/server.ts) │
         47 registered tools        │
                  │           AffinityWebhookEvent
         src/affinity/*.ts    stored in KV (7-day TTL)
         API wrapper classes
```

## Key Files

| Path | Purpose |
|------|---------|
| `src/index.ts` | Worker entry point — routes requests, CORS, JWT validation |
| `src/server.ts` | Assembles the MCP server and registers all tool groups |
| `src/affinity/client.ts` | Base HTTP client with auth, retry, error classification |
| `src/affinity/*.ts` | One class per Affinity entity (PeopleApi, ListsApi, etc.) |
| `src/tools/*.ts` | MCP tool registrations — one file per entity group |
| `src/cache.ts` | Thin KV wrapper + `stableKey()` for deterministic cache keys |
| `src/access.ts` | Cloudflare Access JWT verification (opt-in defense-in-depth) |

## Development

```bash
npm install          # install dependencies
npm test             # run all tests (Vitest)
npm run typecheck    # TypeScript type check
npx wrangler dev     # local dev server (requires .dev.vars)
npx wrangler deploy  # deploy to Cloudflare
```

## Environment Variables

Set in `wrangler.toml` (vars) or Cloudflare dashboard (secrets):

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `AFFINITY_API_KEY` | Secret | Yes | Affinity API key |
| `AFFINITY_CACHE` | KV binding | Yes | KV namespace for caching |
| `AFFINITY_WEBHOOK_SECRET` | Secret | No | Shared secret for webhook validation |
| `CLOUDFLARE_ACCESS_JWT_VALIDATION` | Var (bool) | No | Enable Cloudflare Access JWT check on /mcp |
| `CLOUDFLARE_ACCESS_AUD` | Secret | If above=true | Access application audience tag |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | Var | If above=true | e.g. `myteam.cloudflareaccess.com` |

## Conventions

- **Error handling:** All tool handlers wrap API calls in `try/catch` and return `toolError(e)` for user-friendly messages.
- **Cache keys:** Use `stableKey(prefix, params)` for object-derived keys; plain template strings for scalar keys.
- **Entity types:** `0 = person`, `1 = organization`, `8 = opportunity` (Affinity v1 numeric codes).
- **Pagination:** v1 uses `page_size` + `page_token`; v2 uses `page_size` + `page_token` with `next_page_token` in the response.
- **Tests:** Each API class and tool group has a corresponding test file under `test/`. Mock the API layer, not HTTP.

## License

GNU General Public License v3.0.
