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
- Framework: **Vitest** with `@vitest/coverage-v8`; 126 tests across 14 test files
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

### Phase 7 — Field Intelligence (Read)

Prerequisite for all write phases: expose field metadata so Claude can discover field names and IDs before attempting to read or write values.

**New API classes:**
- `src/affinity/fields.ts`: `FieldsApi` with `getFields`, `getPersonFields`, `getOrganizationFields`, `getListFields`, `getFieldValueChanges` (v1)

**New MCP tools (`src/tools/fields.ts`):**
- `get_field_definitions` — list all custom field definitions (global + list-specific), with name, type, and allowed values; accepts optional `list_id` filter
- `get_list_fields` — fields available on a specific list (v1 `/fields?list_id=` or v2 `GET /v2/lists/{id}/fields`)
- `get_field_value_changes` — audit trail of changes to a field value over time; accepts `field_id` and optional `entity_id`/`list_entry_id`

**New types:** `AffinityFieldDefinition`, `AffinityFieldValueChange`

---

### Phase 8 — Write: Field Values

The most impactful write operation — update pipeline stages, deal amounts, and any custom field on a record.

**Extends `src/affinity/lists.ts`:** add `setFieldValue` (v1 `POST /field-values` for new, `PUT /field-values/{id}` for update), `deleteFieldValue` (v1 `DELETE /field-values/{id}`)

**Alternative v2 path (preferred when available):** `POST /v2/lists/{listId}/list-entries/{entryId}/fields/{fieldId}` for single-field update; `PATCH /v2/lists/{listId}/list-entries/{entryId}/fields` for batch update.

**New MCP tools (extend `src/tools/lists.ts`):**
- `set_field_value` — create or update a single field value on a list entry; accepts `list_entry_id`, `field_id`, `value`; uses v2 batch endpoint when `list_id` is provided, falls back to v1
- `delete_field_value` — delete a field value by `field_value_id`

**Validation note:** call `get_field_definitions` or cache field metadata to validate `value` type before writing.

**New tests:** cover create vs. update path selection, v1/v2 routing, invalid value rejection.

---

### Phase 9 — Opportunities

Dedicated opportunity tools to complement list entries. Currently opportunities are only visible as `entity_type: 8` rows inside `get_list_entries`.

**New API class:**
- `src/affinity/opportunities.ts`: `OpportunitiesApi` with `search`, `getById`, `create`, `update` (all v1)

**New MCP tools (`src/tools/opportunities.ts`):**
- `search_opportunities` — search/list opportunities by name; accepts optional `list_id` to scope results
- `get_opportunity` — full opportunity detail by ID (name, person IDs, org IDs, list entries, field values)
- `create_opportunity` — create a new opportunity; accepts `name`, `person_ids`, `organization_ids`, optional `list_id` to add it to a list immediately
- `update_opportunity` — update name or associated people/orgs on an existing opportunity

**New types:** extend `AffinityOpportunity` with `name`, `notes`, any additional v1 fields.

**Cache:** opportunity profiles at 5 min TTL; invalidate on `create`/`update`.

---

### Phase 10 — Write: People & Organizations

Create and update the core CRM entities. Most useful for "add this person I just met" and "update the company domain" workflows.

**Extends `src/affinity/people.ts`:** add `create`, `update`, `delete` (v1 `POST/PUT/DELETE /persons`)
**Extends `src/affinity/organizations.ts`:** add `create`, `update`, `delete` (v1 `POST/PUT/DELETE /organizations`)

**New MCP tools (extend `src/tools/people.ts` and `src/tools/organizations.ts`):**
- `create_person` — create a new contact; accepts `first_name`, `last_name`, `emails`, optional `organization_ids`, `phone_numbers`
- `update_person` — update name, emails, or org associations on an existing person by ID
- `create_organization` — create a new company; accepts `name`, `domain`, optional `person_ids`
- `update_organization` — update name or domain on an existing org by ID

**Design note:** skip `delete_person` / `delete_organization` MCP tools for now — destructive, hard to reverse, low AI-assistant use case. Can be added later if needed.

**Cache invalidation:** bust `people:{id}` and `orgs:{id}` cache keys on successful write.

---

### Phase 11 — List Management & Saved Views

