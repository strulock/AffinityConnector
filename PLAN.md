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
- `search_all` — search people, orgs, and opportunities in parallel; unified interleaved results ✔
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
- `batch_set_field_values` — update 1–100 fields on a list entry in one v2 request ✔
- `add_to_list` — add a person, org, or opportunity to a list ✔
- `remove_from_list` — remove a list entry by entry ID ✔
- `get_saved_views` — list saved views for a list ✔
- `get_saved_view_entries` — fetch entries through a saved view ✔
- `get_pipeline_summary` — group list entries by a dropdown field value and return counts ✔

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
- ~~`get_interactions`~~ — removed in Phase 15 (v1 deprecated; use `get_emails`/`get_meetings` instead)
- `get_emails` — email history with date-range filtering (v2) ✔
- `get_calls` — call history, v2-only ✔
- `get_meetings` — meeting history with richer metadata (v2) ✔
- `get_chat_messages` — Slack/chat message history, v2-only ✔
- `get_activity_timeline` — unified sorted timeline of emails, meetings, and notes for a person or org ✔

### Reminders
- `get_reminders` — list follow-up reminders, filterable by person/org/opportunity ✔
- `create_reminder` — create a follow-up with content, due date, and associations ✔
- `update_reminder` — reschedule, edit content, or mark completed ✔
- `delete_reminder` — delete a reminder by ID ✔

### Intelligence
- `find_intro_path` — who can intro me to a target person/org ✔
- `get_relationship_strength` — relationship score data ✔
- `summarize_relationship` — AI-generated relationship summary ✔

### Webhooks
- `list_webhooks` — list registered subscriptions with IDs, URLs, event types, state ✔
- `create_webhook` — register a new subscription; target URL defaults to Worker `/webhook` ✔
- `update_webhook` — toggle active/inactive, change URL or event list ✔
- `delete_webhook` — remove a subscription by ID ✔
- `get_recent_events` — query KV event log; filter by type or entity; newest-first ✔

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
- Framework: **Vitest** with `@vitest/coverage-v8`; 126 tests across 14 test files at Phase 6 (308 tests across 30 test files as of Phase 14)
- `test/helpers/kv-mock.ts`: in-memory `KVNamespace` mock; `test/helpers/mock-server.ts`: `McpServer` mock that captures and invokes tool handlers directly
- Coverage by layer:
  - `test/cache.test.ts` — `KVCache` (no-op, hit, miss, invalid JSON, TTL)
  - `test/affinity/client.test.ts` — auth, URL building, v1/v2 routing, all error classes, 429 retry logic
  - `test/affinity/*.test.ts` — all API classes with cache hit/miss, edge cases (13 files)
  - `test/tools/*.test.ts` — all 13 MCP tool modules (formatters, empty/populated results, edge cases)
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

---

### Phase 15 — Bug Fixes: Deprecated v1 Endpoints ✔ COMPLETE

**Root cause:** Two v1 Affinity endpoints (`/interactions` and `/relationships-strengths`) returned 422 in production. The `/interactions` endpoint was deprecated in favor of v2 per-channel tools already in service. `summarize_relationship` inherited both failures uncaught.

**Change 1 — `get_relationship_strength`: switched to v2**
- `src/affinity/intelligence.ts`: added `'v2'` as third arg to `client.get('/relationships-strengths', ...)` — v1 endpoint returns 422 for all inputs
- Updated test to verify v2 base URL is used

**Change 2 — `get_interactions`: removed (v1 deprecated)**
- Removed `getInteractions()` from `src/affinity/notes.ts` — v1 `/interactions` endpoint is deprecated; v2 per-channel tools (`get_emails`, `get_calls`, `get_meetings`, `get_chat_messages`) are the replacement
- Removed `get_interactions` MCP tool from `src/tools/notes.ts`
- Removed `AffinityInteraction` type from `src/affinity/types.ts`
- Removed `CACHE_TTL.interactions` from `src/cache.ts`
- Removed `get_interactions` from `README.md` tool reference

**Change 3 — `summarize_relationship`: replaced v1 interaction call with v2**
- `src/tools/intelligence.ts`: replaced `notesApi.getInteractions()` (which threw uncaught 422) with parallel `interactionsV2Api.getEmails()` + `interactionsV2Api.getMeetings()` calls
- Added `InteractionsV2Api` parameter to `registerIntelligenceTools()`; updated `src/server.ts` call site
- Updated interaction formatting to use v2 field names (`sent_at`, `start_time`, `title`)

**Change 4 — Tests updated**
- Removed `NotesApi.getInteractions` and `get_interactions tool` test suites (~9 tests removed)
- Updated `summarize_relationship` tests: replaced single `getInteractions` fetch entry with parallel `getEmails` + `getMeetings` v2 response pairs (`{data: [...]}`)
- Removed `getInteractions` from all `NotesApi` mock objects in notes tool tests
- Added 7 new `summarize_relationship` tests to restore branch coverage: meeting/email null-label fallbacks, `primary_email`/`domain` null fallbacks, `last_activity_date` null fallbacks for both person and org flows, 2-connector `find_intro_path` to exercise sort comparator
- Updated `CACHE_TTL` test to remove `interactions` assertion
- Net: 308 → 306 tests; coverage restored to **90.03% branches**, 97.27% statements, 99.21% lines (all thresholds pass)

