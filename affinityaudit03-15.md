# Affinity Claude Connector — Comprehensive Audit Report

**Date:** March 15, 2026
**Connector:** https://affinity.trulock.com (Cloudflare Worker)
**Affinity API:** v1 (api.affinity.co) and v2 (api.affinity.co/v2)
**Total tools:** 55
**Authenticated user:** Scott Trulock (ID 253573426, org 47237)

---

## CRITICAL BUGS (endpoints completely broken)

### BUG-01: `get_emails` — Not Found
```
Tests: get_emails({ limit: 3 }), get_emails({ person_id: 253576194, limit: 3 })
Error: "Not found: Not Found"
```
**Expected API call:** `GET https://api.affinity.co/v2/interactions?type=email` (v2 interactions endpoint filtered by type)
**Root cause:** Route handler missing or URL path incorrect. The v2 interactions API uses `GET /v2/interactions` with a `type` query parameter, not a dedicated `/v2/emails` path.

### BUG-02: `get_meetings` — Not Found
```
Tests: get_meetings({ limit: 3 }), get_meetings({ person_id: 253576194, limit: 3 })
Error: "Not found: Not Found"
```
**Expected API call:** `GET https://api.affinity.co/v2/interactions?type=meeting`
**Root cause:** Same as BUG-01. These three interaction types (email, meeting, call) likely share a single v2 endpoint with a `type` filter.

### BUG-03: `get_calls` — Not Found
```
Tests: get_calls({ limit: 3 }), get_calls({ person_id: 253576194, limit: 3 })
Error: "Not found: Not Found"
```
**Expected API call:** `GET https://api.affinity.co/v2/interactions?type=call`
**Root cause:** Same as BUG-01/02.

### BUG-04: `get_notes` — Always returns empty despite notes existing
```
Tests: get_notes({}), get_notes({ person_id: 253573426 }), get_notes({ organization_id: 309981111 })
Result: "No notes found." in all cases
```
**Proof notes exist:** `create_note({ content: "test", person_ids: [253573426] })` returned success with ID 30007367. Immediately calling `get_notes({ person_id: 253573426 })` still returned empty.
**Expected API call:** `GET https://api.affinity.co/v2/notes` with optional `person_id`, `organization_id`, or `opportunity_id` query params.
**Root cause:** Either the v2 notes list endpoint URL is wrong, the response is not being parsed (e.g., `response.data` not being read), or the query parameters are not being forwarded. The create/update/delete note endpoints all work correctly — only the list/read endpoint is broken.

### BUG-05: `search_opportunities` — Always returns empty despite opportunities existing
```
Tests: search_opportunities({}), search_opportunities({ term: "Fox" }), search_opportunities({ list_id: 339917 }), search_opportunities({ list_id: 333572 }), search_opportunities({ list_id: 337191 })
Result: "No opportunities found." in all cases
```
**Proof opportunities exist:** `get_list_entries({ list_id: 339917 })` returns 34 entries like "Prj Fox - Merewether" which are opportunity-type entries (list type 8). The Affinity v1 API endpoint is `GET https://api.affinity.co/opportunities` with optional `term` query param.
**Root cause:** Route may be hitting wrong URL, or the response parsing is failing silently.

### BUG-06: `get_opportunity` — 422 for all IDs tested
```
Test: get_opportunity({ opportunity_id: 1 })
Error: "Affinity API error 422: Unprocessable Entity"
```
**Note:** Could not find valid opportunity IDs because `search_opportunities` is also broken (BUG-05). The list entry IDs from `get_list_entries` (e.g., 235084849) are list_entry_ids, not opportunity_ids. The v1 API is `GET https://api.affinity.co/opportunities/{opportunity_id}`. Need to verify the connector is passing the correct ID type.

### BUG-07: `create_reminder` — 422 for all combinations
```
Tests:
  create_reminder({ content: "Test", due_date: "2026-03-20", person_ids: [253573426] }) → 422
  create_reminder({ content: "Test", due_date: "2026-03-20", organization_ids: [309964174] }) → 422
  create_reminder({ content: "Test", due_date: "2026-03-20" }) → "At least one of person_ids..." (validation works)
```
**Expected API call:** `POST https://api.affinity.co/reminders` with JSON body `{ "content": "...", "due_date": "...", "person_ids": [...] }`
**Root cause:** The validation logic works (rejects empty associations), so the tool handler exists. The 422 from Affinity suggests the request body format is wrong — possibly `due_date` needs a different format (ISO 8601 datetime vs YYYY-MM-DD), or `person_ids`/`organization_ids` needs to be sent differently.

