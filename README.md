# AffinityConnector

An MCP (Model Context Protocol) server that gives Claude direct access to your [Affinity CRM](https://affinity.co) data. Ask Claude natural-language questions about your contacts, pipeline, notes, interactions, and relationship intelligence — all powered by live Affinity data.

Deployed as a **Cloudflare Worker** at `https://affinity.trulock.com/mcp`.

---

## Quick Reference

| Category | Tools |
|----------|-------|
| [People](#people) | `search_people`, `get_person`, `create_person`, `update_person` |
| [Organizations](#organizations) | `search_organizations`, `get_organization`, `create_organization`, `update_organization` |
| [Lists & Pipeline](#lists--pipeline) | `get_lists`, `get_list_entries`, `add_to_list`, `remove_from_list`, `get_saved_views`, `get_saved_view_entries` |
| [Field Values](#field-values) | `get_field_values`, `set_field_value`, `delete_field_value`, `batch_set_field_values` |
| [Field Definitions](#field-definitions) | `get_field_definitions`, `get_field_value_changes` |
| [Opportunities](#opportunities) | `search_opportunities`, `get_opportunity`, `create_opportunity`, `update_opportunity` |
| [Notes](#notes) | `get_notes`, `create_note`, `get_note_replies`, `update_note`, `delete_note` |
| [Interactions (v1)](#interactions-v1) | `get_interactions` |
| [Interactions (v2)](#interactions-v2) | `get_emails`, `get_calls`, `get_meetings`, `get_chat_messages` |
| [Reminders](#reminders) | `get_reminders`, `create_reminder`, `update_reminder`, `delete_reminder` |
| [Intelligence](#intelligence) | `get_relationship_strength`, `find_intro_path`, `summarize_relationship` |
| [Transcripts (BETA)](#transcripts-beta) | `get_transcripts`, `get_transcript` |
| [Semantic Search (BETA)](#semantic-search-beta) | `semantic_search` |
| [Deduplication](#deduplication) | `merge_persons`, `merge_companies` |
| [Utility](#utility) | `get_whoami`, `get_rate_limit` |

---

## Tool Reference

### People

#### `search_people`
Search contacts by name or email.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✓ | Name, email, or keyword to search |
| `page_token` | string | | Pagination token from a previous call |

#### `get_person`
Fetch the full profile for a person, including emails, phone numbers, organization associations, and interaction date summary.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `person_id` | number | ✓ | Affinity person ID (from `search_people`) |

#### `create_person`
Create a new person record in Affinity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `first_name` | string | ✓ | First name |
| `last_name` | string | ✓ | Last name |
| `emails` | string[] | | Email addresses |
| `organization_ids` | number[] | | Organizations to associate with |
| `phone_numbers` | string[] | | Phone numbers |

#### `update_person`
Update an existing person's name, emails, or organization associations. At least one field must be provided.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `person_id` | number | ✓ | Person ID to update |
| `first_name` | string | | New first name |
| `last_name` | string | | New last name |
| `emails` | string[] | | Replacement email list |
| `organization_ids` | number[] | | Replacement org association list |

---

### Organizations

#### `search_organizations`
Search companies by name or domain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✓ | Company name or domain to search |
| `page_token` | string | | Pagination token from a previous call |

#### `get_organization`
Fetch the full profile for a company, including domain, associated people, and interaction date summary.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `organization_id` | number | ✓ | Affinity organization ID (from `search_organizations`) |

#### `create_organization`
Create a new organization record in Affinity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | ✓ | Company name |
| `domain` | string | | Primary domain (e.g. `acme.com`) |
| `person_ids` | number[] | | People to associate with this org |

#### `update_organization`
Update an existing organization. At least one field must be provided.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `organization_id` | number | ✓ | Organization ID to update |
| `name` | string | | New company name |
| `domain` | string | | New primary domain |
| `person_ids` | number[] | | Replacement people association list |

---

### Lists & Pipeline

#### `get_lists`
List all Affinity lists in the workspace (pipelines, contact lists, company lists, etc.). No parameters.

#### `get_list_entries`
Fetch entries from a list. Each entry is a person, organization, or opportunity on that list.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `list_id` | number | ✓ | Affinity list ID (from `get_lists`) |
| `limit` | number | | Max entries to return (1–100, default 25) |
| `page_token` | string | | Pagination token from a previous call |

#### `add_to_list`
Add a person, organization, or opportunity to a list.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `list_id` | number | ✓ | List to add to (from `get_lists`) |
| `entity_id` | number | ✓ | ID of the entity to add |
| `entity_type` | number | ✓ | `0` = person, `1` = organization, `8` = opportunity |

#### `remove_from_list`
Remove an entry from a list by its list entry ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `list_id` | number | ✓ | List containing the entry |
| `list_entry_id` | number | ✓ | List entry ID to remove (from `get_list_entries`) |

#### `get_saved_views`
List all saved views for a list. Each view has a name, creator, and visibility (public/private).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `list_id` | number | ✓ | List ID (from `get_lists`) |

#### `get_saved_view_entries`
Fetch list entries through a saved view, respecting its filters and sort order.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `list_id` | number | ✓ | List ID |
| `view_id` | number | ✓ | Saved view ID (from `get_saved_views`) |
| `limit` | number | | Max entries to return (1–100, default 25) |
| `page_token` | string | | Pagination token |

---

### Field Values

#### `get_field_values`
Get all custom field values attached to a specific list entry.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `list_entry_id` | number | ✓ | List entry ID (from `get_list_entries`) |

#### `set_field_value`
Create or update a single custom field value on a list entry.

- **Update path**: provide `field_value_id` (from `get_field_values`) — only `field_id` and `value` are needed.
- **Create path**: omit `field_value_id` — `list_entry_id`, `entity_id`, and `entity_type` are all required.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `field_id` | number | ✓ | Field definition ID (from `get_field_definitions`) |
| `value` | string \| number \| boolean \| null | ✓ | New field value. Use `null` to clear. |
| `field_value_id` | number | | Existing field value ID to update (update path) |
| `list_entry_id` | number | | Required on create path |
| `entity_id` | number | | Required on create path |
| `entity_type` | number | | Required on create path: `0`=person, `1`=org, `8`=opportunity |

#### `delete_field_value`
Delete a custom field value by its ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `field_value_id` | number | ✓ | Field value ID to delete (from `get_field_values`) |

#### `batch_set_field_values`
Update up to 100 fields on a single list entry in one request (v2). More efficient than calling `set_field_value` repeatedly. Requires "Export data from Lists" permission in Affinity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `list_id` | number | ✓ | List containing the entry |
| `list_entry_id` | number | ✓ | Entry to update |
| `fields` | `{field_id, value}[]` | ✓ | Array of 1–100 field ID + value pairs |

---

### Field Definitions

#### `get_field_definitions`
List field schemas — names, value types, constraints, and list scope. Use this to find field IDs before calling `set_field_value`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope` | string | | Filter: `all` (default), `person`, `organization`, or `list` |
| `list_id` | number | | Required when `scope` is `list` |

Value types returned: `Text`, `Number`, `Date`, `Location`, `Person`, `Organization`, `Dropdown`.

#### `get_field_value_changes`
Audit trail of mutations for a specific field — who changed it, when, and to what value.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `field_id` | number | ✓ | Field definition ID |
| `entity_id` | number | | Filter to a specific entity |
| `list_entry_id` | number | | Filter to a specific list entry |
| `limit` | number | | Max changes to return (default 25) |

---

### Opportunities

#### `search_opportunities`
Search or list deal/opportunity records.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `term` | string | | Name search term (omit to list all) |
| `list_id` | number | | Scope search to a specific pipeline list |

#### `get_opportunity`
Fetch full detail for an opportunity — name, associated people and orgs, list memberships, and creation date.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opportunity_id` | number | ✓ | Opportunity ID (from `search_opportunities`) |

#### `create_opportunity`
Create a new opportunity record. Use `add_to_list` afterward to place it in a pipeline.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | ✓ | Opportunity name |
| `person_ids` | number[] | | Associated people |
| `organization_ids` | number[] | | Associated organizations |

#### `update_opportunity`
Update an opportunity's name or associations. At least one field must be provided. Associations are replaced wholesale.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opportunity_id` | number | ✓ | Opportunity ID to update |
| `name` | string | | New name |
| `person_ids` | number[] | | Replacement people list |
| `organization_ids` | number[] | | Replacement org list |

---

### Notes

#### `get_notes`
Fetch notes associated with a person, organization, or opportunity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `person_id` | number | | Filter to a person |
| `organization_id` | number | | Filter to an organization |
| `opportunity_id` | number | | Filter to an opportunity |
| `limit` | number | | Max notes to return (default 25) |
| `page_token` | string | | Pagination token |

#### `create_note`
Add a plain-text note to one or more records.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | ✓ | Note text |
| `person_ids` | number[] | | People to attach the note to |
| `organization_ids` | number[] | | Organizations to attach the note to |
| `opportunity_ids` | number[] | | Opportunities to attach the note to |

#### `get_note_replies`
Fetch the reply thread for a note (v2 API).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `note_id` | number | ✓ | Note ID (from `get_notes`) |
| `limit` | number | | Max replies to return (default 25) |
| `page_token` | string | | Pagination token |

#### `update_note`
Update the content of an existing note.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `note_id` | number | ✓ | Note ID to update |
| `content` | string | ✓ | New note content |

#### `delete_note`
**Permanently delete** a note. This cannot be undone.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `note_id` | number | ✓ | Note ID to delete |

---

### Interactions (v1)

#### `get_interactions`
Fetch email and meeting history for a person, org, or opportunity (v1 combined endpoint). For per-channel history with date-range filtering, use the v2 tools below.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `person_id` | number | | Filter to a person |
| `organization_id` | number | | Filter to an organization |
| `opportunity_id` | number | | Filter to an opportunity |
| `limit` | number | | Max interactions to return (default 25) |
| `page_token` | string | | Pagination token |

Interaction types in results: `0` = email, `1` = meeting.

---

### Interactions (v2)

The v2 interaction tools provide per-channel history with richer metadata and date-range filtering. All four share the same parameter set:

| Parameter | Type | Description |
|-----------|------|-------------|
| `person_id` | number | Filter to a person |
| `organization_id` | number | Filter to an organization |
| `created_after` | string | ISO 8601 timestamp — only items created after this date |
| `created_before` | string | ISO 8601 timestamp — only items created before this date |
| `limit` | number | Max items to return (1–100, default 25) |
| `page_token` | string | Pagination token |

#### `get_emails`
Email interaction history from Affinity (v2). Richer than `get_interactions` — includes subject line and supports date-range filtering.

#### `get_calls`
Call history (v2 only — not available via v1).

#### `get_meetings`
Meeting history with richer metadata than `get_interactions` (v2).

#### `get_chat_messages`
Slack/chat message history (v2 only — not available via v1).

---

### Reminders

#### `get_reminders`
List follow-up reminders, optionally filtered by associated record.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `person_id` | number | | Filter to reminders for a person |
| `organization_id` | number | | Filter to reminders for an org |
| `opportunity_id` | number | | Filter to reminders for an opportunity |

#### `create_reminder`
Create a follow-up reminder. At least one of `person_ids`, `organization_ids`, or `opportunity_ids` must be provided.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | ✓ | Reminder text |
| `due_date` | string | ✓ | Due date in `YYYY-MM-DD` format |
| `person_ids` | number[] | | People to associate |
| `organization_ids` | number[] | | Organizations to associate |
| `opportunity_ids` | number[] | | Opportunities to associate |

#### `update_reminder`
Reschedule, edit, or complete a reminder. At least one field must be provided.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reminder_id` | number | ✓ | Reminder ID (from `get_reminders`) |
| `content` | string | | New reminder text |
| `due_date` | string | | New due date in `YYYY-MM-DD` format |
| `completed` | boolean | | Set `true` to mark as completed |

#### `delete_reminder`
Delete a reminder by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reminder_id` | number | ✓ | Reminder ID to delete |

---

### Intelligence

#### `get_relationship_strength`
Get the 0–100 relationship strength score between your team and a person or organization.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `person_id` | number | One of | Person to check strength for |
| `organization_id` | number | One of | Organization to check strength for |

#### `find_intro_path`
Find who in your network can introduce you to a target person. Walks the target's organizations, collects all members, and ranks them by relationship strength.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target_person_id` | number | ✓ | Person ID you want an intro to |

#### `summarize_relationship`
Generate a full relationship briefing for a person — profile, relationship strength, recent notes, and recent interactions in a single response.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `person_id` | number | ✓ | Person ID to summarize |

---

### Transcripts (BETA)

#### `get_transcripts`
List call and meeting transcripts from Affinity (v2 BETA). Optionally filter by person or organization.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `person_id` | number | | Filter to transcripts involving a person |
| `organization_id` | number | | Filter to transcripts involving an org |
| `limit` | number | | Max transcripts to return (1–100, default 25) |
| `page_token` | string | | Pagination token |

#### `get_transcript`
Fetch the full content of a transcript, including timestamped speaker fragments. Returns up to `limit` fragments; paginate with `page_token` for long transcripts.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transcript_id` | string | ✓ | Transcript ID (from `get_transcripts`) |
| `limit` | number | | Max fragments to return (1–500, default 100) |
| `page_token` | string | | Pagination token for long transcripts |

---

### Semantic Search (BETA)

#### `semantic_search`
AI-powered natural language search over Affinity companies (v2 BETA). Supports fuzzy, conceptual, and partial-description queries. **Currently supports companies only** — not people or opportunities.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✓ | Natural language query, e.g. `"Series B fintech companies in New York"` |
| `limit` | number | | Max results to return (1–100, default 25) |
| `page_token` | string | | Pagination token |

---

### Deduplication

> ⚠️ **Destructive operations.** Merges permanently delete the source record and cannot be undone. Requires "Manage duplicates" permission and organization admin role in Affinity. Always confirm with the user before calling.

#### `merge_persons`
Merge two person records. The base record is kept; the other is merged in and permanently deleted. The tool polls until the async merge task completes before returning the result.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `base_person_id` | number | ✓ | Person record to keep |
| `to_merge_person_id` | number | ✓ | Person record to merge in (will be deleted) |

#### `merge_companies`
Merge two company records. The base record is kept; the other is merged in and permanently deleted.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `base_company_id` | number | ✓ | Company record to keep |
| `to_merge_company_id` | number | ✓ | Company record to merge in (will be deleted) |

---

### Utility

#### `get_whoami`
Get the identity of the currently authenticated Affinity user — name, email, and organization. No parameters.

#### `get_rate_limit`
Get the current API rate limit quota — requests remaining and seconds until reset. No parameters.

---

## Connecting to Claude

### claude.ai (Remote MCP)

1. Go to **claude.ai → Settings → Integrations**
2. Click **Add Integration**
3. Enter the MCP URL: `https://affinity.trulock.com/mcp`
4. Click **Connect**

### Claude Desktop (Local config)

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "affinity": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://affinity.trulock.com/mcp"
      ]
    }
  }
}
```

Config file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

---

## Architecture

```
User (Claude Desktop / claude.ai)
        │
        │  HTTPS + Cloudflare Access (SSO)
        ▼
┌──────────────────────────────┐
│   Cloudflare Worker          │
│  ┌────────────────────────┐  │
│  │    MCP Server Layer    │  │  ← Streamable HTTP transport
│  └──────────┬─────────────┘  │
│  ┌──────────▼─────────────┐  │
│  │   Affinity API Client  │  │  ← fetch-based REST wrapper (v1 + v2)
│  └──────────┬─────────────┘  │
│  ┌──────────▼─────────────┐  │
│  │   Cloudflare KV Cache  │  │  ← 2–10 min TTL per data type
│  └────────────────────────┘  │
└──────────────────────────────┘
        │  HTTPS / REST
        ▼
  Affinity CRM API (affinity.co)
```

### Caching

Responses are cached in Cloudflare KV to reduce API calls and latency:

| Data type | TTL |
|-----------|-----|
| People & org profiles | 5 minutes |
| Lists | 10 minutes |
| List entries & field values | 5 minutes |
| Field definitions | 10 minutes |
| Notes & interactions | 2 minutes |
| Relationship strength | 5 minutes |
| Reminders | 2 minutes |
| Saved views | 10 minutes |

Live activity data (v2 emails, calls, meetings, chat messages, field value changes) is not cached.

---

## Deployment

### Prerequisites
- Cloudflare account with Workers enabled
- Affinity API key (Affinity → Settings → API)
- `wrangler` CLI: `npm install -g wrangler`

### First-time setup

```bash
# 1. Clone the repo
git clone https://github.com/strulock/AffinityConnector.git
cd AffinityConnector
npm install

# 2. Authenticate wrangler
wrangler login

# 3. Create the KV namespace for caching
wrangler kv namespace create affinity-connector-cache
# Copy the returned ID into wrangler.toml under [[kv_namespaces]]

# 4. Set the Affinity API key as an encrypted secret
wrangler secret put AFFINITY_API_KEY

# 5. Deploy
wrangler deploy
```

### CI/CD (GitHub Actions)

Every push to `main` automatically type-checks, runs the full test suite with coverage, and deploys via `.github/workflows/deploy.yml`.

Required GitHub repository secrets:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers and KV edit permissions |
| `AFFINITY_API_KEY` | Affinity CRM API key |

### Local development

Create a `.dev.vars` file (gitignored):

```
AFFINITY_API_KEY=your_key_here
```

Then run:

```bash
npm run dev            # start local Worker at http://localhost:8787/mcp
npm run type-check     # TypeScript type check (no emit)
npm test               # run tests in watch mode
npm run test:run       # run tests once
npm run test:coverage  # run tests with coverage report (thresholds enforced)
```

### Configuration (`wrangler.toml`)

```toml
name = "affinity-connector"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
AFFINITY_V1_BASE_URL = "https://api.affinity.co"
AFFINITY_V2_BASE_URL = "https://api.affinity.co/v2"

[[kv_namespaces]]
binding = "AFFINITY_CACHE"
id = "your-kv-namespace-id-here"
```

**Secrets** (set via `wrangler secret put`):
- `AFFINITY_API_KEY` — your Affinity API key, encrypted at rest in Cloudflare

---

## License

GNU General Public License v3.0