---

### Phase 16 — Webhooks: Subscriptions, Receiver, Event Log ✔ COMPLETE

#### Overview

Three cooperating parts: MCP tools to manage Affinity webhook subscriptions, an inbound HTTP receiver endpoint on the Worker, and a KV-backed event log that Claude can query.

**Affinity webhook events available (v1 `/webhook-subscriptions`):**

| Event | Description |
|-------|-------------|
| `person.created` | New person added to workspace |
| `person.updated` | Person record edited |
| `organization.created` | New org added |
| `organization.updated` | Org record edited |
| `note.created` | Note written on any record |
| `field_value.created` | Custom field value set |
| `field_value.updated` | Custom field value changed |
| `field_value.deleted` | Custom field value removed |
| `list_entry.created` | Record added to a list |
| `list_entry.deleted` | Record removed from a list |

---

#### Part A — Webhook subscription management tools

New `src/affinity/webhooks.ts`: `WebhooksApi` with:
- `listWebhooks()` — `GET /webhook-subscriptions` (v1)
- `createWebhook(url, subscriptions[])` — `POST /webhook-subscriptions` (v1)
- `updateWebhook(id, params)` — `PUT /webhook-subscriptions/{id}` (v1)
- `deleteWebhook(id)` — `DELETE /webhook-subscriptions/{id}` (v1)

New `src/tools/webhooks.ts`:
- `list_webhooks` — list all registered subscriptions with IDs, URLs, event types, and active status
- `create_webhook` — register a new subscription; target URL defaults to `https://affinity.trulock.com/webhook`
- `update_webhook` — toggle active/inactive or change URL/event list
- `delete_webhook` — remove a subscription by ID

New type: `AffinityWebhookSubscription` (`id`, `webhook_url`, `subscriptions[]`, `state: active|inactive`, `created_at`)

---

#### Part B — Inbound webhook receiver

New route in `src/index.ts`: `POST /webhook`

**Prerequisites (Cloudflare dashboard — no code change):**
- The existing Cloudflare Access policy gates all traffic to `affinity.trulock.com/*`
- Add a **Bypass rule** (or Skip rule) in the Access Application for the path `/webhook` — this lets Affinity POST events without needing to authenticate through Access
- Affinity authenticates payloads via HMAC-SHA256 signature instead (see signature verification below)
- See deployment notes for step-by-step Access bypass configuration

**Signature verification:**
- Affinity sends `X-Affinity-Webhook-Secret` header containing the secret set on the subscription
- Worker stores the expected secret as `AFFINITY_WEBHOOK_SECRET` Worker Secret (`wrangler secret put AFFINITY_WEBHOOK_SECRET`)
- Receiver compares header value against the stored secret; returns `401` on mismatch; returns `200` immediately on match (Affinity will retry on non-2xx)

**Event storage (KV):**
- On verified receipt, write event to KV: `webhook:event:{event_id}` → JSON payload, TTL 7 days
- Also write to a recency index: `webhook:recent` → array of last 100 event IDs (trimmed on write)
- `event_id` taken from Affinity payload (`id` field); duplicate deliveries are naturally idempotent

---

#### Part C — Event query tool

New tool in `src/tools/webhooks.ts`:
- `get_recent_events` — reads `webhook:recent` index from KV, fetches corresponding event payloads, returns them sorted newest-first; accepts optional `event_type` and `entity_id` filters; default limit 20

This lets Claude answer "what changed in Affinity since we last talked?" without polling the API.

---

#### New Worker Secret

```
wrangler secret put AFFINITY_WEBHOOK_SECRET
```

Set to the secret string you configure in Affinity when creating the webhook subscription. Must match exactly.

---

#### Cloudflare Access bypass — deployment note

The `/webhook` route must be excluded from the Access policy so Affinity can POST without SSO. Two options:

**Option 1 (preferred): Bypass rule on the existing Access Application**
- In Cloudflare Zero Trust → Access → Applications → your `affinity.trulock.com` application
- Add a **Policy** with Action = `Bypass` and a Path include rule matching `/webhook`
- This passes Affinity's requests directly to the Worker; no credentials required for that path
- All other paths (`/mcp`, `/health`, etc.) remain Access-protected

**Option 2: Second Worker route**
- Deploy a second Worker at `webhook.trulock.com` (or `affinity.trulock.com/webhook` without Access)
- More infrastructure to maintain; only needed if the Access policy can't do path-level bypass

See PLAN.md deployment notes and the Cloudflare Access guidance section at the bottom of this file for step-by-step instructions.

---

#### Wiring

- `WebhooksApi` and `get_recent_events` wired into `server.ts`
- Receiver handler wired into `src/index.ts` alongside existing `/mcp`, `/health`, `/.well-known` routes
- KV namespace reused (`affinity-connector-cache`) — webhook events share the namespace with API cache entries; key prefixes prevent collisions
- 306 → 336 tests after Phase 16 (9 API, 15 tool, 9 receiver in index.test.ts); coverage: 97.48% statements, 90.67% branches, 98.97% functions, 99.27% lines (all thresholds pass)

