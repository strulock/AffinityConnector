# Code Review Fix Plan

Issues identified during codebase review (2026-03-08). Ordered by priority.

---

## Fix 1 — Cache Key Ordering Bug (HIGH)

**Files:** `src/affinity/notes.ts`, `src/affinity/reminders.ts`

**Problem:**
`JSON.stringify(params)` is used to build cache keys but JavaScript object key iteration order is not guaranteed when keys are added in different orders. Two logically identical filter objects (`{person_id: 1, org_id: 2}` vs `{org_id: 2, person_id: 1}`) can produce different cache keys, causing cache misses or serving wrong cached data.

**Affected lines:**
- `notes.ts:22` — `` `notes:${JSON.stringify(filters)}` ``
- `notes.ts:67` — `` `interactions:${JSON.stringify(filters)}` ``
- `reminders.ts:19` — `` `reminders:${JSON.stringify(params)}` ``

**Fix:**
Replace `JSON.stringify(obj)` with a deterministic serializer that sorts keys alphabetically before stringifying.

```typescript
// Proposed helper (add to each file or extract to a shared util):
function stableKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
  );
  return `${prefix}:${JSON.stringify(sorted)}`;
}
```

**Tests to add/update:**
`test/affinity/notes.test.ts`, `test/affinity/reminders.test.ts` — add a test that calls `getNotes`/`getReminders` with the same params in different key orders and confirms fetch is only called once (cache hit).

---

## Fix 2 — Silent `?? 0` Fallback in `set_field_value` Tool (HIGH)

**File:** `src/tools/lists.ts:152-158`

**Problem:**
The existing validation guard (lines 143–150) correctly rejects calls without required create-path params. But the `api.setFieldValue()` call immediately after passes `entity_id: entity_id ?? 0` and `list_entry_id: list_entry_id ?? 0`. If the guard somehow passes (e.g. after future refactoring), `0` is silently used as a real ID — a valid-looking but incorrect value that could create a field value on the wrong entity.

**Affected lines:**
```typescript
// src/tools/lists.ts:153-158
const result = await api.setFieldValue({
  field_id,
  entity_id: entity_id ?? 0,       // ← dangerous fallback
  entity_type: entity_type ?? 0,    // ← dangerous fallback
  list_entry_id: list_entry_id ?? 0, // ← dangerous fallback
  value,
  field_value_id,
});
```

**Fix:**
Remove the `?? 0` fallbacks. After the validation guard, these values are guaranteed to be defined on the create path. Use the raw values and rely on TypeScript's narrowing:

```typescript
const result = await api.setFieldValue({
  field_id,
  entity_id: entity_id!,
  entity_type: entity_type!,
  list_entry_id: list_entry_id!,
  value,
  field_value_id,
});
```

Or restructure to make the types explicit by branching on `field_value_id`:

```typescript
if (field_value_id != null) {
  const result = await api.setFieldValue({ field_id, entity_id: 0, entity_type: 0, list_entry_id: 0, value, field_value_id });
  // ...
} else {
  // entity_id, entity_type, list_entry_id guaranteed non-null here
  const result = await api.setFieldValue({ field_id, entity_id: entity_id!, entity_type: entity_type!, list_entry_id: list_entry_id!, value });
  // ...
}
```

**Tests to add/update:**
`test/tools/lists.test.ts` — add test confirming that the API is called with the exact `entity_id`/`list_entry_id` provided, not 0.

---

## Fix 3 — `find_intro_path` Has Zero Test Coverage (HIGH)

**File:** `src/tools/intelligence.ts` (approximately lines 56–147)

**Problem:**
`find_intro_path` is the most complex tool in the codebase — it makes up to ~25 API calls (person fetch, 3 org fetches, up to 20 strength scores, up to 10 person name fetches) with multiple failure modes. It has zero automated tests.

**Fix:**
Add tests to `test/tools/intelligence.test.ts` covering:

