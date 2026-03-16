#!/usr/bin/env npx tsx
/**
 * Comprehensive create_reminder endpoint test.
 * Tests every parameter variation against the live Affinity API.
 *
 * Usage:
 *   AFFINITY_API_KEY=<key> npx tsx scripts/test-create-reminder.ts
 */

const API_KEY = process.env.AFFINITY_API_KEY;
if (!API_KEY) { console.error('Set AFFINITY_API_KEY'); process.exit(1); }

const bearerHeaders: Record<string, string> = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

const basicHeaders: Record<string, string> = {
  Authorization: `Basic ${Buffer.from(':' + API_KEY).toString('base64')}`,
  'Content-Type': 'application/json',
};

// Known IDs
const INTERNAL_PERSON = 253573426;   // Scott Trulock (authenticated user)
const EXTERNAL_PERSON = 253576561;   // Jerry Walker
const ORG_ID = 309981111;            // Fox Innovation
const OPP_ID = 100991521;            // Known opportunity

let passCount = 0;
let failCount = 0;
const createdIds: number[] = [];

async function test(
  label: string,
  body: Record<string, unknown>,
  expectStatus: number,
  authHeaders = bearerHeaders,
) {
  const res = await fetch('https://api.affinity.co/reminders', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }

  const ok = res.status === expectStatus;
  const icon = ok ? '✅' : '❌';
  const statusLabel = ok ? 'PASS' : 'FAIL';

  console.log(`${icon} [${statusLabel}] ${label}`);
  console.log(`   Expected: ${expectStatus}, Got: ${res.status}`);

  if (!ok) {
    console.log(`   Body sent: ${JSON.stringify(body)}`);
    console.log(`   Response: ${JSON.stringify(parsed)}`);
    failCount++;
  } else {
    passCount++;
    // Track created reminders for cleanup
    if (res.status === 200 || res.status === 201) {
      const created = parsed as { id?: number };
      if (created?.id) createdIds.push(created.id);
    }
  }
}

async function cleanup() {
  if (createdIds.length === 0) return;
  console.log(`\nCleaning up ${createdIds.length} test reminder(s)...`);
  for (const id of createdIds) {
    await fetch(`https://api.affinity.co/reminders/${id}`, {
      method: 'DELETE',
      headers: bearerHeaders,
    });
  }
  console.log('Done.');
}

async function getOwnerId(): Promise<number> {
  const res = await fetch('https://api.affinity.co/v2/auth/whoami', { headers: bearerHeaders });
  const data = await res.json() as { user: { id: number } };
  return data.user.id;
}

async function main() {
  console.log('=== Comprehensive create_reminder API Test ===\n');

  const ownerId = await getOwnerId();
  console.log(`Authenticated user (owner_id): ${ownerId}\n`);

  // ── Required fields ──
  console.log('── Required fields ──');

  await test('All required fields + external person', {
    content: 'Test', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200);

  await test('Missing owner_id', {
    content: 'Test', due_date: '2026-03-25', type: 0, person_id: EXTERNAL_PERSON,
  }, 422);

  await test('Missing type', {
    content: 'Test', due_date: '2026-03-25', owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 422);

  await test('Missing due_date', {
    content: 'Test', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 422);

  await test('Missing content (should be optional per docs)', {
    due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200);

  // ── Association types ──
  console.log('\n── Association types ──');

  await test('External person_id (should succeed)', {
    content: 'Person test', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200);

  await test('Internal person_id / self (should fail)', {
    content: 'Self test', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: INTERNAL_PERSON,
  }, 422);

  await test('organization_id (should succeed)', {
    content: 'Org test', due_date: '2026-03-25', type: 0, owner_id: ownerId, organization_id: ORG_ID,
  }, 200);

  await test('opportunity_id (should succeed)', {
    content: 'Opp test', due_date: '2026-03-25', type: 0, owner_id: ownerId, opportunity_id: OPP_ID,
  }, 200);

  await test('No association at all (should succeed — no entity tag)', {
    content: 'No assoc', due_date: '2026-03-25', type: 0, owner_id: ownerId,
  }, 200);

  await test('Multiple associations (should fail)', {
    content: 'Multi', due_date: '2026-03-25', type: 0, owner_id: ownerId,
    person_id: EXTERNAL_PERSON, organization_id: ORG_ID,
  }, 422);

  // ── Legacy array format (what old callers send) ──
  console.log('\n── Legacy array format ──');

  await test('person_ids array (API rejects — needs singular)', {
    content: 'Array test', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_ids: [EXTERNAL_PERSON],
  }, 422);

  await test('organization_ids array (API rejects — needs singular)', {
    content: 'Array test', due_date: '2026-03-25', type: 0, owner_id: ownerId, organization_ids: [ORG_ID],
  }, 422);

  // ── Date formats ──
  console.log('\n── Date formats ──');

  await test('YYYY-MM-DD (no time)', {
    content: 'Date test', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200);

  await test('ISO 8601 with time', {
    content: 'DateTime test', due_date: '2026-03-25T00:00:00Z', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200);

  await test('ISO 8601 with offset', {
    content: 'Offset test', due_date: '2026-03-25T12:00:00-07:00', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200);

  // ── Auth methods ──
  console.log('\n── Auth methods ──');

  await test('Bearer auth (our method)', {
    content: 'Bearer test', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200, bearerHeaders);

  await test('Basic auth (curl -u style)', {
    content: 'Basic test', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200, basicHeaders);

  // ── Type values ──
  console.log('\n── Type values ──');

  await test('type: 0 (one-time)', {
    content: 'Type 0', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200);

  await test('type: 1 (recurring — needs reset_type + reminder_days)', {
    content: 'Type 1', due_date: '2026-03-25', type: 1, owner_id: ownerId,
    person_id: EXTERNAL_PERSON, reset_type: 0, reminder_days: 30,
  }, 200);

  await test('type: 1 without reset_type/reminder_days (should fail)', {
    content: 'Type 1 no reset', due_date: '2026-03-25', type: 1, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 422);

  // ── Edge cases ──
  console.log('\n── Edge cases ──');

  await test('Empty content string', {
    content: '', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200);

  await test('Very long content (1000 chars)', {
    content: 'x'.repeat(1000), due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200);

  await test('Invalid person_id', {
    content: 'Bad ID', due_date: '2026-03-25', type: 0, owner_id: ownerId, person_id: 999999999,
  }, 422);

  await test('Invalid owner_id', {
    content: 'Bad owner', due_date: '2026-03-25', type: 0, owner_id: 999999999, person_id: EXTERNAL_PERSON,
  }, 422);

  await test('Past due_date', {
    content: 'Past date', due_date: '2020-01-01', type: 0, owner_id: ownerId, person_id: EXTERNAL_PERSON,
  }, 200); // API likely accepts past dates

  // ── Summary ──
  console.log(`\n════════════════════════`);
  console.log(`PASS: ${passCount}  FAIL: ${failCount}  TOTAL: ${passCount + failCount}`);
  console.log(`════════════════════════`);

  await cleanup();
}

main().catch(console.error);