---

### Phase 17 — Security Hardening, Coverage Backfill, Pipeline Summary ✅ Complete (357 tests, 94.67% branch coverage)

#### Part A — Security: Timing-safe webhook secret comparison

**Problem:** The current `secret !== env.AFFINITY_WEBHOOK_SECRET` string comparison in `src/index.ts` is vulnerable to timing attacks. An attacker who can send many requests can measure response-time differences to brute-force the secret one character at a time.

**Fix:** Replace with a constant-time comparison using the Web Crypto API (implemented in `src/index.ts`):
```typescript
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
```

Uses a single fixed HMAC key to derive MACs of both inputs, then compares them with a fixed-length XOR loop (no early exit). Workers runtime exposes `crypto.subtle` natively — no Node.js imports needed.

**Tests:** `test/index.test.ts` — 8 webhook receiver tests cover: missing secret header (401), wrong secret (401), no secret configured (401), correct secret (200), non-POST method (405), invalid JSON (400), KV storage verified, duplicate event deduplication.

---

#### Part B — CI/CD: Add AFFINITY_WEBHOOK_SECRET to deploy workflow

**Problem:** `.github/workflows/deploy.yml` provisions only `AFFINITY_API_KEY` via `wrangler secret put`. `AFFINITY_WEBHOOK_SECRET` must be set manually after deploy, which is easy to forget and breaks webhook delivery on a fresh deploy.

**Fix:** Add `wrangler secret put AFFINITY_WEBHOOK_SECRET` step to the deploy job, guarded by a new GitHub repo secret `AFFINITY_WEBHOOK_SECRET`. Update the CI/CD section of this file to reflect the three required secrets.

---

#### Part C — Coverage backfill (21 tests added)

The following files had branch-coverage gaps from earlier phases. Targeted tests were added:

| File | Before | After | Tests added | Notes |
|------|--------|-------|-------------|-------|
| `src/tools/merges.ts` | 63% | 100% | 2 | Exhaustion path (6 `getMergeTaskStatus` calls); `merge_companies` polling with `'company'` type arg |
| `src/tools/transcripts.ts` | 67% | 100% | 3 | `null` title + no associations; `null` speaker label; fragment pagination token |
| `src/tools/notes.ts` | 79% | 100% | 1 | Note with both `person_ids: []` and `organization_ids: []` covers all three `if` false branches |
| `src/tools/reminders.ts` | 78% | 100% | 5 | Org-only; opp-only; all-empty arrays; `organization_ids` only create; `person_ids: []` (truthy but length 0) create |
| `src/tools/utility.ts` | 50% | 100% | 2 | `organization_name: null`; both names empty (`|| '(unknown)'` fallback) |
| `src/tools/lists.ts` | 98% | 100% | 1 | Object value without `text` property (hits `JSON.stringify` in `valueLabel`) |
| `src/affinity/lists.ts` | — | — | 2 | `getFieldValuesByList` correct URL params; non-array response returns `[]` |

Achieved branch coverage: **94.67%** overall (target was ≥93%).

---

#### Part D — New tool: `get_pipeline_summary`

Aggregate list entries by a dropdown field value to answer "how many deals are in each stage?" without Claude having to iterate entries manually.

**API approach:** New `ListsApi.getFieldValuesByList(listId, fieldId)` method — single `GET /field-values?list_id={id}&field_id={id}` request returns all values for the field across the entire list. Much more efficient than the N+1 approach originally sketched.

**Tool signature:**
```
get_pipeline_summary(list_id: number, field_id: number)
  → stage counts, e.g. "Prospecting: 2\nQualified: 1\n3 entries total"
```

**Implementation (`src/tools/lists.ts`, `src/affinity/lists.ts`):**
1. Call `api.getFieldValuesByList(list_id, field_id)` — single request
2. Group by `valueLabel(fv.value)` — handles string, number, object with `text` property, object without `text` (→ `JSON.stringify`), null/undefined (→ `'(unset)'`)
3. Sort groups by count descending; return summary with field name header and total count

**New type:** None — uses existing `AffinityFieldValue`.

**Tests:** 6 tests (multi-group counts, empty field values, object with `text`, object without `text` → JSON, null → `(unset)`, missing field metadata → `Field {id}`).

---

#### Wiring

- Timing-safe comparison replaces `!==` in `handleWebhook` in `src/index.ts`
- CI/CD: `deploy.yml` gains one `wrangler secret put` step and one GitHub secret
- `get_pipeline_summary` registered in `server.ts` alongside existing list tools
- 336 → 357 tests after Phase 17 (branch coverage: 94.67%)

---

### Phase 18 — Payload Guard, Cache Invalidation, Cross-entity Search, Event Enrichment ✅ Complete (377 tests, 93.52% branch coverage)

#### Part A — Webhook payload size guard

**Problem:** Any caller that reaches `/webhook` before secret verification could POST a large body, causing the Worker to buffer unnecessary memory before the secret check rejects it.

