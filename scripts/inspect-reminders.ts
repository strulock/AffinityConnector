#!/usr/bin/env npx tsx
/**
 * Inspect the Affinity v1 reminders API to find the correct request body format.
 *
 * Tests multiple body variations to find what the API accepts.
 *
 * Usage:
 *   AFFINITY_API_KEY=<key> npx tsx scripts/inspect-reminders.ts
 */

const API_KEY = process.env.AFFINITY_API_KEY;
if (!API_KEY) { console.error('Set AFFINITY_API_KEY'); process.exit(1); }

const headers: Record<string, string> = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

const PERSON_ID = 253573426; // Scott Trulock

async function tryCreate(label: string, body: unknown) {
  console.log(`\n── ${label} ──`);
  console.log(`  Body: ${JSON.stringify(body)}`);
  const res = await fetch('https://api.affinity.co/reminders', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  console.log(`  Status: ${res.status}`);
  console.log(`  Response: ${JSON.stringify(parsed, null, 2)}`);

  // If created, delete it immediately
  if (res.status === 200 || res.status === 201) {
    const created = parsed as { id?: number };
    if (created.id) {
      console.log(`  ✅ SUCCESS — cleaning up (deleting reminder ${created.id})...`);
      await fetch(`https://api.affinity.co/reminders/${created.id}`, { method: 'DELETE', headers });
    }
  }
  return res.status;
}

async function main() {
  console.log('Inspecting Affinity v1 POST /reminders API...');

  // First, check what GET /reminders returns to understand the data model
  console.log('\n══ GET /reminders (inspect existing) ══');
  const listRes = await fetch('https://api.affinity.co/reminders', { headers });
  const listData = await listRes.json();
  console.log(`  Status: ${listRes.status}`);
  if (Array.isArray(listData) && listData.length > 0) {
    console.log(`  Found ${listData.length} reminder(s). First one:`);
    console.log(`  ${JSON.stringify(listData[0], null, 2)}`);
    console.log(`  Keys: ${Object.keys(listData[0]).join(', ')}`);
  } else {
    console.log(`  ${JSON.stringify(listData)}`);
  }

  // Try various body formats
  const tomorrow = '2026-03-20';
  const tomorrowISO = '2026-03-20T00:00:00Z';

  // Variation 1: Our current format (due_date YYYY-MM-DD, person_ids array)
  await tryCreate('Current format (due_date YYYY-MM-DD + person_ids)', {
    content: 'API test 1',
    due_date: tomorrow,
    person_ids: [PERSON_ID],
  });

  // Variation 2: ISO datetime
  await tryCreate('ISO datetime (due_date with T00:00:00Z)', {
    content: 'API test 2',
    due_date: tomorrowISO,
    person_ids: [PERSON_ID],
  });

  // Variation 3: remind_at instead of due_date
  await tryCreate('remind_at instead of due_date', {
    content: 'API test 3',
    remind_at: tomorrowISO,
    person_ids: [PERSON_ID],
  });

  // Variation 4: reset_at instead of due_date
  await tryCreate('reset_at instead of due_date', {
    content: 'API test 4',
    reset_at: tomorrowISO,
    person_ids: [PERSON_ID],
  });

  // Variation 5: owner_id instead of person_ids
  await tryCreate('owner_id singular instead of person_ids', {
    content: 'API test 5',
    due_date: tomorrowISO,
    owner_id: PERSON_ID,
  });

  // Variation 6: person object instead of IDs
  await tryCreate('person object { id } instead of person_ids', {
    content: 'API test 6',
    due_date: tomorrowISO,
    person: { id: PERSON_ID },
  });

  // Variation 7: type field required?
  await tryCreate('With type: 0', {
    content: 'API test 7',
    due_date: tomorrowISO,
    person_ids: [PERSON_ID],
    type: 0,
  });

  // Variation 8: No association at all
  await tryCreate('No association (just content + due_date)', {
    content: 'API test 8',
    due_date: tomorrowISO,
  });

  // Variation 9: organization_ids
  await tryCreate('With organization_ids', {
    content: 'API test 9',
    due_date: tomorrowISO,
    organization_ids: [309981111],
  });

  // Variation 10: Epoch timestamp
  await tryCreate('Epoch timestamp for due_date', {
    content: 'API test 10',
    due_date: Math.floor(new Date('2026-03-20').getTime() / 1000),
    person_ids: [PERSON_ID],
  });
}

main().catch(console.error);
