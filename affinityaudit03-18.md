# Affinity Connector Retest #2 — March 15, 2026

Retested all 10 previously remaining bugs. Results below.

---

## NEWLY FIXED (4 bugs resolved this round)

| Bug | Tool | Previous Error | Now |
|-----|------|---------------|-----|
| BUG-11 | `summarize_relationship` (person) | Not Found | Returns full profile, strength, notes, interactions |
| BUG-11 | `summarize_relationship` (org) | Not Found | Returns profile with strength caveat and org-level data |
| BUG-14 | `get_field_value_changes` user | "by user undefined" | Now shows "by Scott Trulock" |
| BUG-20 | `list_webhooks` events display | Empty "Events:" line | Now shows "Events: all" |
| BUG-06 | `get_opportunity` Created field | "Created: Invalid Date" | Now shows "Created: N/A" (consistent with person/org) |

**Note on BUG-11 org path:** `summarize_relationship({ organization_id })` works but "Recent Notes" section returns empty even though notes exist for persons associated with the org. The tool should ideally pull notes attached to the org's associated persons. Low priority.

---

## STILL BROKEN (6 bugs remaining)

### BUG-01: `get_emails` — Not Found
```
Test: get_emails({ limit: 3 })
Error: Not found: Not Found
```

### BUG-02: `get_meetings` — Not Found
```
Test: get_meetings({ limit: 3 })
Error: Not found: Not Found
```

### BUG-03: `get_calls` — Not Found
```
Test: get_calls({ limit: 3 })
Error: Not found: Not Found
```

**These three share the same root cause.** The Affinity v2 interactions API uses a single endpoint with type filtering. The correct calls should be:
```
GET https://api.affinity.co/v2/interactions?type=0  (emails)
GET https://api.affinity.co/v2/interactions?type=1  (events/meetings)  
GET https://api.affinity.co/v2/interactions?type=2  (calls)
```
Or alternatively the type values may be string-based like `type=email`, `type=meeting`, `type=call`. Check the Affinity v2 interactions API documentation for the exact endpoint path and type parameter values.

### BUG-07: `create_reminder` — 422 Unprocessable Entity
```
Test: create_reminder({ content: "Test", due_date: "2026-03-20", person_ids: [253573426] })
Error: Affinity API error 422: Unprocessable Entity
```
The Affinity v1 reminders API is `POST https://api.affinity.co/reminders`. The 422 suggests the request body format doesn't match what the API expects. Possible issues:
- The API may expect `person` (singular object with `id` field) instead of `person_ids` (array)
- The `due_date` format may need to be ISO 8601 datetime (e.g., `2026-03-20T00:00:00Z`) instead of just `YYYY-MM-DD`
- The API may expect `reset_at` or `remind_at` instead of `due_date`
- Check the exact v1 request body schema in Affinity docs

### BUG-08: `get_pipeline_summary` — 422 Unprocessable Entity
```
Test: get_pipeline_summary({ list_id: 339917, field_id: 5600902 })
Error: Affinity API error 422: Unprocessable Entity
```
This is a composite tool that fetches list entries and groups by a field value. The 422 is coming from one of the internal Affinity API calls. Add error logging to identify which specific API call is returning 422 and with what parameters.

### BUG-15: `get_person` / `get_organization` / `get_opportunity` — "Created: N/A"
```
get_person({ person_id: 253576561 }) → "Created: N/A"
get_organization({ org_id: 309981111 }) → "Created: N/A"
get_opportunity({ opportunity_id: 100991521 }) → "Created: N/A"
```
All three entity types show "Created: N/A". The Affinity v1 API returns `created_at` as a field on person, organization, and opportunity objects. The formatter is not mapping this field. This is the same issue across all three entity types — one fix in the shared formatting logic.

### BUG-10: `get_relationship_strength` — "Last activity: unknown"
```
Test: get_relationship_strength({ entity_id: 253576561, entity_type: 0 })
Output: "Relationship strength with person 253576561: 100/100 (Very Strong)\nLast activity: unknown"
```
The strength score works correctly (100/100) but the last activity date is not being read from the API response. The v1 API `GET /relationships-strengths` returns an `updated_at` or similar timestamp field — map it to the display.

### BUG-18: Webhook events — not receiving
```
Test: get_recent_events({ limit: 10, enrich: true })
Result: "No webhook events received yet."
```
Despite active note creation/deletion in the workspace, no events are stored. Investigation needed:
1. Check Cloudflare Worker logs for incoming POST requests to `/webhook`
2. Check if the POST handler is writing to KV
3. Verify KV namespace binding in wrangler.toml
4. Check Affinity webhook delivery status in Affinity UI → Settings → Webhooks

---

## OVERALL STATUS

| Category | Count |
|----------|-------|
| Total bugs reported | 22 |
| Fixed | 16 |
| Remaining | 6 |

### Remaining by priority:
1. **BUG-01/02/03** — `get_emails`/`get_meetings`/`get_calls` — Not Found (same root cause, one fix)
2. **BUG-07** — `create_reminder` — 422 (request body format)
3. **BUG-08** — `get_pipeline_summary` — 422 (internal API call issue)
4. **BUG-18** — Webhook events not stored (infrastructure issue)
5. **BUG-15** — Created: N/A on all entities (display fix)
6. **BUG-10** — Last activity: unknown on relationship strength (display fix)