**Implemented:** `Content-Length` header check added to `handleWebhook` in `src/index.ts`, placed before the secret comparison. Requests with `Content-Length > 65536` (64 KB) return `413 Payload Too Large` immediately. No body is consumed.

**Tests:** 1 new test in `test/index.test.ts` — request with `Content-Length: 65537` returns 413.

---

#### Part B — Cache invalidation on write

**Problem:** When `create_person`, `create_organization`, `update_person`, etc. succeed, the old search-results cache entries (`people:search:*`, `orgs:search:*`) still contain stale data. Claude may see outdated results until TTL expires (5–10 min).

**Implemented:** Added `delete(key)` and `deleteWithPrefix(prefix)` to `KVCache` (`src/cache.ts`). `deleteWithPrefix` uses `kv.list({ prefix })` to enumerate matching keys then deletes them in parallel. `PeopleApi.create` and `PeopleApi.update` call `deleteWithPrefix('people:search:')` after each successful write; `OrganizationsApi.create` and `OrganizationsApi.update` do the same with `'orgs:search:'`. Updated `test/helpers/kv-mock.ts` to support real prefix-filtered listing (was previously a stub returning empty).

**Tests:** 4 new API tests (create/update cache invalidation for people and orgs); 2 new `KVCache` tests (`delete` removes a key; `deleteWithPrefix` removes matching keys but not others).

---

#### Part C — Cross-entity search (`search_all`)

A single tool that queries people, organizations, and opportunities in parallel and returns a unified result — useful when Claude doesn't know what type of record the user is asking about.

**Implemented:** New `src/tools/search_all.ts`; `registerSearchAllTool(server, peopleApi, orgsApi, oppsApi)` wired into `src/server.ts`.

**Tool signature:**
```
search_all(query: string, limit?: number)  [default limit: 10 per type]
  → [person:1] Alice Smith <alice@acme.com>
     [org:10] Acme Corp (acme.com)
     [opp:50] Acme Series A
```
Results are interleaved by position (person[0], org[0], opp[0], person[1], …). Header line shows total count and per-type breakdown. Returns "No results found" when all three APIs return empty.

**Implementation:** `Promise.all([...search, ...search, ...search])` — three parallel API calls, no new Affinity endpoints.

**Tests:** 6 tests in `test/tools/search_all.test.ts` — no results, unified interleaved output, interleave order assertion, single-type results, limit/query forwarding, domain fallback.

---

#### Part D — Webhook event enrichment

When `get_recent_events` returns results, optionally hydrate each event with the current entity record from the API (or cache).

**Implemented:** `get_recent_events` in `src/tools/webhooks.ts` gains an `enrich: boolean` parameter (default false). `registerWebhookTools` signature extended with `peopleApi: PeopleApi` and `orgsApi: OrganizationsApi`; wired in `src/server.ts`.

When `enrich: true`:
- Enrichment is capped at 5 events to stay within rate limits; remaining events return base format
- Entity ID taken from `body.id` or `body.entity_id` (whichever is a number)
- `person.*` events → `PeopleApi.getById` → appends `→ Name <email>`
- `organization.*` events → `OrgsApi.getById` → appends `→ Org name`
- Other event types and API errors fall back to base line silently

**Tests:** 5 new tests in `test/tools/webhooks.test.ts` — person enrichment, org enrichment, error fallback, 5-event cap (7 events → only 5 API calls), default no enrichment.

---

### Phase 19 — Tool-level Error Handling ✅ COMPLETE

**Problem:** Every MCP tool that calls the Affinity API can throw. Currently `AffinityNotFoundError`, `AffinityPermissionError`, `AffinityServerError`, and network errors propagate through the MCP layer as raw protocol errors. Claude surfaces these to the user as generic "tool execution failed" messages with no actionable detail — a 404 on a bad person ID looks identical to a 500.

#### Implementation

New `src/tools/_error.ts` — shared helper:
```typescript
export function toolError(e: unknown): { content: [{ type: 'text'; text: string }] } | never {
  if (e instanceof AffinityNotFoundError)    return { content: [{ type: 'text', text: `Not found: ${e.message}` }] };
  if (e instanceof AffinityPermissionError)  return { content: [{ type: 'text', text: `Permission denied: ${e.message}` }] };
  if (e instanceof AffinityServerError)      return { content: [{ type: 'text', text: `Affinity server error (${e.status}): ${e.message}` }] };
  throw e; // unknown errors still propagate
}
```

Wrap the handler body of each read tool that is likely to 404 in `try/catch`:
- `get_person` — bad `person_id`
- `get_organization` — bad `org_id`
- `get_opportunity` — bad `id`
- `get_list_entries` — bad `list_id`
- `get_field_values` — bad `list_entry_id`
- `get_notes` — bad `person_id` / `organization_id`

Pattern:
```typescript
async ({ person_id }) => {
  try {
    const person = await api.getById(person_id);
    // ... format and return
  } catch (e) {
    return toolError(e);
  }
}
```

#### Wiring
- New file `src/tools/_error.ts`; imported wherever used
- No changes to API layer, types, or server wiring