Add entries to lists (add a deal to the pipeline), remove them, and query lists through their saved views.

**Extends `src/affinity/lists.ts`:** add `addListEntry` (v1 `POST /lists/{id}/list-entries`), `removeListEntry` (v1 `DELETE /lists/{id}/list-entries/{entry_id}`), `getSavedViews` (v2 `GET /v2/lists/{id}/saved-views`), `getSavedViewEntries` (v2 `GET /v2/lists/{id}/saved-views/{viewId}/list-entries`)

**New MCP tools (extend `src/tools/lists.ts`):**
- `add_to_list` — add a person, org, or opportunity to a list by entity ID + entity type
- `remove_from_list` — remove a list entry by `list_entry_id`
- `get_saved_views` — list the saved views defined for a given list (view name, ID, creator)
- `get_saved_view_entries` — fetch list entries through a named saved view (respects that view's filters, sort order, and visible columns); accepts `list_id` + `view_id` or `view_name`

**New types:** `AffinitySavedView`

---

### Phase 12 — Reminders

Surface Affinity's task/reminder system so Claude can schedule follow-ups directly from conversation.

**New API class:**
- `src/affinity/reminders.ts`: `RemindersApi` with `getReminders`, `createReminder`, `updateReminder`, `deleteReminder` (all v1)

**New MCP tools (`src/tools/reminders.ts`):**
- `get_reminders` — list upcoming reminders; accepts optional `person_id` or `organization_id` filter
- `create_reminder` — create a follow-up reminder; accepts `content`, `due_date`, and at least one of `person_id`/`organization_id`/`opportunity_id`
- `update_reminder` — reschedule or update reminder content
- `delete_reminder` — delete a reminder by ID (after it's been acted on)

**New types:** `AffinityReminder`

---

### Phase 13 — v2 Rich Interactions & Note Threads

Replace / supplement the v1 `/interactions` catch-all with v2's granular per-type endpoints, and add note reply thread support.

**New API class:**
- `src/affinity/interactions_v2.ts`: `InteractionsV2Api` with `getEmails`, `getCalls`, `getMeetings`, `getChatMessages` (all v2); each supports filtering by `id`, timestamp range (`sentAt`/`startTime`/`createdAt`), and pagination

**Extends `src/affinity/notes.ts`:** add `getNoteReplies` (v2 `GET /v2/notes/{id}/replies`), `updateNote` (v1 `PUT /notes/{id}`), `deleteNote` (v1 `DELETE /notes/{id}`)

**New MCP tools (`src/tools/interactions_v2.ts`):**
- `get_emails` — email history with date-range filtering
- `get_calls` — call history (v2-only; no v1 equivalent)
- `get_meetings` — meeting history with richer metadata than v1
- `get_chat_messages` — Slack/chat message history (v2-only)

**Extend `src/tools/notes.ts`:**
- `get_note_replies` — fetch reply thread for a note by `note_id`
- `update_note` — update note content by ID
- `delete_note` — delete a note by ID

---

### Phase 14 — Advanced Features & Beta

**Semantic Search (v2 BETA):**
- `src/affinity/semantic_search.ts`: `SemanticSearchApi` with `search` (v2 `POST /v2/semantic-search`)
- MCP tool `semantic_search` — natural-language company search; accepts a free-text `query`, returns ranked company matches; clearly label as beta in tool description

**Transcripts (v2 BETA):**
- `src/affinity/transcripts.ts`: `TranscriptsApi` with `getTranscripts`, `getTranscript`, `getTranscriptFragments` (v2)
- MCP tools `get_transcripts`, `get_transcript` — list and read call/meeting transcripts with fragment-level access

**Deduplication (v2):**
- Extend `src/affinity/people.ts` / `organizations.ts`: `mergePeople` (v2 `POST /v2/person-merges`), `mergeCompanies` (v2 `POST /v2/company-merges`)
- MCP tools `merge_persons`, `merge_companies` — requires confirmation guard in the tool description; polls the async merge task status before returning

**Utility:**
- `get_whoami` — identify the authenticated user (v1 `GET /whoami` or v2 `GET /v2/auth/whoami`); useful for "who is the current API user?" and onboarding
- `get_rate_limit` — return remaining monthly and per-minute quota (v1 `GET /rate-limit`)

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
