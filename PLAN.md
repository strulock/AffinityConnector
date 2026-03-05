# AffinityConnector — Development Plan

## What It Is

An **MCP (Model Context Protocol) server** that gives Claude direct access to your Affinity CRM data, enabling natural language queries, relationship intelligence, and AI-assisted workflows against your live Affinity data.

Deployed as a **Cloudflare Worker** for multi-user, shared team access — no server to maintain, globally distributed, always HTTPS.

---

## Architecture

```
User (Claude Desktop / claude.ai)
        │
        │  HTTPS + Cloudflare Access (team SSO / auth)
        ▼
┌──────────────────────────────┐
│   Cloudflare Worker          │
│  ┌────────────────────────┐  │
│  │    MCP Server Layer    │  │  ← Streamable HTTP transport
│  └──────────┬─────────────┘  │
│  ┌──────────▼─────────────┐  │
│  │   Affinity API Client  │  │  ← fetch-based REST wrapper
│  └──────────┬─────────────┘  │
│  ┌──────────▼─────────────┐  │
│  │  Workers Secrets/Env   │  │  ← API key, config (no .env)
│  └────────────────────────┘  │
└──────────────────────────────┘
        │
        │  HTTPS / REST
        ▼
  Affinity CRM API (affinity.co)
```

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | **TypeScript** | MCP SDK is TypeScript-first; strong typing for API responses |
| Runtime | **Cloudflare Workers** (V8 isolate) | Serverless, globally distributed, always HTTPS |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK — Workers-compatible with Streamable HTTP |
| Transport | **Streamable HTTP** | Request/response based; no persistent connection needed; Workers-native |
| HTTP Client | `fetch` | Built into Workers runtime; replaces axios |
| Config | **Workers Secrets** + `wrangler.toml` | Encrypted secrets for API key; no .env in production |
| Auth | **Cloudflare Access** | Gates MCP endpoint to team members; zero auth code required |
| Build/Deploy | `wrangler` | Cloudflare Workers CLI; handles TypeScript natively |
| Package manager | `npm` | Standard |

---

## MCP Tools to Expose

### People & Organizations
- `search_people` — search contacts by name, email, domain
- `get_person` — full profile + interaction history
- `search_organizations` — search companies
- `get_organization` — full org profile + associated people

### Lists & Opportunities
- `get_lists` — list all Affinity lists
- `get_list_entries` — entries in a list (deals, contacts, orgs)
- `get_opportunities` — pipeline/deal data

### Notes & Activity
- `get_notes` — notes on a person or org
- `create_note` — add a note to a record
- `get_interactions` — email/meeting history

### Intelligence
- `find_intro_path` — who can intro me to a target person/org
- `get_relationship_strength` — relationship score data
- `summarize_relationship` — AI-generated relationship summary

---

## MCP Resources to Expose

- `affinity://lists` — available lists
- `affinity://people/{id}` — person record
- `affinity://organizations/{id}` — org record

---

## Phased Roadmap

### Phase 1 — Foundation (MVP) ✔ COMPLETE
- `wrangler.toml` with `nodejs_compat`, base URL vars, secret annotation
- `src/affinity/client.ts`: `fetch`-based, HTTP Basic auth, typed error classes, exponential backoff on 429, v1/v2 routing
- `src/index.ts`: Cloudflare Workers fetch handler, Streamable HTTP transport (stateless), `/mcp` and `/health` routes
- `src/server.ts`: accepts `apiKey` param; no `process.env` dependency
- MCP tools: `search_people`, `get_person`, `search_organizations`, `get_organization`
- TypeScript compiles clean against `@cloudflare/workers-types`
- **Remaining before go-live**: set `AFFINITY_API_KEY` secret, configure Cloudflare Access policy

### Phase 2 — Lists & Pipeline
- List enumeration and entry retrieval
- Opportunity/deal data
- Field values (custom fields support)

### Phase 3 — Notes & Activity
- Read notes from records
- Write notes (create_note tool)
- Interaction history (emails, meetings)

### Phase 4 — Intelligence Features
- Relationship strength scoring
- Intro path finder
- Meeting prep brief generation (combines Affinity data + Claude synthesis)

### Phase 5 — Polish
- Caching layer using **Cloudflare KV** (avoid redundant API calls)
- Claude Desktop + claude.ai connection documentation
- README with setup and deployment guide

---