#### Tests (16 tests added)
- `test/tools/_error.test.ts` — 4 unit tests for the helper (NotFoundError, PermissionError, ServerError, re-throw)
- 2 tests per wrapped tool (12 tests across people, organizations, opportunities, lists ×2, notes): one confirms `AffinityNotFoundError` returns "Not found:" text, one confirms unknown errors re-throw
- Total: 377 → 393 tests; branch coverage 93.58%

---

### Phase 20 — Coverage Backfill (≥95% Branch Target) ✅ COMPLETE

Close the remaining well-understood branch gaps carried forward from Phase 18. All gaps are real edge cases, not dead code.

| File | Lines | Gap | Tests to add |
|------|-------|-----|--------------|
| `src/tools/interactions_v2.ts` | 73, 91, 109 | `if (nextPageToken)` true branch in `get_calls`, `get_meetings`, `get_chat_messages` | 3 tests: mock API returns a `nextPageToken`, assert it appears in output |
| `src/affinity/transcripts.ts` | 15, 43–51 | `if (page_token)` query param branch; `result.data ?? []` and `result.next_page_token ?? undefined` null-path | 3 tests: explicit `page_token` in request; API response with `data: null`; API response with no `next_page_token` |
| `src/tools/search_all.ts` | 35–36 | `\|\| '(no name)'` and `?? 'no email'` person-label fallbacks | 2 tests: person with `first_name: ''` and `last_name: ''`; person with `primary_email: null` and `emails: []` |
| `src/tools/webhooks.ts` | 138–141, 147–149 | Enrichment: `body.entity_id` fallback; `entityId === null` early return; non-person/org prefix; `\|\| '(no name)'` and `?? 'no email'` in person formatting | 4 tests: `body: { entity_id: 42 }` (no `body.id`); `body: {}` (null entityId path); `note.created` with `enrich: true`; person with empty name and null email |
| `src/tools/intelligence.ts` | 188, 226 | `throw e` re-throw when `getRelationshipStrength` throws a non-404 | 2 tests: mock throws `AffinityServerError` in both `person_id` and `organization_id` paths; assert error propagates |

Target: **≥95% branch coverage** overall (up from 93.52%).

**Result:** 393 → 407 tests (+14); branch coverage **96.2%** (target met). Remaining gaps are narrow edge cases in `src/tools/intelligence.ts` (84.61%) and `src/tools/semantic_search.ts` (71.42%) and a few affinity API files.

---

### Phase 21 — Activity Timeline Tool ✅ COMPLETE

**Use case:** "Catch me up on my relationship with Alice before my call tomorrow." Currently requires three separate tool calls (`get_emails`, `get_meetings`, `get_notes`) with Claude merging them mentally. A single sorted timeline is faster and more natural.

#### Tool signature
```
get_activity_timeline(person_id?: number, organization_id?: number, limit?: number, since?: string)
```

**Output format:**
```
15 activity item(s) for person 42 (since 2024-01-01):

[2024-03-15 Email] Subject: Intro call follow-up
[2024-03-10 Meeting] Q1 Pipeline Review (45 min)
[2024-03-01 Note] Expressed strong interest in Series B round
[2024-02-20 Email] Subject: Re: Deck review
```

#### Implementation (`src/tools/activity_timeline.ts`)

1. Fetch in parallel:
   - `InteractionsV2Api.getEmails({ person_id | organization_id, limit })`
   - `InteractionsV2Api.getMeetings({ person_id | organization_id, limit })`
   - `NotesApi.getNotes({ person_id | organization_id, limit })`
2. Normalize each to `{ date: string; type: 'Email' | 'Meeting' | 'Note'; label: string }`
   - Email: date = `sent_at`, label = subject or `(no subject)`
   - Meeting: date = `start_time`, label = title + duration if available
   - Note: date = `created_at`, label = first 120 chars of content
3. Filter to `since` if provided (ISO date string)
4. Sort by date descending, slice to `limit` (default 20)
5. Return formatted timeline or "No activity found" if empty

**Validation:** at least one of `person_id` / `organization_id` required.

**New file:** `src/tools/activity_timeline.ts`; registered in `src/server.ts`.

**No new API endpoints** — reuses `InteractionsV2Api` and `NotesApi`.

#### Tests (11 tests in `test/tools/activity_timeline.test.ts`)
- Validation error when neither `person_id` nor `organization_id` provided
- Returns "No activity found" when all three sources empty
- Returns combined sorted timeline (email > meeting > note, date-desc)
- `since` filter removes older items; header shows "since …"
- `limit` caps total results
- Person scope: all three APIs called with `person_id`
- Org scope: all three APIs called with `organization_id`; header says "organization N"
- Meeting with no `end_time` omits duration
- Meeting with equal start/end time omits duration (`mins > 0` false branch)
- Email with null subject → `(no subject)`
- Meeting with null title → `(no title)`
- Note content truncated to 120 chars

**Result:** 407 → 420 tests; branch coverage 96.19% (maintained).

---

### Phase 22 — README Sync ✅ COMPLETE

Update `README.md` to match the current implementation.

#### Changes made

