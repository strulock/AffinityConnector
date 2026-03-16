# Affinity Connector Retest Report — March 15, 2026

Retested all 22 previously reported bugs. Results below.
Connector: https://affinity.trulock.com

---

## FIXED (12 bugs resolved)

| Bug | Tool | Previous Error | Now |
|-----|------|---------------|-----|
| BUG-04 | `get_notes` | Always returned empty | Returns notes with full content, dates, person associations |
| BUG-05 | `search_opportunities` | Always returned empty | Returns 34 Fox opportunities with person/org/list counts |
| BUG-06 | `get_opportunity` | 422 Unprocessable Entity | Returns name, ID, people, orgs, list memberships (minor: "Created: Invalid Date") |
| BUG-09 | `get_relationship_strength` (org) | 422 | Now returns helpful error: "only available for people" |
| BUG-12 | `get_activity_timeline` | Always returned empty | Returns chronological notes with dates and content previews |
| BUG-13 | `get_field_values` | Ranked Dropdown shown as raw JSON | Now shows "To Be Contacted" instead of `{"id":23488985,...}` |
| BUG-14 | `get_field_value_changes` | Values shown as raw JSON | Now shows "To Be Contacted" instead of raw JSON |
| BUG-16 | `get_lists` | "Type 8" for opportunity lists | Now shows "Opportunity" |
| BUG-19 | `create_webhook` schema | Missing `subscriptions` param | Schema now present |
| BUG-21 | Field type labels | Confusing "Person" for relationship fields | Acceptable — not a bug |
| BUG-22 | Enrichment field labels | Showing as "Dropdown" | Acceptable — technically correct |

---

## STILL BROKEN (10 bugs remaining)

### BUG-01: `get_emails` — Not Found
```
Test: get_emails({ limit: 3 })
Error: Not found: Not Found
```
API: `GET https://api.affinity.co/v2/interactions?type=email` or equivalent v2 email endpoint

### BUG-02: `get_meetings` — Not Found
```
Test: get_meetings({ limit: 3 })
Error: Not found: Not Found
```
API: `GET https://api.affinity.co/v2/interactions?type=meeting` or equivalent

### BUG-03: `get_calls` — Not Found
```
Test: get_calls({ limit: 3 })
Error: Not found: Not Found
```
API: `GET https://api.affinity.co/v2/interactions?type=call` or equivalent

### BUG-07: `create_reminder` — 422
```
Test: create_reminder({ content: "Test", due_date: "2026-03-20", person_ids: [253573426] })
Error: Affinity API error 422: Unprocessable Entity
```
Validation logic works (rejects missing associations), so the handler exists. The 422 from Affinity suggests request body format is wrong. Check: does `due_date` need ISO 8601 datetime instead of YYYY-MM-DD? Does the API use `reset_date` or `remind_at` instead of `due_date`? Check Affinity v1 `POST /reminders` docs for exact field names.

### BUG-08: `get_pipeline_summary` — 422
```
Test: get_pipeline_summary({ list_id: 339917, field_id: 5600902 })
Error: Affinity API error 422: Unprocessable Entity
```
This is a composite tool that fetches list entries and groups by field value. The 422 originates from an internal Affinity API call — investigate which call is failing.

### BUG-10: `get_relationship_strength` — "Last activity: unknown"
```
Test: get_relationship_strength({ entity_id: 253576561, entity_type: 0 })
Output: "Relationship strength with person 253576561: 100/100 (Very Strong)\nLast activity: unknown"
```
Jerry Walker has email activity through March 14, 2026 (confirmed via `get_person`). The Affinity v1 API returns `updated_at` or `last_interaction` on the relationship-strength response — the formatter is not mapping it.

### BUG-11: `summarize_relationship` — Not Found for both person and org
```
Test: summarize_relationship({ person_id: 253576561 }) → Not Found
Test: summarize_relationship({ organization_id: 309981111 }) → Not Found
```
Previously the org path returned 422 and person path returned Not Found. Now both return Not Found. This is a composite tool — check what internal endpoint(s) it calls and whether the route is registered.

### BUG-14 (partial): `get_field_value_changes` — user still shows "undefined"
```
Output: [change:665494490] 3/3/2026 — list entry 235084849 → "To Be Contacted" (by user undefined)
```
The value display is now fixed (shows "To Be Contacted"), but the user/actor who made the change still shows "undefined". The v1 API returns a `changer` object on field value change records — map the changer's name.

### BUG-15: `get_person` / `get_organization` — "Created: N/A"
```
Test: get_person({ person_id: 253576561 }) → "Created: N/A"
Test: get_organization({ org_id: 309981111 }) → "Created: N/A"
```
The Affinity v1 API returns `created_at` on entity records. Still not being mapped.

### BUG-06 (partial): `get_opportunity` — "Created: Invalid Date"
```
Test: get_opportunity({ opportunity_id: 100991521 })
Output: "Created: Invalid Date"
```
This is new — the opportunity endpoint now works but the created date is being parsed incorrectly. The `created_at` value from the API is likely being passed to `new Date()` in a format it can't parse, resulting in "Invalid Date".

### BUG-18: Webhook events — still not receiving
```
Test: get_recent_events({ limit: 10, enrich: true }) → "No webhook events received yet."
```
Despite note creation and deletion activity in the workspace, no events are being stored. Check:
1. Cloudflare Worker logs — are POSTs arriving at `/webhook`?
2. POST handler — is it writing to KV?
3. KV namespace binding — is it configured correctly?
4. Affinity webhook delivery logs — is Affinity sending events?

### BUG-20: `list_webhooks` — Events list still blank
```
Output: [webhook:23967] active — https://affinity.trulock.com/webhook\n  Events:
```
Still shows empty events line. If empty subscriptions = all events, display "Events: all" for clarity.

---

## SUMMARY

| Status | Count |
|--------|-------|
| Fixed | 12 |
| Still broken | 10 |
| — Hard errors (Not Found / 422) | 6 |
| — Display/formatting issues | 4 |

### Priority fix order:
1. **BUG-01/02/03** — `get_emails`/`get_meetings`/`get_calls` — all Not Found, likely same root cause
2. **BUG-07** — `create_reminder` — 422, check request body format
3. **BUG-11** — `summarize_relationship` — Not Found on both code paths
4. **BUG-18** — Webhook pipeline not storing events
5. **BUG-08** — `get_pipeline_summary` — 422
6. **BUG-10/14/15/06** — Display fixes: last_activity, changer name, created_at, Invalid Date
