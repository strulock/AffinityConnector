# Codebase Review — Security, Performance, Error Handling

Review date: 2026-03-08. Based on full read of all `src/` files.

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH | 0 |
| MEDIUM | 6 |
| LOW | 5 |

No critical or high-severity issues found. The authentication model (timing-safe webhook comparison, opt-in Cloudflare Access JWT, stateless MCP transport) is sound. The main work is closing a systemic try-catch gap in webhook tools, converting a sequential KV loop to parallel, and tightening a few input validation gaps.

---

## Phased Action Plan

### Phase 1 — Validation & Schema Fixes
Goal: tighten input validation across tools with minimal-risk Zod changes.

| # | Fix | Files | Status |
|---|-----|-------|--------|
| M4 | Add `.url()` + HTTPS check to `webhook_url` | `src/tools/webhooks.ts` | ✅ Done |
| M5 | Fix `entity_id` filter — use `Number()` coercion before `===` | `src/tools/webhooks.ts` | ✅ Done |
| M6 | Add `.min(1)` to all entity ID Zod params | `src/tools/*.ts` (~12 files) | ✅ Done |
| L1 | Remove env var name from 500 error message | `src/index.ts` | ✅ Done |
| L2 | Add `.min(1)` to `subscriptions` array schema | `src/tools/webhooks.ts` | ✅ Done |

**Completion gate:** all existing tests still pass.

---

### Phase 2 — Error Handling
Goal: close the try-catch gap in all unprotected tool handlers.

| # | Fix | Files | Status |
|---|-----|-------|--------|
| M2 | Add try-catch to `list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook` | `src/tools/webhooks.ts` | ✅ Done |
| L3 | Add try-catch to `get_saved_views`, `get_saved_view_entries` | `src/tools/lists.ts` | ✅ Done |

**Completion gate:** all existing tests still pass.

---

### Phase 3 — Performance
Goal: eliminate sequential bottlenecks and unbounded fetches.

| # | Fix | Files | Status |
|---|-----|-------|--------|
| M1 | Convert sequential KV event reads to `Promise.all` | `src/tools/webhooks.ts` | ✅ Done |
| M3 | Add `page_size` cap to `getFieldValuesByList`; surface truncation warning in tool | `src/affinity/lists.ts`, `src/tools/lists.ts` | ✅ Done |

**Completion gate:** all existing tests still pass.

---

### Phase 4 — Maintainability
Goal: clean up magic constants and a fragile type cast.

| # | Fix | Files | Status |
|---|-----|-------|--------|
| L4 | Extract `MAX_ORGS`, `MAX_CONNECTOR_CANDIDATES`, `MAX_INTRO_RESULTS` constants | `src/tools/intelligence.ts` | ✅ Done |
| L5 | Widen local `JWK` interface or add runtime field guard | `src/access.ts` | ✅ Done |

**Completion gate:** all existing tests still pass.

---

### Summary

| Phase | Issues | Status |
|-------|--------|--------|
| 1 — Validation & schema | M4, M5, M6, L1, L2 | ✅ Complete (482/482 tests passing) |
| 2 — Error handling | M2, L3 | ✅ Complete (482/482 tests passing) |
| 3 — Performance | M1, M3 | ✅ Complete (482/482 tests passing) |
| 4 — Maintainability | L4, L5 | ✅ Complete (482/482 tests passing) |

---

## MEDIUM Issues

---

### M1 — Sequential KV Reads in `get_recent_events` (PERFORMANCE)

**File:** `src/tools/webhooks.ts:115–118`

**Problem:**
Event IDs are read from KV one at a time inside a `for` loop. With up to 100 events in the recency index, this fires up to 100 sequential KV round-trips before returning a result.

```typescript
for (const id of recentIds) {
  const event = await cache.get<AffinityWebhookEvent>(`webhook:event:${id}`);
  if (event) events.push(event);
}
```