1. **Quick Reference table** — added `Cross-entity Search` row (`search_all`), `Activity Timeline` row (`get_activity_timeline`), `get_pipeline_summary` to Lists & Pipeline row
2. **New `### Cross-entity Search` section** — documented `search_all` with parameter table
3. **New `### Activity Timeline` section** — documented `get_activity_timeline` with parameters and output format example
4. **`get_pipeline_summary` section** — added to Lists & Pipeline section
5. **`get_recent_events`** — added `enrich` parameter to the Webhooks section
6. **`find_intro_path`** — corrected param name from `target_person_id` to `person_id`
7. **`summarize_relationship`** — added `organization_id` parameter (was missing; tool accepts either person or org)

---

### Phase 23 — Write Tool Error Handling ✅ COMPLETE

**Problem:** Phase 19 wrapped six read tools in `try/catch → toolError()`. The ~18 write/update tools (`create_person`, `update_person`, `create_organization`, `update_organization`, `create_note`, `update_note`, `delete_note`, `create_opportunity`, `update_opportunity`, `create_reminder`, `update_reminder`, `delete_reminder`, `set_field_value`, `delete_field_value`, `batch_set_field_values`, `add_to_list`, `remove_from_list`, `merge_persons`, `merge_companies`) still let errors propagate as raw protocol errors. A 404 on `update_person` (stale ID) or a 409 Conflict on a duplicate create both surface as opaque failures.

#### Implementation

1. **Extended `toolError` in `src/tools/_error.ts`** — added `AffinityConflictError` (HTTP 409):
   ```typescript
   if (e instanceof AffinityConflictError) return { content: [{ type: 'text', text: `Conflict: ${e.message}` }] };
   ```
2. **Added `AffinityConflictError`** to `src/affinity/client.ts` — thrown for HTTP 409 responses (same pattern as `AffinityNotFoundError`).
3. **Wrapped all 19 write tool handlers** in `try { ... } catch (e) { return toolError(e); }`.
   - Added `toolError` import to `reminders.ts` and `merges.ts` (the two files that previously had no error handling)

#### Files changed
- `src/affinity/client.ts` — new `AffinityConflictError` class; throw on 409
- `src/tools/_error.ts` — handle `AffinityConflictError`
- `src/tools/people.ts`, `organizations.ts`, `notes.ts`, `opportunities.ts`, `reminders.ts`, `lists.ts`, `merges.ts` — wrap write handlers

#### Tests (20 new tests, 420 → 440 total)
- `test/tools/_error.test.ts` — 1 test: `AffinityConflictError` → "Conflict:" text
- 1 test per write tool confirming `AffinityNotFoundError` returns "Not found:" across: `create_person`, `update_person`, `create_organization`, `update_organization`, `create_note`, `update_note`, `delete_note`, `create_opportunity`, `update_opportunity`, `create_reminder`, `update_reminder`, `delete_reminder`, `set_field_value`, `delete_field_value`, `add_to_list`, `remove_from_list`, `batch_set_field_values`, `merge_persons`, `merge_companies`
- Branch coverage: **96.07%** (maintained ≥95%; `_error.ts` now 100% branches)

---

### Phase 24 — API Layer Coverage Completion (≥98% Branch Target) ✅ COMPLETE

**Result:** Branch coverage raised from 96.07% → 98.03% (455 tests, all passing). 15 new targeted tests added across 9 files. `src/tools/intelligence.ts` (84.61%) remains the only sub-98% file — its uncovered branches (lines 178-181, 214-219) involve complex `??`/`?.` chains in template strings that would require many micro-tests for marginal value; overall threshold is satisfied.

**Problem:** After Phase 23 the overall branch coverage is 96.07%. The gaps are concentrated in a small number of Affinity API files and two tool files:

| File | Current branch % | Gap |
|------|-----------------|-----|
| `src/affinity/interactions_v2.ts` | ~85% | `page_token` query param branch in `getEmails` and `getMeetings` |
| `src/affinity/lists.ts` | ~90% | Optional params (`page_token`, `type` filter) not exercised |
| `src/affinity/notes.ts` | ~85% | `person_id`, `organization_id`, `opportunity_id` filter branches |
| `src/affinity/opportunities.ts` | ~85% | `search` with no params; `create` with optional fields absent |
| `src/affinity/reminders.ts` | ~80% | `person_id`/`organization_id`/`opportunity_id` filter branches; update partial fields |
| `src/affinity/semantic_search.ts` | ~80% | `type` param absent branch; response without `organizations` key |
| `src/tools/intelligence.ts` | 84.61% | `organization_id` path through `find_intro_path`; error-path in `summarize_relationship` org branch |
| `src/tools/semantic_search.ts` | 71.42% | Empty result set; response without expected keys |

#### Implementation

Targeted unit tests only — no source changes.