### BUG-08: `get_pipeline_summary` — 422 for all field/list combinations
```
Tests:
  get_pipeline_summary({ list_id: 339917, field_id: 5600902 }) → 422 (Investor Status, Ranked Dropdown)
  get_pipeline_summary({ list_id: 333573, field_id: 5526485 }) → 422 (Status, Ranked Dropdown)
```
**Expected API call:** This appears to be a custom connector tool (not a direct Affinity API endpoint). It likely fetches all list entries and groups them by a field value. The 422 suggests it's making a malformed API call internally.
**Root cause:** Investigate what Affinity API calls this tool makes internally and where the 422 originates.

---

## SIGNIFICANT BUGS (endpoints work but with wrong output)

### BUG-09: `get_relationship_strength` — fails for organizations (entity_type: 1)
```
Pass: get_relationship_strength({ entity_id: 253576561, entity_type: 0 }) → "100/100 (Very Strong)"
Fail: get_relationship_strength({ entity_id: 1696601, entity_type: 1 }) → 422
Fail: get_relationship_strength({ entity_id: 309981111, entity_type: 1 }) → 422
```
**Correct API call:** `GET https://api.affinity.co/relationships-strengths?external_id={person_id}&internal_id=253573426`
**Root cause:** The v1 `/relationships-strengths` endpoint only works with person IDs (`external_id` must be a person). The connector needs to either:
- Reject org lookups with a clear message, OR
- Look up persons associated with the org and return the strongest relationship

### BUG-10: `get_relationship_strength` — "Last activity: unknown" even for active relationships
```
Test: get_relationship_strength({ entity_id: 253576561, entity_type: 0 })
Output: "Relationship strength with person 253576561: 100/100 (Very Strong)\nLast activity: unknown"
```
Jerry Walker (253576561) has email activity through March 14, 2026 (confirmed via `get_person`), but last activity shows "unknown".
**Root cause:** The v1 API response includes an `updated_at` or `last_interaction_at` field that is not being mapped to the "Last activity" display.

### BUG-11: `summarize_relationship` — broken for both person and org
```
Test: summarize_relationship({ person_id: 253576194 }) → "Not Found"
Test: summarize_relationship({ organization_id: 309981111 }) → 422
```
**Root cause:** This is a composite tool. Two different error types suggest two different internal code paths:
- Person path: calls an endpoint that returns 404 (missing route)
- Org path: calls an endpoint that returns 422 (possibly cascading from broken `get_relationship_strength` for orgs)

### BUG-12: `get_activity_timeline` — returns empty for entities with known activity
```
Tests:
  get_activity_timeline({ person_id: 253576561, limit: 5 }) → "No activity found."
  get_activity_timeline({ organization_id: 309981111, limit: 5 }) → "No activity found."
```
Jerry Walker (253576561) has email activity through March 14, 2026. Fox Innovation (309981111) has email activity through March 14, 2026. Both confirmed via `get_person`/`get_organization`.
**Root cause:** This is a composite tool that aggregates emails, meetings, and notes. Since `get_emails` (BUG-01), `get_meetings` (BUG-02), and `get_notes` (BUG-04) are all broken, this tool has no data sources and returns empty. Fixing BUG-01/02/04 should fix this automatically.

### BUG-13: `get_field_values` — Ranked Dropdown values shown as raw JSON
```
Test: get_field_values({ list_entry_id: 234808568 })
Output: Field 5600902: {"id":23488985,"text":"To Be Contacted","rank":1,"color":1}
```
**Expected:** Field 5600902: To Be Contacted
**Root cause:** Ranked Dropdown values are returned as objects by the API. The formatter should extract the `text` property instead of serializing the entire object.

