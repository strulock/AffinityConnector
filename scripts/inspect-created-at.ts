#!/usr/bin/env npx tsx
/**
 * Inspect the raw v1 API response for person, organization, and opportunity
 * to find the actual field name for the creation timestamp.
 *
 * Usage:
 *   AFFINITY_API_KEY=<key> npx tsx scripts/inspect-created-at.ts
 */

const API_KEY = process.env.AFFINITY_API_KEY;
if (!API_KEY) {
  console.error('Set AFFINITY_API_KEY');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${API_KEY}` };

// Known IDs from the audit
const PERSON_ID = 253573426;   // Scott Trulock
const ORG_ID = 309981111;      // Fox Innovation
const OPP_ID = 100991521;      // Known opportunity

async function inspect(label: string, url: string) {
  console.log(`\n══ ${label} ══`);
  console.log(`GET ${url}`);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.log(`  ERROR: ${res.status} ${res.statusText}`);
    return;
  }
  const data = await res.json() as Record<string, unknown>;

  // Show ALL top-level keys
  console.log(`  Top-level keys: ${Object.keys(data).join(', ')}`);

  // Look for anything with "creat" or "date" or "time" in the name
  const dateKeys = Object.keys(data).filter(k =>
    /creat|date|time|at$/i.test(k)
  );
  console.log(`  Date-like keys: ${dateKeys.length ? dateKeys.join(', ') : '(none)'}`);
  for (const k of dateKeys) {
    console.log(`    ${k}: ${JSON.stringify(data[k])}`);
  }

  // Also check with_interaction_dates variant
  if (label.startsWith('Person') || label.startsWith('Organization')) {
    const url2 = `${url}${url.includes('?') ? '&' : '?'}with_interaction_dates=true`;
    console.log(`\n  GET ${url2}`);
    const res2 = await fetch(url2, { headers });
    if (res2.ok) {
      const data2 = await res2.json() as Record<string, unknown>;
      const dateKeys2 = Object.keys(data2).filter(k =>
        /creat|date|time|at$/i.test(k)
      );
      console.log(`  Date-like keys (with_interaction_dates): ${dateKeys2.length ? dateKeys2.join(', ') : '(none)'}`);
      for (const k of dateKeys2) {
        console.log(`    ${k}: ${JSON.stringify(data2[k])}`);
      }
    }
  }
}

async function main() {
  console.log('Inspecting v1 API responses for created_at field...\n');

  await inspect('Person (v1)', `https://api.affinity.co/persons/${PERSON_ID}`);
  await inspect('Organization (v1)', `https://api.affinity.co/organizations/${ORG_ID}`);
  await inspect('Opportunity (v1)', `https://api.affinity.co/opportunities/${OPP_ID}`);

  // Also check v2 endpoints
  await inspect('Person (v2)', `https://api.affinity.co/v2/persons/${PERSON_ID}`);
  await inspect('Organization (v2 — company)', `https://api.affinity.co/v2/companies/${ORG_ID}`);
  await inspect('Opportunity (v2)', `https://api.affinity.co/v2/opportunities/${OPP_ID}`);
}

main().catch(console.error);