| File | Tests to add |
|------|-------------|
| `test/affinity/interactions_v2.test.ts` | `page_token` forwarded in `getEmails` and `getMeetings` |
| `test/affinity/lists.test.ts` | `page_token` and `type` filter in `getListEntries` |
| `test/affinity/notes.test.ts` | `person_id`, `organization_id`, `opportunity_id` filter params |
| `test/affinity/opportunities.test.ts` | `search` with no query; `create` without optional fields |
| `test/affinity/reminders.test.ts` | Filter params in `getReminders`; partial update (only `complete_at`) |
| `test/affinity/semantic_search.test.ts` | Absent `type` param; response missing `organizations` key |
| `test/tools/intelligence.test.ts` | `find_intro_path` with `organization_id`; `summarize_relationship` org error path |
| `test/tools/semantic_search.test.ts` | Empty result set; response without expected structure |

**Target:** ≥98% branch coverage overall (~12–15 new tests).

---

### Phase 25 — Stale Contact Detection (`find_stale_contacts`)

**Use case:** "Who on my pipeline haven't I spoken to in 90 days?" Currently requires fetching all list entries and checking each one's `last_interaction_date` manually. A dedicated tool surfaces this in one call.

#### Tool signature
```
find_stale_contacts(list_id: number, days_since_contact: number, limit?: number)
  → Stale contacts (no interaction in ≥90 days) in list 12345:
     [person:1] Alice Smith <alice@acme.com> — last contact: 2023-11-15 (112 days ago)
     [person:7] Bob Jones <bob@beta.io> — last contact: 2023-10-30 (128 days ago)
     [person:3] Carol White <carol@gamma.com> — never contacted
     3 stale contact(s) found.
```

#### Implementation (`src/tools/stale_contacts.ts`)

1. Call `ListsApi.getListEntries(list_id)` — fetch all entries (auto-paginate if needed)
2. For each entry, check `field_values` for the `last_interaction_date` field (look for a field whose `name` matches "Last Interaction Date" or whose value type is a date)
3. Filter to entries where the date is absent OR older than `Date.now() - days_since_contact * 86400000`
4. Sort ascending by date (oldest / never-contacted first)
5. Slice to `limit` (default 20)
6. Format each line with person/org prefix, name, email if available, date, and days-ago count

**No new API endpoints** — reuses `ListsApi`.

**New file:** `src/tools/stale_contacts.ts`; registered in `src/server.ts`.

#### Tests (≥8 tests in `test/tools/stale_contacts.test.ts`)
- Returns "No stale contacts" when all entries are recent
- Returns entries with no `last_interaction_date` (never contacted)
- Returns entries older than threshold, sorted oldest first
- Excludes entries within threshold
- `limit` caps results
- Header shows list ID and threshold
- "never contacted" label when date absent
- Days-ago count is accurate

---

### Phase 26 — Auto-Pagination (`get_all_list_entries`)

**Use case:** "Give me all deals in my pipeline list." `get_list_entries` returns one page at a time (up to 100). For lists with hundreds of entries, Claude must manually loop with `page_token` — tedious and error-prone.

#### Tool signature
```
get_all_list_entries(list_id: number, max_entries?: number)
  → Fetched 243 entries from list 12345 (3 pages).
     [entry:101] Alice Smith — Stage: Qualified, Owner: Scott
     [entry:202] Acme Corp — Stage: Prospecting, Owner: Scott
     ...
```

#### Implementation (`src/tools/all_list_entries.ts`)

1. Loop: call `ListsApi.getListEntries(list_id, { page_token })` until `nextPageToken` is absent or `max_entries` is reached
2. Hard cap: 500 entries (5 pages × 100) regardless of `max_entries` to prevent runaway API usage
3. Track page count; include in header
4. Format each entry consistently with existing `get_list_entries` output

**No new API endpoints** — reuses `ListsApi`.

**New file:** `src/tools/all_list_entries.ts`; registered in `src/server.ts`.