## Deployment

### Runtime: Cloudflare Workers
- Deployed globally via `wrangler deploy`
- No server provisioning or maintenance
- Free tier supports low-to-moderate usage; paid tier for high volume

### Transport: Streamable HTTP
- The modern MCP transport (introduced 2025); replaces SSE
- Stateless request/response — natural fit for Workers (no Durable Objects needed)
- Supported by Claude Desktop and claude.ai
- MCP endpoint: `https://<worker-name>.<account>.workers.dev/mcp`

### Authentication: Cloudflare Access
- Protects the Worker URL at the network layer — no auth code to write
- Team members authenticate via your identity provider (Google, Okta, GitHub, etc.)
- Configure an Access Application pointing at the Worker URL
- Service tokens available for programmatic/CI access

### Secrets Management
- Affinity API key stored as a **Worker Secret** (encrypted at rest, injected at runtime)
- Set via: `wrangler secret put AFFINITY_API_KEY`
- Never committed to source control; no `.env` file in production
- Non-sensitive config (e.g. API base URLs) in `wrangler.toml` as `[vars]`

### Configuration (`wrangler.toml`)
```toml
name = "affinity-connector"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[vars]
AFFINITY_V1_BASE_URL = "https://api.affinity.co/v1"
AFFINITY_V2_BASE_URL = "https://api.affinity.co/v2"

# AFFINITY_API_KEY — set via: wrangler secret put AFFINITY_API_KEY
```

---

## Key Affinity API Details

- **Auth**: HTTP Basic auth — API key as password, empty username
- **Rate limits**: ~900 req/min (standard)
- **Docs**: https://affinity.co/documentation

### API Versions

Use whichever version exposes the richer or more reliable data for each domain:

| Domain | Preferred Version | Notes |
|--------|------------------|-------|
| People | v2 | Richer field structure, pagination |
| Organizations | v2 | Richer field structure, pagination |
| Lists & entries | v1 | v2 list support is limited |
| Notes | v1 | Only version available |
| Interactions | v1 | Only version available |
| Relationship intelligence | v1 | Strength scores, intro paths |

- **v1 base URL**: `https://api.affinity.co/v1/...`
- **v2 base URL**: `https://api.affinity.co/v2/...`
- The API client should support both base paths and document which version each method uses.
- If Affinity expands v2 coverage over time, prefer migrating to v2 for consistency.

---

## Error Handling

Basic error handling belongs in Phase 1 — the API client should handle these cases from the start to make development and debugging tractable.

### HTTP Error Classes

| Status | Meaning | Handling |
|--------|---------|----------|
| 401 | Bad/missing API key | Throw `AuthError` with clear message |
| 403 | Insufficient permissions | Throw `PermissionError` |
| 404 | Record not found | Return `null` or throw `NotFoundError` (tool-dependent) |
| 429 | Rate limit exceeded | Retry with exponential backoff (up to 3 attempts) |
| 5xx | Affinity server error | Throw `AffinityServerError`, surface to MCP caller |

### Implementation Notes

- Wrap all `fetch` calls in a shared `apiRequest()` helper that handles the above cases uniformly.
- MCP tool handlers should catch errors and return them as structured MCP error responses rather than crashing the server.
- Log errors with enough context (endpoint, status code, request ID if available) to diagnose issues.
- Do not silently swallow errors — surface them clearly to Claude so it can inform the user.

---

## Target File Structure

```
AffinityConnector/
├── src/
│   ├── index.ts          # Worker entry point (fetch handler + MCP server)
│   ├── server.ts         # Tool/resource registration
│   ├── affinity/
│   │   ├── client.ts     # Affinity API client (fetch-based, apiRequest helper)
│   │   ├── people.ts     # People endpoints (v2)
│   │   ├── organizations.ts  # Org endpoints (v2)
│   │   ├── lists.ts      # List endpoints (v1)
│   │   ├── notes.ts      # Notes endpoints (v1)
│   │   └── types.ts      # TypeScript types for API responses
│   └── tools/
│       ├── people.ts     # MCP tool handlers
│       ├── organizations.ts
│       ├── lists.ts
│       └── notes.ts
├── .dev.vars             # Local dev secrets (gitignored)
├── .env.example          # Documents required secrets
├── wrangler.toml         # Workers config (deploy target, vars, bindings)
├── package.json
├── tsconfig.json
└── README.md
```