**Fix:**
Replace with a single parallel fetch:

```typescript
const maybeEvents = await Promise.all(
  recentIds.map(id => cache.get<AffinityWebhookEvent>(`webhook:event:${id}`))
);
const events = maybeEvents.filter((e): e is AffinityWebhookEvent => e !== null);
```

---

### M2 — Webhook Tools Missing try-catch (ERROR HANDLING)

**File:** `src/tools/webhooks.ts:29–96`

**Problem:**
`list_webhooks`, `create_webhook`, `update_webhook`, and `delete_webhook` have no try-catch. If the Affinity API throws (`AffinityPermissionError`, `AffinityNotFoundError`, network error, etc.), the exception propagates to the MCP layer unhandled, producing a raw error instead of a user-readable message.

```typescript
// e.g. list_webhooks:
async () => {
  const webhooks = await api.listWebhooks(); // ← can throw, no catch
  ...
}
```

**Fix:**
Wrap each handler body in `try { ... } catch (e) { return toolError(e); }` — the same pattern used by every other tool in the codebase.

---

### M3 — `get_pipeline_summary` Fetches All Field Values Without a Limit (PERFORMANCE)

**File:** `src/tools/lists.ts:296`, `src/affinity/lists.ts:117–123`

**Problem:**
`get_pipeline_summary` calls `getFieldValuesByList()`, which issues a single `GET /field-values` request with no `page_size` parameter. A large list (thousands of entries) will return an unbounded payload in one shot, consuming Worker memory and potentially timing out.

```typescript
// lists.ts — no page_size, no pagination
const values = await this.client.get<AffinityFieldValue[]>('/field-values', {
  list_id: listId,
  field_id: fieldId,
});
```

**Fix:**
Add a `page_size` cap (e.g. 500) and document the limit in the tool description. If the Affinity API supports cursor pagination here, implement it; otherwise surface a warning when results are truncated.

---

### M4 — No URL Validation on `webhook_url` Input (SECURITY)

**File:** `src/tools/webhooks.ts:45–46, 65–66`

**Problem:**
`webhook_url` is accepted as a free-form `z.string()`. There is no check that it is a valid `https://` URL. A malformed or internal URL passed by an LLM (or a user testing edge cases) would be sent directly to the Affinity API, which may register it successfully or return a confusing error.

**Fix:**
Add `.url()` and optionally an HTTPS-only check:

```typescript
webhook_url: z.string().url().refine(u => u.startsWith('https://'), {
  message: 'webhook_url must be an https:// URL',
}).describe('Target URL to receive events'),
```

---

### M5 — `entity_id` Filter Compares `unknown` Body Field to `number` (TYPE SAFETY / BUG RISK)

**File:** `src/tools/webhooks.ts:122–124`

**Problem:**
`e.body` is typed as `Record<string, unknown>`, so `e.body.id` and `e.body.entity_id` are `unknown`. The `===` comparison against `number entity_id` is type-unsafe and will silently return no matches if Affinity ever sends IDs as strings in the payload.

```typescript
filtered = filtered.filter(e => e.body.id === entity_id || e.body.entity_id === entity_id);
```

**Fix:**
Coerce before comparing:

```typescript
filtered = filtered.filter(e =>
  Number(e.body.id) === entity_id || Number(e.body.entity_id) === entity_id
);
```

---

### M6 — Entity ID Parameters Accept Zero and Negative Values (INPUT VALIDATION)

**File:** `src/tools/people.ts:48`, `src/tools/organizations.ts:49`, `src/tools/lists.ts:90`, and ~12 other tool files

**Problem:**
All `person_id`, `organization_id`, `list_id`, `field_id` etc. are declared as `z.number().int()` with no lower bound. Zero and negative integers are accepted and passed to the Affinity API, which will return a confusing 404 or 400 rather than a clear validation error.

**Fix:**
Add `.min(1)` to every entity ID parameter:

