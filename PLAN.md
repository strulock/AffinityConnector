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
- `search_people` — search contacts by name, email, domain ✔
- `get_person` — full profile + interaction history ✔
- `search_organizations` — search companies ✔
- `get_organization` — full org profile + associated people ✔

### Lists & Opportunities
- `get_lists` — list all Affinity lists ✔
- `get_list_entries` — entries in a list (deals, contacts, orgs) ✔
- `get_field_values` — custom field values for a list entry ✔

### Notes & Activity
- `get_notes` — notes on a person or org ✔
- `create_note` — add a note to a record ✔
- `get_interactions` — email/meeting history ✔

### Intelligence
- `find_intro_path` — who can intro me to a target person/org ✔
- `get_relationship_strength` — relationship score data ✔
- `summarize_relationship` — AI-generated relationship summary ✔

---

## MCP Resources to Expose

- `affinity://lists` — available lists
- `affinity://people/{id}` — person record
- `affinity://organizations/{id}` — org record

---

## Phased Roadmap

### Phase 1 — Foundation (MVP) ✔ COMPLETE
- `wrangler.toml` with `nodejs_compat`, base URL vars, secret annotation; custom domain `affinity.trulock.com`
- `src/affinity/client.ts`: `fetch`-based, Bearer auth, typed error classes (`AffinityAuthError`, `PermissionError`, `NotFoundError`, `RateLimitError`, `ServerError`), exponential backoff on 429, v1/v2 routing
- `src/index.ts`: Cloudflare Workers fetch handler, Streamable HTTP transport (stateless), `/mcp`, `/health`, and `/.well-known/oauth-protected-resource` routes; CORS headers for claude.ai browser client
- `src/server.ts`: accepts `apiKey` + base URL options; no `process.env` dependency
- MCP tools: `search_people`, `get_person`, `search_organizations`, `get_organization`
- GitHub Actions CI/CD: type-check → `wrangler deploy` → `wrangler secret put` on every push to `main`
- `AFFINITY_API_KEY` secret set; Worker live at `https://affinity.trulock.com/mcp`
- Connected and returning data in claude.ai

### Phase 2 — Lists & Pipeline ✔ COMPLETE
- `src/affinity/lists.ts`: `ListsApi` with `getLists`, `getListEntries`, `getFieldValues` (v1)
- `src/tools/lists.ts`: `get_lists`, `get_list_entries`, `get_field_values` tools
- New types: `AffinityOpportunity`, `AffinityListEntry`, `AffinityField`, `AffinityFieldValue`
- Opportunities accessible via list entries (entity_type 8) — no separate tool needed

### Phase 3 — Notes & Activity ✔ COMPLETE
- `src/affinity/notes.ts`: `NotesApi` with `getNotes`, `createNote`, `getInteractions` (v1)
- `src/tools/notes.ts`: `get_notes`, `create_note`, `get_interactions` tools
- New types: `AffinityNote`, `AffinityInteraction`
- Interaction types: 0 = email, 1 = meeting; filterable by person, org, or opportunity

### Phase 4 — Intelligence Features ✔ COMPLETE
- `src/affinity/intelligence.ts`: `IntelligenceApi` with `getRelationshipStrength` (v1)
- `src/tools/intelligence.ts`: `get_relationship_strength`, `find_intro_path`, `summarize_relationship` tools
- New type: `AffinityRelationshipStrength`
- `find_intro_path` walks target person's organizations, collects members, ranks by relationship strength
- `summarize_relationship` aggregates profile + strength + recent notes + interactions into one briefing

### Phase 5 — Polish ✔ COMPLETE
- `src/cache.ts`: `KVCache` wrapper around Cloudflare KV; no-op fallback when KV unavailable (local dev)
- Per-category TTLs: profiles 5 min, lists 10 min, list entries 5 min, notes/interactions 2 min, strength 5 min
- Cache wired into all API classes: `people.ts`, `organizations.ts`, `lists.ts`, `notes.ts`, `intelligence.ts`
- KV namespace `affinity-connector-cache` created in Cloudflare; binding added to `wrangler.toml`
- `README.md`: full tool reference, claude.ai + Claude Desktop connection instructions, deployment guide

### Phase 6 — Test Suite ✔ COMPLETE
- Framework: **Vitest** with `@vitest/coverage-v8`; 126 tests across 14 test files (157 tests as of Phase 7)
- `test/helpers/kv-mock.ts`: in-memory `KVNamespace` mock; `test/helpers/mock-server.ts`: `McpServer` mock that captures and invokes tool handlers directly
- Coverage by layer:
  - `test/cache.test.ts` — `KVCache` (no-op, hit, miss, invalid JSON, TTL)
  - `test/affinity/client.test.ts` — auth, URL building, v1/v2 routing, all error classes, 429 retry logic
  - `test/affinity/*.test.ts` — all API classes with cache hit/miss, edge cases
  - `test/tools/*.test.ts` — all 5 MCP tool modules (formatters, empty/populated results, edge cases)
  - `test/server.test.ts` — `createServer` instantiation
  - `test/index.test.ts` — Worker routing (OPTIONS, /health, /.well-known, /mcp, 404)
- Coverage thresholds enforced (build fails if not met): 95% statements, 90% branches, 95% functions, 95% lines
- Achieved: **98.8% statements, 90.4% branches, 97.1% functions, 99.7% lines**
- CI pipeline updated: `type-check → test:coverage → deploy`

### Phase 7 — Field Intelligence (Read) ✔ COMPLETE
- `src/affinity/fields.ts`: `FieldsApi` with `getFields`, `getPersonFields`, `getOrganizationFields`, `getFieldValueChanges` (v1)
- `src/tools/fields.ts`: `get_field_definitions` (scope enum: all/person/organization/list + optional `list_id`), `get_field_value_changes` tools
- New types in `types.ts`: `AffinityField`, `AffinityFieldValueChange`
- Cache: field definitions at 10 min TTL (`fields: 600`); field value changes not cached (live audit data)
- `get_field_definitions` exposes field ID, name, value type (Text/Number/Date/Location/Person/Organization/Dropdown), scope (global vs list), and constraint flags (required, multi-value, read-only)
- Wired into `server.ts`; 17 new tests → 157 total passing

---

### Phase 8 — Write: Field Values ✔ COMPLETE
- Extends `src/affinity/client.ts`: added `put` and `del` methods; 204 No Content guard in `fetchWithRetry`
- Extends `src/affinity/lists.ts`: `setFieldValue` (POST /field-values for create, PUT /field-values/{id} for update), `deleteFieldValue` (DELETE /field-values/{id})
- Extends `src/tools/lists.ts`: `set_field_value` (create or update; validates required params for create path), `delete_field_value`
- `set_field_value` accepts `field_id`, `value`, optional `field_value_id` (update path), optional `list_entry_id`/`entity_id`/`entity_type` (create path)
- Value type accepts string, number, boolean, or null (covers text, numeric, date, dropdown)
- 9 new tests (5 API, 4 tool) → 166 total passing
