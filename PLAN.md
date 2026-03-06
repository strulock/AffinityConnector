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
- `create_person` — create a new contact ✔
- `update_person` — update name, emails, or org associations ✔
- `search_organizations` — search companies ✔
- `get_organization` — full org profile + associated people ✔
- `create_organization` — create a new company ✔
- `update_organization` — update name or domain ✔

### Lists & Field Values
- `get_lists` — list all Affinity lists ✔
- `get_list_entries` — entries in a list (deals, contacts, orgs) ✔
- `get_field_values` — custom field values for a list entry ✔
- `set_field_value` — create or update a field value on a list entry ✔
- `delete_field_value` — delete a field value by ID ✔
- `add_to_list` — add a person, org, or opportunity to a list ✔
- `remove_from_list` — remove a list entry by entry ID ✔
- `get_saved_views` — list saved views for a list ✔
- `get_saved_view_entries` — fetch entries through a saved view ✔

### Field Definitions
- `get_field_definitions` — list field schemas (name, type, constraints) ✔
- `get_field_value_changes` — audit trail of field mutations ✔

### Opportunities
- `search_opportunities` — search/list deals by name ✔
- `get_opportunity` — full opportunity detail ✔
- `create_opportunity` — create a new deal ✔
- `update_opportunity` — rename or re-associate a deal ✔

### Notes & Activity
- `get_notes` — notes on a person or org ✔
- `create_note` — add a note to a record ✔
- `get_note_replies` — fetch reply thread for a note (v2) ✔
- `update_note` — update note content by ID ✔
- `delete_note` — delete a note by ID ✔
- `get_interactions` — email/meeting history (v1) ✔
- `get_emails` — email history with date-range filtering (v2) ✔
- `get_calls` — call history, v2-only ✔
- `get_meetings` — meeting history with richer metadata (v2) ✔
- `get_chat_messages` — Slack/chat message history, v2-only ✔

### Reminders
- `get_reminders` — list follow-up reminders, filterable by person/org/opportunity ✔
- `create_reminder` — create a follow-up with content, due date, and associations ✔
- `update_reminder` — reschedule, edit content, or mark completed ✔
- `delete_reminder` — delete a reminder by ID ✔

### Intelligence
- `find_intro_path` — who can intro me to a target person/org ✔
- `get_relationship_strength` — relationship score data ✔
- `summarize_relationship` — AI-generated relationship summary ✔

### Transcripts & Semantic Search (BETA)
- `semantic_search` — AI-powered natural-language company search (v2 BETA, companies only) ✔
- `get_transcripts` — list call/meeting transcripts, filterable by person/org ✔
- `get_transcript` — read full transcript content with timestamped speaker fragments ✔

### Deduplication
- `merge_persons` — merge two person records; polls until complete (DESTRUCTIVE) ✔
- `merge_companies` — merge two company records; polls until complete (DESTRUCTIVE) ✔

### Utility
- `get_whoami` — current authenticated user identity and org ✔
- `get_rate_limit` — remaining API quota and reset time ✔
- `batch_set_field_values` — update 1–100 fields on a list entry in one v2 request ✔

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
- Framework: **Vitest** with `@vitest/coverage-v8`; 126 tests across 14 test files (308 tests as of Phase 14)
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
- Wired into `server.ts`; 17 new tests added in this phase

---

### Phase 8 — Write: Field Values ✔ COMPLETE
- Extends `src/affinity/client.ts`: added `put` and `del` methods; 204 No Content guard in `fetchWithRetry`
- Extends `src/affinity/lists.ts`: `setFieldValue` (POST /field-values for create, PUT /field-values/{id} for update), `deleteFieldValue` (DELETE /field-values/{id})
- Extends `src/tools/lists.ts`: `set_field_value` (create or update; validates required params for create path), `delete_field_value`
- `set_field_value` accepts `field_id`, `value`, optional `field_value_id` (update path), optional `list_entry_id`/`entity_id`/`entity_type` (create path)
- Value type accepts string, number, boolean, or null (covers text, numeric, date, dropdown)
- 9 new tests (5 API, 4 tool) added in this phase