#### Tests (≥6 tests in `test/tools/all_list_entries.test.ts`)
- Single page (no `nextPageToken`) returns all entries
- Multi-page: loops until `nextPageToken` absent, combines results
- `max_entries` cap stops early even if more pages exist
- Hard cap at 500 prevents unbounded loops
- Header shows entry count and page count
- Empty list returns "No entries found"

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
- Steps: checkout → `npm ci` → type-check → `test:coverage` → `wrangler deploy` → `wrangler secret put AFFINITY_API_KEY`
- Requires two GitHub repo secrets: `CLOUDFLARE_API_TOKEN` and `AFFINITY_API_KEY`
- Phase 17 adds `wrangler secret put AFFINITY_WEBHOOK_SECRET` — requires a third repo secret `AFFINITY_WEBHOOK_SECRET`

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
| People | v1 | create/update/search/getById all v1 |
| Organizations | v1 | create/update/search/getById all v1 |
| Lists & entries | v1 | v2 list support is limited; saved views use v2 |
| Field values | v1 (create/update), v2 (batch) | batch_set_field_values uses v2 |
| Notes | v1 (CRUD), v2 (replies) | getNoteReplies is v2; update/delete are v1 |
| Interactions (per-channel) | v2 | /emails, /calls, /meetings, /chat-messages |
| Relationship intelligence | v2 | Strength scores, intro paths |
| Reminders | v1 | Full CRUD |
| Transcripts | v2 (BETA) | List, read, fragments |
| Semantic search | v2 (BETA) | Companies only |
| Merges (dedup) | v2 | Async tasks for person + company merges |
| Current user / rate limit | v2 / v1 | getCurrentUser = v2, getRateLimit = v1 |
| Webhooks (subscriptions) | v1 | CRUD at /webhook-subscriptions |

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
│   │   ├── webhooks.ts       # v1 webhook subscription CRUD (Phase 16)
│   │   └── types.ts          # TypeScript types for all API responses
│   └── tools/
│       ├── people.ts         # search_people, get_person, create_person, update_person
│       ├── organizations.ts  # search_organizations, get_organization, create_organization, update_organization
│       ├── lists.ts          # get_lists, get_list_entries, get/set/delete/batch_set_field_value(s), add/remove_from_list, get_saved_views/entries
│       ├── notes.ts          # get_notes, create_note, get_note_replies, update_note, delete_note
│       ├── intelligence.ts   # get_relationship_strength, find_intro_path, summarize_relationship
│       ├── fields.ts         # get_field_definitions, get_field_value_changes
│       ├── opportunities.ts  # search/get/create/update_opportunity
│       ├── reminders.ts      # get/create/update/delete_reminder
│       ├── interactions_v2.ts # get_emails, get_calls, get_meetings, get_chat_messages
│       ├── semantic_search.ts # semantic_search (BETA)
│       ├── transcripts.ts    # get_transcripts, get_transcript (BETA)
│       ├── merges.ts         # merge_persons, merge_companies
│       ├── utility.ts        # get_whoami, get_rate_limit
│       └── webhooks.ts       # list/create/update/delete_webhook, get_recent_events (Phase 16)
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

---

## Cloudflare Access — Webhook Route Bypass

### Background

The Worker is protected by a **Cloudflare Access Application** that enforces SSO for all traffic to `affinity.trulock.com`. This is correct for the `/mcp` endpoint (human + AI clients authenticate) but it breaks inbound webhooks from Affinity, which POST to `/webhook` as a machine caller with no Access session cookie or service token.

The solution is a **Bypass policy** that excludes `/webhook` from Access enforcement, while keeping all other paths protected. Affinity's HMAC secret header replaces Access as the authentication mechanism for that route.

---

### Step-by-step: Add the Bypass policy

**1. Open Zero Trust**
- Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com)
- Select your account → **Zero Trust** (left sidebar)

**2. Find the Access Application**
- **Access** → **Applications**
- Locate the application for `affinity.trulock.com` (the one protecting your Worker)
- Click **Edit**

**3. Add a Bypass policy**
- Go to the **Policies** tab inside the application editor
- Click **Add a Policy**
- Set the following:
  - **Policy name**: `Webhook Bypass` (or any label)
  - **Action**: `Bypass`
  - **Session duration**: N/A (Bypass ignores session)
- Under **Configure rules**, add an **Include** rule:
  - **Selector**: `Path`
  - **Value**: `/webhook`
- Save the policy

**4. Set policy order**
- Policies are evaluated top-to-bottom within an application
- Place the `Bypass` policy **above** your `Allow` policy so it matches first for `/webhook`
- All other paths fall through to the `Allow` policy and still require SSO

**5. Save the application**
- Click **Save** on the application editor
- Change takes effect immediately — no redeployment needed

---

### Verification

After saving, test with curl from outside your network:

```bash
# Should return 401 (Worker auth check) or a valid response — NOT a Cloudflare Access login redirect
curl -X POST https://affinity.trulock.com/webhook \
  -H "Content-Type: application/json" \
  -H "X-Affinity-Webhook-Secret: <your-secret>" \
  -d '{"test": true}'

# Should still redirect to SSO (Access is still enforced)
curl -I https://affinity.trulock.com/mcp
```

If `/webhook` returns an Access login redirect (`Location: https://<your-team>.cloudflareaccess.com/...`), the Bypass policy isn't in effect or is ordered below the Allow policy.

---

### Security posture after bypass

| Path | Protection |
|------|-----------|
| `/mcp` | Cloudflare Access (SSO required) |
| `/health` | Cloudflare Access (SSO required) |
| `/.well-known/*` | Cloudflare Access (SSO required) |
| `/webhook` | **No Access** — HMAC secret header verification in Worker code |

The `/webhook` route is now "open" at the network layer but locked at the application layer. Anyone who can guess or steal the webhook secret can send fake events. Mitigations:
- Keep `AFFINITY_WEBHOOK_SECRET` as a Worker Secret (never in code or logs)
- The Worker returns `401` and logs nothing on secret mismatch — no oracle for guessing
- Rotate the secret by updating the Affinity subscription and the Worker Secret in tandem (`wrangler secret put AFFINITY_WEBHOOK_SECRET`)

---

### Alternative: Cloudflare Access Service Token (if Bypass isn't available)

If your Cloudflare plan doesn't support path-level Bypass policies (some older plans only allow application-level actions), an alternative is:
- Create a **Service Token** in Access → Service Auth → Service Tokens
- Configure Affinity's webhook to send the token's `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers — but Affinity doesn't support custom headers on webhooks
- This alternative does **not** work for Affinity webhooks; the Bypass policy approach is required