1. Happy path — target has orgs, shared members, returns ranked intro list
2. Target person not found — returns "no intro path" message
3. Target has no org associations — returns "no mutual connections" message
4. Org fetch fails silently — result still returned, missing org's members excluded
5. No shared contacts above threshold — appropriate message returned
6. Single best introducer returned when only one match

Use the existing mock API pattern from the file (mock `PeopleApi`, `OrganizationsApi` etc. independently).

---

## Fix 4 — Merge Poll Loop Has No Error Handling (MEDIUM)

**File:** `src/tools/merges.ts:13–27`

**Problem:**
If `api.getMergeTaskStatus()` throws during polling (network error, auth failure, rate limit), the exception propagates out of `pollUntilDone` uncaught, crashing the tool call without a user-friendly message.

**Affected code:**
```typescript
async function pollUntilDone(api, taskId, type, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const task = await api.getMergeTaskStatus(taskId, type); // ← can throw
    // ...
  }
  return api.getMergeTaskStatus(taskId, type); // ← can also throw
}
```

**Fix:**
Wrap the poll loop in try-catch and return a synthetic "unknown" task state on failure:

```typescript
async function pollUntilDone(
  api: MergesApi,
  taskId: string,
  type: 'person' | 'company',
  maxAttempts = 5,
): Promise<AffinityMergeTask | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const task = await api.getMergeTaskStatus(taskId, type);
      if (task.status === 'completed' || task.status === 'failed') return task;
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch {
      // Network/auth failure during polling — bail out
      return null;
    }
  }
  try {
    return await api.getMergeTaskStatus(taskId, type);
  } catch {
    return null;
  }
}
```

Update callers to handle `null` return by returning a user-friendly "merge initiated but status unknown" message with the task ID.

**Tests to add:**
`test/tools/merges.test.ts` — add test for `getMergeTaskStatus` throwing during poll, confirm tool returns graceful message with task ID.

---

## Fix 5 — Silent Error Swallowing in Intelligence Tool (MEDIUM)

**File:** `src/tools/intelligence.ts` (find_intro_path), `src/affinity/intelligence.ts`

**Problem:**
Multiple `.catch(() => null)` calls in the intro path logic cause silent partial failures. If org or person fetches fail due to permissions or API errors, those records are simply excluded from results with no indication to the user.

**Example:**
```typescript
const org = await orgsApi.getById(orgId).catch(() => null); // silent failure
```

**Fix:**
Track fetch failures and surface them in the tool response:

```typescript
let skippedOrgs = 0;
for (const orgId of orgIds.slice(0, 3)) {
  const org = await orgsApi.getById(orgId).catch(() => {
    skippedOrgs++;
    return null;
  });
  // ...
}

// In output:
if (skippedOrgs > 0) {
  text += `\n\n(Note: ${skippedOrgs} organization(s) could not be fetched and were excluded from the intro path.)`;
}
```

**Tests to add:**
Covered by Fix 3 test case #4.

---

## Fix 6 — No Date Format Validation on `due_date` in Reminders (MEDIUM)

**File:** `src/tools/reminders.ts:44`

**Problem:**
`due_date` is validated only as a `z.string()`. Invalid values like `"next Tuesday"`, `"2024-13-45"`, or `""` pass validation and are sent to the Affinity API, which may accept them silently or return a confusing error.

**Fix:**
Add a regex check to the Zod schema:

```typescript
due_date: z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be in YYYY-MM-DD format')
  .describe('Due date in YYYY-MM-DD format'),
```

Also apply to `update_reminder`'s `due_date` field.

**Tests to add:**
`test/tools/reminders.test.ts` — add tests confirming that invalid date strings (e.g. `"not-a-date"`, `"2024-13-45"`) are rejected before the API is called.

---

## Fix 7 — Add Type Documentation to `AffinitySearchResult` (LOW)

**File:** `src/affinity/types.ts:60–64`

**Problem:**
```typescript
export interface AffinitySearchResult<T> {
  persons?: T[];
  organizations?: T[];
  next_page_token?: string | null;
}
```
No documentation on which field is populated for which entity type. Callers have to guess.