---

### Phase 9 — Opportunities ✔ COMPLETE
- `src/affinity/opportunities.ts`: `OpportunitiesApi` with `search`, `getById`, `create`, `update` (all v1)
- `src/tools/opportunities.ts`: `search_opportunities`, `get_opportunity`, `create_opportunity`, `update_opportunity` tools
- `search_opportunities` accepts optional `term` and `list_id` to scope results
- `get_opportunity` shows name, ID, person IDs, org IDs, list memberships, created date
- `create_opportunity` accepts `name`, optional `person_ids`/`organization_ids`; use `add_to_list` (Phase 11) to add to a pipeline
- `update_opportunity` validates at least one update field is provided; replaces associations wholesale
- Cache: opportunity profiles at 5 min TTL; `update` writes back to cache on success
- Wired into `server.ts`; 21 new tests (10 API, 11 tool) added in this phase

---

### Phase 10 — Write: People & Organizations ✔ COMPLETE
- Extends `src/affinity/people.ts`: added `create` (v1 `POST /persons`), `update` (v1 `PUT /persons/{id}`)
- Extends `src/affinity/organizations.ts`: added `create` (v1 `POST /organizations`), `update` (v1 `PUT /organizations/{id}`)
- New MCP tools in `src/tools/people.ts`: `create_person` (requires `first_name`/`last_name`; optional `emails`, `organization_ids`, `phone_numbers`), `update_person` (validates at least one field provided)
- New MCP tools in `src/tools/organizations.ts`: `create_organization` (requires `name`; optional `domain`, `person_ids`), `update_organization` (validates at least one field provided)
- `update` writes back to cache (`people:{id}`, `orgs:{id}`) on success so subsequent `getById` is served from cache
- `delete_person` / `delete_organization` intentionally omitted — destructive, hard to reverse, low AI-assistant use case
- 16 new tests (6 API, 10 tool) → 203 total passing

---

### Phase 11 — List Management & Saved Views ✔ COMPLETE
- Extends `src/affinity/lists.ts`: `addListEntry` (v1 `POST /lists/{id}/list-entries`), `removeListEntry` (v1 `DELETE /lists/{id}/list-entries/{entry_id}`), `getSavedViews` (v2 `GET /v2/lists/{id}/saved-views`, cached at list TTL), `getSavedViewEntries` (v2 `GET /v2/lists/{id}/saved-views/{viewId}/list-entries`)
- New MCP tools in `src/tools/lists.ts`: `add_to_list`, `remove_from_list`, `get_saved_views`, `get_saved_view_entries`
- `get_saved_view_entries` respects view filters/sort and supports pagination via `page_token`
- New type: `AffinitySavedView` (`id`, `list_id`, `name`, `creator_id`, `is_public`)
- Refactored test mockApi objects into shared `BASE_MOCK_API` factory for maintainability
- 15 new tests (7 API, 8 tool) → 218 total passing

---

### Phase 12 — Reminders ✔ COMPLETE
- New `src/affinity/reminders.ts`: `RemindersApi` with `getReminders` (v1, cached 2 min, separate cache key per filter combo), `createReminder`, `updateReminder`, `deleteReminder` (all v1)
- New `src/tools/reminders.ts`: `get_reminders`, `create_reminder`, `update_reminder`, `delete_reminder`
- `create_reminder` validates at least one of `person_ids`/`organization_ids`/`opportunity_ids` is non-empty; defaults missing arrays to `[]`
- `update_reminder` validates at least one field is provided; supports marking `completed: true`
- Format: `[reminder:{id}] due/completed {date} — {content} [people: …; orgs: …]`
- New type: `AffinityReminder` (`id`, `content`, `due_date`, `person_ids`, `organization_ids`, `opportunity_ids`, `creator_id`, `completed_at`, `created_at`)
- Added `CACHE_TTL.reminders: 120` to `cache.ts`
- Wired into `server.ts`; 19 new tests (9 API, 10 tool) → 237 total passing