### BUG-14: `get_field_value_changes` — dropdown values shown as raw JSON, user shows "undefined"
```
Output: [change:665494490] 3/3/2026 — list entry 235084849 → "{"id":23488985,"text":"To Be Contacted","rank":1,"color":1}" (by user undefined)
```
Two issues:
1. Value should display as "To Be Contacted" not raw JSON
2. User who made the change shows "undefined" — the `changer` or `actor` field is not being mapped

### BUG-15: `get_person` / `get_organization` — "Created: N/A" for all entities
```
Test: get_person({ person_id: 253573426 }) → "Created: N/A"
Test: get_organization({ org_id: 309981111 }) → "Created: N/A"
```
The Affinity v1 API returns `created_at` on person/org objects. The formatter is not mapping this field.

### BUG-16: `get_lists` — Opportunity lists show "Type 8" instead of "Opportunity"
```
Output: [339917] Prj Fox - Capital — Type 8, 34 entries, public
```
**Expected:** [339917] Prj Fox - Capital — Opportunity, 34 entries, public
**Root cause:** The list type enum mapping is missing the entry for type 8 = "Opportunity". Person (0) and Organization (1) are mapped correctly.

### BUG-17: `get_person` — interaction dates show "N/A" for persons with no interactions even when they have org-level interactions
```
Test: get_person({ person_id: 253576194 }) → all interaction dates "N/A"
```
James Avondet (253576194) is associated with org 309964174 (Energy Capital Solutions) which has interaction dates. This may be expected behavior if Affinity only tracks direct person-level interactions, but worth noting.

### BUG-18: Webhook events pipeline — not receiving or storing events
```
Test sequence:
1. create_note({ content: "test", person_ids: [253573426] }) → success (ID 30007367)
2. get_recent_events({ limit: 10, enrich: true }) → "No webhook events received yet."
3. delete_note({ note_id: 30007367 }) → success
4. get_recent_events({ limit: 10, enrich: true }) → "No webhook events received yet."
```
Webhook 23967 is registered and active at https://affinity.trulock.com/webhook.
**Root cause options (investigate in order):**
1. Is the Worker receiving POSTs? Check Cloudflare Worker logs for incoming requests to `/webhook`
2. Is the POST handler writing to KV? The handler may exist but not persist events
3. Is the KV namespace binding correct?
4. Is Affinity actually delivering? Check Affinity UI → Settings → Webhooks for delivery logs

### BUG-19: `create_webhook` schema — missing `subscriptions` parameter
The tool schema only exposes `webhook_url`. The Affinity v1 API `POST /webhook` accepts:
```json
{
  "webhook_url": "https://...",
  "subscriptions": ["person.created", "note.created", ...]
}
```
Without `subscriptions`, new webhooks may be created with empty subscription lists (subscribing to all events, which may or may not be intended).

### BUG-20: `list_webhooks` — Events list appears blank
```
Output: [webhook:23967] active — https://affinity.trulock.com/webhook\n  Events:
```
The "Events:" line is empty. Either the webhook genuinely subscribes to all events (empty array = all), or the subscriptions array is not being formatted. If subscribing to all events, the display should say "Events: all" for clarity.

---

## COSMETIC / LOW PRIORITY

### BUG-21: `get_field_definitions` scope=person — `Source of Introduction` shows as type "Person"
```
Output: [field:5526449] Source of Introduction — Person, global
```
The Affinity field type enum value 0 = "Person" (relationship field), which is technically correct — this is a relationship-type field that links to a person. However, it may be confusing to users. Consider displaying as "Relationship (Person)" for clarity.

### BUG-22: `get_field_definitions` — some fields show "Dropdown" that are actually enrichment fields
Fields like "Mailchimp Campaign Opened", "Job Titles", "Industry" show as "Dropdown" type. While technically correct (Affinity stores these as dropdown/multi-select internally), enrichment fields could be tagged as such for clarity.

---

## PASSING TOOLS (28 confirmed working)