```typescript
person_id: z.number().int().min(1).describe('Affinity person ID'),
```

---

## LOW Issues

---

### L1 — Error Message Leaks Internal Environment Variable Name (SECURITY)

**File:** `src/index.ts:128`

**Problem:**
```typescript
return withCors(new Response("AFFINITY_API_KEY secret is not configured.", { status: 500 }));
```
The response body discloses the exact name of the secret in the Worker environment. While low-impact, this is unnecessary information for an attacker probing the endpoint.

**Fix:**
```typescript
return withCors(new Response("Server configuration error.", { status: 500 }));
```

---

### L2 — `webhooks` `subscriptions` Array Has No Minimum Length (INPUT VALIDATION)

**File:** `src/tools/webhooks.ts:45`

**Problem:**
`z.array(z.string())` allows an empty array `[]`. Registering a webhook with zero subscriptions is probably rejected by the Affinity API with an opaque error rather than a clear client-side message.

**Fix:**
```typescript
subscriptions: z.array(z.string()).min(1).describe('Event types to subscribe to'),
```

---

### L3 — `get_saved_views` and `get_saved_view_entries` Missing try-catch (ERROR HANDLING)

**File:** `src/tools/lists.ts:246–258`, `src/tools/lists.ts:319–340`

**Problem:**
Unlike most tools in `lists.ts`, `get_saved_views` and `get_saved_view_entries` have no try-catch. An API error (e.g. `AffinityPermissionError`) propagates uncaught.

**Fix:**
Wrap handler bodies in `try { ... } catch (e) { return toolError(e); }`.

---

### L4 — Magic Constants in `find_intro_path` (MAINTAINABILITY)

**File:** `src/tools/intelligence.ts:81, 108, 123`

**Problem:**
The limits `slice(0, 3)` (max orgs), `slice(0, 20)` (max connectors), and `slice(0, 10)` (top candidates for name lookup) are repeated magic numbers with no explanation of why those values were chosen.

**Fix:**
Extract as named constants near the top of the function or file:

```typescript
const MAX_ORGS = 3;
const MAX_CONNECTOR_CANDIDATES = 20;
const MAX_INTRO_RESULTS = 10;
```

---

### L5 — `as unknown as JsonWebKey` Cast in JWT Verification (TYPE SAFETY)

**File:** `src/access.ts:27`

**Problem:**
```typescript
const key = await crypto.subtle.importKey(
  "jwk", jwk as unknown as JsonWebKey, ...
```
The local `JWK` interface only has `kid`, `n`, `e` — a strict subset of `JsonWebKey`. The double cast is required because TypeScript's `JsonWebKey` type is broader. The cast is intentional and safe here (the crypto API ignores unknown fields), but it bypasses type checking entirely and could mask a structural mismatch if the Cloudflare JWKS format changes.

**Fix (optional):**
Either widen the local `JWK` interface to include the standard `JsonWebKey` fields (`kty`, `alg`, `use`), or add a runtime guard:

```typescript
if (typeof jwk.n !== 'string' || typeof jwk.e !== 'string') continue;
```

---

## Not Issues (False Positives Dismissed)

- **CORS hardcoded to `https://claude.ai`** — intentional; this Worker is exclusively for claude.ai MCP connections.
- **`Promise.all` in `search_all`** — fans out exactly 3 fixed calls, not unbounded.
- **Silent org-fetch failures in `find_intro_path`** — already fixed in Phase 3 (Fix 5); `skippedOrgs` counter now surfaces the note to users.
- **`stableKey` / `JSON.stringify` cache keys** — already fixed in Phase 2 (Fixes 1, 8).
- **`Record<string, unknown>` in `AffinityClient.apiRequest`** — intentional; the HTTP client is designed to accept arbitrary query param objects.
- **`timingSafeEqual` using hardcoded HMAC key** — valid pattern for constant-time string comparison; the fixed key normalises output length without affecting correctness.