---

### Phase 13 — v2 Rich Interactions & Note Threads ✔ COMPLETE
- New `src/affinity/interactions_v2.ts`: `InteractionsV2Api` with `getEmails`, `getCalls`, `getMeetings`, `getChatMessages` (all v2, no caching — live activity feeds)
- Per-type timestamp filter fields: emails/chats use `sent_at`, calls/meetings use `start_time`; all support `created_after`/`created_before`, pagination
- New `src/tools/interactions_v2.ts`: `get_emails`, `get_calls`, `get_meetings`, `get_chat_messages`; shared `COMMON_PARAMS` schema; `get_calls` and `get_chat_messages` noted as v2-only
- Extends `src/affinity/notes.ts`: `getNoteReplies` (v2 `GET /v2/notes/{id}/replies` — v2 main notes list excludes replies by design), `updateNote` (v1 `PUT /notes/{id}`), `deleteNote` (v1 `DELETE /notes/{id}`)
- Extends `src/tools/notes.ts`: `get_note_replies`, `update_note`, `delete_note`
- New types: `AffinityEmailV2`, `AffinityCallV2`, `AffinityMeetingV2`, `AffinityChatMessageV2`, `AffinityNoteReply`
- Wired into `server.ts`; 33 new tests (16 API, 17 tool) → 270 total passing

---

### Phase 14 — Advanced Features & Beta ✔ COMPLETE

**Semantic Search (v2 BETA):**
- New `src/affinity/semantic_search.ts`: `SemanticSearchApi` with `search` (v2 `POST /v2/search`, entity_types: ['company'])
- New `src/tools/semantic_search.ts`: `semantic_search` tool — AI-powered natural-language search; **currently supports companies only**; labeled as BETA in tool description

**Transcripts (v2 BETA):**
- New `src/affinity/transcripts.ts`: `TranscriptsApi` with `getTranscripts`, `getTranscript`, `getTranscriptFragments` (all v2)
- New `src/tools/transcripts.ts`: `get_transcripts`, `get_transcript` — list and read call/meeting transcripts with timestamped speaker fragments

**Deduplication (v2):**
- New `src/affinity/merges.ts`: `MergesApi` with `mergePersons` (POST /v2/person-merges), `mergeCompanies` (POST /v2/company-merges), `getMergeTaskStatus` (GET /v2/person-merge-tasks/{id} or /v2/company-merge-tasks/{id})
- New `src/tools/merges.ts`: `merge_persons`, `merge_companies` — DESTRUCTIVE warning in description; tools poll until task is completed/failed (up to 5 attempts × 1s) before returning
- Requires "Manage duplicates" permission + organization admin role

**Utility:**
- New `src/affinity/utility.ts`: `UtilityApi` with `getCurrentUser` (v2 GET /auth/current-user) and `getRateLimit` (v1 GET /rate-limit)
- New `src/tools/utility.ts`: `get_whoami` (user identity + org), `get_rate_limit` (remaining quota + reset time)

**Batch Field Updates (v2):**
- Extends `src/affinity/lists.ts`: `batchSetFieldValues` (POST /v2/lists/{listId}/list-entries/{listEntryId}/fields with operation: update-fields)
- Extends `src/tools/lists.ts`: `batch_set_field_values` tool — update 1–100 field values on a single list entry in one request

- Wired into `server.ts`; 38 new tests (19 API, 19 tool) → 308 total passing

**Webhooks (v1, not yet planned):**
- v1 has full webhook subscription CRUD (`GET/POST/PUT/DELETE /webhook-subscriptions`)
- Could enable event-driven workflows (e.g. notify Claude when a list entry changes)
- Not planned for current phases; add as Phase 15 if needed

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
- MCP endpoint: `https://affinity.trulock.com/mcp`

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

