#!/usr/bin/env npx tsx
/**
 * Inspect the Affinity v1 /field-values endpoint to find correct params.
 *
 * The pipeline summary tool sends list_id + field_id, which may not be valid.
 * This script tests various parameter combinations.
 *
 * Usage:
 *   AFFINITY_API_KEY=<key> npx tsx scripts/inspect-field-values.ts
 */

const API_KEY = process.env.AFFINITY_API_KEY;
if (!API_KEY) { console.error('Set AFFINITY_API_KEY'); process.exit(1); }

const headers = { Authorization: `Bearer ${API_KEY}` };

// From the audit: list_id 339917, field_id 5600902 (Ranked Dropdown)
const LIST_ID = 339917;
const FIELD_ID = 5600902;

async function tryGet(label: string, params: Record<string, unknown>) {
  const url = new URL('https://api.affinity.co/field-values');
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  console.log(`\n── ${label} ──`);
  console.log(`  GET ${url}`);
  const res = await fetch(url.toString(), { headers });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  console.log(`  Status: ${res.status}`);
  if (res.status !== 200) {
    console.log(`  Response: ${JSON.stringify(parsed)}`);
  } else if (Array.isArray(parsed)) {
    console.log(`  Returned ${parsed.length} value(s)`);
    if (parsed.length > 0) {
      console.log(`  First entry keys: ${Object.keys(parsed[0]).join(', ')}`);
      console.log(`  First entry: ${JSON.stringify(parsed[0]).slice(0, 200)}`);
    }
  } else if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed as Record<string, unknown>);
    console.log(`  Response keys: ${keys.join(', ')}`);
    // Check if it's wrapped
    for (const k of keys) {
      const v = (parsed as Record<string, unknown>)[k];
      if (Array.isArray(v)) {
        console.log(`  ${k}: ${v.length} item(s)`);
        if (v.length > 0) {
          console.log(`  First ${k} entry keys: ${Object.keys(v[0]).join(', ')}`);
          console.log(`  First ${k} entry: ${JSON.stringify(v[0]).slice(0, 200)}`);
        }
      }
    }
  }
  return res.status;
}

async function main() {
  console.log('Inspecting v1 GET /field-values endpoint...');

  // First, get a list entry ID from the list
  console.log('\n══ Getting a list entry from list', LIST_ID, '══');
  const entriesRes = await fetch(
    `https://api.affinity.co/lists/${LIST_ID}/list-entries?page_size=1`,
    { headers },
  );
  const entriesData = await entriesRes.json() as { list_entries?: Array<{ id: number; entity_id: number; entity_type: number }> };
  const firstEntry = entriesData.list_entries?.[0];
  console.log(`  First entry: ${JSON.stringify(firstEntry)?.slice(0, 200)}`);
  const LIST_ENTRY_ID = firstEntry?.id;
  const ENTITY_ID = firstEntry?.entity_id;

  // Variation 1: Our current format (list_id + field_id)
  await tryGet('list_id + field_id (current code)', { list_id: LIST_ID, field_id: FIELD_ID });

  // Variation 2: list_id + field_id + page_size
  await tryGet('list_id + field_id + page_size=10', { list_id: LIST_ID, field_id: FIELD_ID, page_size: 10 });

  // Variation 3: Just list_entry_id (the documented param)
  if (LIST_ENTRY_ID) {
    await tryGet('list_entry_id only (documented)', { list_entry_id: LIST_ENTRY_ID });
  }

  // Variation 4: list_entry_id + field_id
  if (LIST_ENTRY_ID) {
    await tryGet('list_entry_id + field_id', { list_entry_id: LIST_ENTRY_ID, field_id: FIELD_ID });
  }

  // Variation 5: entity_id (person/org)
  if (ENTITY_ID) {
    // Try as opportunity_id since this is an opportunity list (type 8)
    await tryGet('opportunity_id (entity_id from list)', { opportunity_id: ENTITY_ID });
  }

  // Variation 6: Just field_id
  await tryGet('field_id only', { field_id: FIELD_ID });

  // Variation 7: No params at all
  await tryGet('No params', {});

  // Variation 8: list_id only
  await tryGet('list_id only', { list_id: LIST_ID });

  // Variation 9: Try v2 endpoint
  console.log('\n══ Checking v2 field values ══');
  if (LIST_ENTRY_ID) {
    const v2Url = `https://api.affinity.co/v2/lists/${LIST_ID}/list-entries/${LIST_ENTRY_ID}/fields/${FIELD_ID}`;
    console.log(`  GET ${v2Url}`);
    const v2Res = await fetch(v2Url, { headers });
    console.log(`  Status: ${v2Res.status}`);
    if (v2Res.ok) {
      const v2Data = await v2Res.json();
      console.log(`  Response: ${JSON.stringify(v2Data).slice(0, 300)}`);
    } else {
      console.log(`  Response: ${await v2Res.text()}`);
    }
  }
}

main().catch(console.error);