| Tool | Status | Notes |
|------|--------|-------|
| `get_whoami` | PASS | Returns user, email, org correctly |
| `get_rate_limit` | PASS | Shows remaining/total/reset correctly |
| `search_people` | PASS | Returns correct results with interaction data |
| `search_organizations` | PASS | Returns correct results |
| `search_all` | PASS | Returns unified person/org/opp results |
| `semantic_search` | PASS | AI-powered org search works |
| `get_person` | PASS (minor: Created=N/A) | Core data correct |
| `get_organization` | PASS (minor: Created=N/A) | Core data correct |
| `find_intro_path` | PASS | Returns introducers with strength scores |
| `get_lists` | PASS (minor: Type 8 label) | Returns all 32 lists |
| `get_list_entries` | PASS | Returns entries with pagination |
| `get_field_definitions` | PASS | All scopes work, types now correct |
| `get_field_values` | PASS (minor: raw JSON for dropdowns) | Returns field data |
| `get_field_value_changes` | PASS (minor: raw JSON + undefined user) | Returns change history |
| `get_saved_views` | PASS | Returns view IDs and types |
| `get_saved_view_entries` | PASS | Returns entries through saved views |
| `get_chat_messages` | PASS | Returns clean empty response |
| `get_reminders` | PASS | Returns clean empty response |
| `get_transcripts` | PASS | Limit, cursor, filter all work |
| `get_transcript` | PASS | Speaker names, creator, pagination all work |
| `get_transcript_info` | PASS | Full AI summary with agenda/highlights/topics |
| `list_webhooks` | PASS | Returns webhook ID, state, URL |
| `get_recent_events` | PASS (no events) | Tool works but no events stored |
| `create_note` | PASS | Creates notes with associations |
| `update_note` | PASS | Updates note content |
| `delete_note` | PASS | Deletes note |
| `get_note_replies` | PASS | Returns clean empty for notes without replies |
| `get_relationship_strength` (person only) | PASS | Returns 0-100 score |

---

## UNTESTED (destructive or require specific preconditions)

| Tool | Reason not tested |
|------|-------------------|
| `create_person` | Would create live contact |
| `create_organization` | Would create live org |
| `create_opportunity` | Would create live deal (also: search_opportunities broken, can't verify) |
| `update_person` | Would modify live contact |
| `update_organization` | Would modify live org |
| `update_opportunity` | Would modify live deal |
| `update_reminder` | No reminders exist to update (create_reminder broken) |
| `update_webhook` | Only one webhook, don't want to break it |
| `delete_person` | DESTRUCTIVE |
| `delete_organization` | DESTRUCTIVE |
| `delete_opportunity` | DESTRUCTIVE |
| `delete_reminder` | No reminders exist |
| `delete_field_value` | Would remove live field data |
| `delete_webhook` | Would remove the only webhook |
| `create_webhook` | Would create duplicate webhook |
| `merge_persons` | DESTRUCTIVE |
| `merge_companies` | DESTRUCTIVE |
| `add_to_list` | Would add entry to live list |
| `remove_from_list` | Would remove entry from live list |
| `set_field_value` | Would modify live field data |
| `batch_set_field_values` | Would modify live field data |

---

## PRIORITY FIX ORDER

### Tier 1 — High impact, likely quick fixes
1. **BUG-01/02/03:** `get_emails`, `get_meetings`, `get_calls` — all three are Not Found. Likely one fix: the v2 interactions endpoint URL. Fixing these also fixes BUG-12 (`get_activity_timeline`).
2. **BUG-04:** `get_notes` — returns empty despite notes existing. Likely response parsing issue (`response.data` not being read).
3. **BUG-05/06:** `search_opportunities` / `get_opportunity` — both broken. Check v1 URL for `/opportunities`.

### Tier 2 — Important but more complex
4. **BUG-07:** `create_reminder` — 422 on all attempts. Check request body format against Affinity v1 docs.
5. **BUG-11:** `summarize_relationship` — two different failure modes for person vs org. Needs investigation of both code paths.
6. **BUG-18:** Webhook event pipeline — events not being received/stored. Check Worker logs and KV binding.

### Tier 3 — Display/formatting improvements
7. **BUG-09/10:** `get_relationship_strength` — org support and last_activity mapping.
8. **BUG-08:** `get_pipeline_summary` — 422 on all attempts.
9. **BUG-13/14:** Raw JSON in field values and change history — extract `text` from dropdown objects.
10. **BUG-15:** Created date not mapped on person/org.
11. **BUG-16:** "Type 8" → "Opportunity" in list type display.
12. **BUG-19/20:** Webhook tool schema and display improvements.