### CI/CD: GitHub Actions
- Workflow at `.github/workflows/deploy.yml` triggers on every push to `main`
- Steps: checkout → `npm ci` → type-check → `wrangler deploy` → `wrangler secret put AFFINITY_API_KEY`
- Requires two GitHub repo secrets: `CLOUDFLARE_API_TOKEN` and `AFFINITY_API_KEY`

### Configuration (`wrangler.toml`)
```toml
name = "affinity-connector"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[vars]
AFFINITY_V1_BASE_URL = "https://api.affinity.co"
AFFINITY_V2_BASE_URL = "https://api.affinity.co/v2"

# AFFINITY_API_KEY — set via: wrangler secret put AFFINITY_API_KEY
```

---

## Key Affinity API Details

- **Auth**: Bearer auth — API key as Bearer token (Authorization: Bearer <key>)
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

- **v1 base URL**: `https://api.affinity.co/...`
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
│   ├── index.ts              # Worker entry point (fetch handler + MCP server)
│   ├── server.ts             # API class instantiation + tool registration
│   ├── cache.ts              # KVCache wrapper with per-category TTLs
│   ├── affinity/
│   │   ├── client.ts         # fetch-based client; Bearer auth; error classes; retry
│   │   ├── people.ts         # People endpoints (v2)
│   │   ├── organizations.ts  # Organization endpoints (v2)
│   │   ├── lists.ts          # List, list-entry, and field-value endpoints (v1)
│   │   ├── notes.ts          # Notes and interactions endpoints (v1)
│   │   ├── intelligence.ts   # Relationship strength endpoints (v1)
│   │   ├── fields.ts         # Field definition and audit endpoints (v1)
│   │   ├── opportunities.ts  # Opportunity CRUD endpoints (v1)
│   │   ├── reminders.ts      # Reminder CRUD endpoints (v1)
│   │   ├── interactions_v2.ts # v2 emails, calls, meetings, chat messages
│   │   ├── semantic_search.ts # v2 BETA AI-powered company search
│   │   ├── transcripts.ts    # v2 BETA call/meeting transcripts + fragments
│   │   ├── merges.ts         # v2 async deduplication (person + company merges)
│   │   ├── utility.ts        # v2 current user + v1 rate limit
│   │   └── types.ts          # TypeScript types for all API responses
│   └── tools/
│       ├── people.ts         # search_people, get_person, create_person, update_person
│       ├── organizations.ts  # search_organizations, get_organization, create_organization, update_organization
│       ├── lists.ts          # get_lists, get_list_entries, get/set/delete/batch_set_field_value(s), add/remove_from_list, get_saved_views/entries
│       ├── notes.ts          # get_notes, create_note, get_interactions, get_note_replies, update_note, delete_note
│       ├── intelligence.ts   # get_relationship_strength, find_intro_path, summarize_relationship
│       ├── fields.ts         # get_field_definitions, get_field_value_changes
│       ├── opportunities.ts  # search/get/create/update_opportunity
│       ├── reminders.ts      # get/create/update/delete_reminder
│       ├── interactions_v2.ts # get_emails, get_calls, get_meetings, get_chat_messages
│       ├── semantic_search.ts # semantic_search (BETA)
│       ├── transcripts.ts    # get_transcripts, get_transcript (BETA)
│       ├── merges.ts         # merge_persons, merge_companies
│       └── utility.ts        # get_whoami, get_rate_limit
├── test/
│   ├── helpers/
│   │   ├── kv-mock.ts        # In-memory KVNamespace mock
│   │   └── mock-server.ts    # McpServer mock for tool handler testing
│   ├── affinity/             # API class unit tests
│   └── tools/                # MCP tool unit tests
├── .dev.vars                 # Local dev secrets (gitignored)
├── wrangler.toml             # Workers config (deploy target, KV binding, vars)
├── package.json
├── tsconfig.json
└── README.md
```