**Fix:**
Add JSDoc comments:

```typescript
/**
 * Paginated search result from the Affinity v2 search endpoints.
 * - `persons` is populated when searching for people
 * - `organizations` is populated when searching for companies
 * Only one field will be non-null per response.
 */
export interface AffinitySearchResult<T> {
  persons?: T[];
  organizations?: T[];
  next_page_token?: string | null;
}
```

---

## Fix 8 — Standardize Cache Key Format Across API Classes (LOW)

**Files:** `src/affinity/notes.ts`, `src/affinity/reminders.ts` (after Fix 1), `src/affinity/lists.ts`, `src/affinity/people.ts`, `src/affinity/organizations.ts`

**Problem:**
Cache key formats are inconsistent:
- Some use template strings: `` `people:search:${term}:${limit}` ``
- Some use `JSON.stringify`: `` `notes:${JSON.stringify(filters)}` ``
- Some combine both: `` `list-entries:${listId}:${limit}:${pageToken ?? ''}` ``

This makes debugging cache issues harder and creates risk of future collisions.

**Fix:**
After Fix 1 introduces `stableKey()`, migrate all `JSON.stringify`-based keys to use it. Document the key format convention in a comment in `cache.ts`:

```typescript
// Cache key convention: "<namespace>:<sorted-params-json>"
// Use stableKey(namespace, params) from each API module to ensure consistent serialization.
```

No behaviour change — this is a consistency/maintainability fix.

---

## Fix 9 — Remove Dangerous `as unknown as T` Cast in Client (LOW)

**File:** `src/affinity/client.ts` (204 No Content handling)

**Problem:**
```typescript
if (response.status === 204) return undefined as unknown as T;
```
The double cast (`as unknown as T`) is a type lie — it tells TypeScript that `undefined` is a `T`, which can cause runtime errors if callers don't check for `undefined`.

**Fix:**
The API classes that call `del()` already handle the void return correctly (they `await` and ignore the result). Change `fetchWithRetry` to be explicit about the 204 case:

```typescript
// Option A: Return undefined and update callers to expect it
async fetchWithRetry<T>(/* ... */): Promise<T | undefined>

// Option B (minimal change): Keep as-is but add a comment
if (response.status === 204) return undefined as unknown as T; // callers of del() ignore return value
```

Option B is acceptable given the existing call sites are all correct. At minimum, add the clarifying comment.

---

## Implementation Order

| # | Fix | Priority | Effort | Files Changed |
|---|-----|----------|--------|---------------|
| 1 | Cache key ordering | HIGH | Small | notes.ts, reminders.ts + tests |
| 2 | `?? 0` fallback removal | HIGH | Trivial | lists.ts + tests |
| 3 | find_intro_path tests | HIGH | Medium | intelligence.test.ts |
| 4 | Merge poll error handling | MEDIUM | Small | merges.ts + tests |
| 5 | Intelligence silent failures | MEDIUM | Small | intelligence.ts |
| 6 | Date format validation | MEDIUM | Trivial | reminders.ts + tests |
| 7 | AffinitySearchResult JSDoc | LOW | Trivial | types.ts |
| 8 | Standardize cache keys | LOW | Small | notes.ts, reminders.ts (after Fix 1) |
| 9 | `as unknown as T` cast | LOW | Trivial | client.ts |

**Estimated total:** ~4–6 hours of focused implementation work.

---

## Out of Scope (Accepted as-is)

The following items from the review were evaluated but intentionally left unfixed:

- **Client-side rate limiting / request queuing** — The existing 429 retry with exponential backoff is sufficient for the current usage model. Full request queuing adds significant complexity with minimal benefit for a single-team tool.
- **URL validation on custom base URLs** — The base URL options are internal-only and not user-facing; they come from `wrangler.toml` / test fixtures, not user input.
- **Email length/spam validation** — Affinity's API will reject malformed emails; double-validation adds complexity without meaningful protection.
- **Coverage thresholds for TTL values** — Cache TTLs are a configuration concern, not logic; testing them would be testing the language, not the code.
