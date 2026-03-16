#!/usr/bin/env npx tsx
/**
 * Comprehensive MCP tool test suite — tests every endpoint through the live MCP server.
 * Safe: read-only tests for all tools, write tests clean up after themselves.
 *
 * Usage:
 *   AFFINITY_API_KEY=<key> npx tsx scripts/test-all-tools.ts
 *   AFFINITY_API_KEY=<key> npx tsx scripts/test-all-tools.ts --include-writes
 */

const API_KEY = process.env.AFFINITY_API_KEY;
if (!API_KEY) { console.error('Set AFFINITY_API_KEY'); process.exit(1); }

const INCLUDE_WRITES = process.argv.includes('--include-writes');
const MCP_URL = 'https://affinity.trulock.com/mcp';

// Known test IDs
const PERSON_INTERNAL = 253573426;  // Scott Trulock (authenticated user)
const PERSON_EXTERNAL = 253576561;  // Jerry Walker
const ORG_ID = 309981111;           // Fox Innovation
const OPP_ID = 100991521;           // Known opportunity
const LIST_ID = 339917;             // Prj Fox - Capital (opportunity list)
const LIST_ID_PERSON = 333573;      // A person list
const FIELD_ID = 5600902;           // Ranked Dropdown (Investor Status)

let passCount = 0;
let failCount = 0;
let skipCount = 0;
const cleanupActions: Array<() => Promise<void>> = [];

async function callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; ok: boolean }> {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  };

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  // Parse SSE response
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.result?.content?.[0]?.text) {
          return { text: data.result.content[0].text, ok: true };
        }
        if (data.error) {
          return { text: `MCP error: ${data.error.message}`, ok: false };
        }
      } catch { /* continue */ }
    }
  }
  // Try as plain JSON
  try {
    const data = JSON.parse(raw);
    if (data.result?.content?.[0]?.text) return { text: data.result.content[0].text, ok: true };
    if (data.error) return { text: `MCP error: ${data.error.message}`, ok: false };
  } catch { /* continue */ }
  return { text: `HTTP ${res.status}: ${raw.slice(0, 200)}`, ok: false };
}

async function test(
  label: string,
  toolName: string,
  args: Record<string, unknown>,
  expect: { contains?: string[]; notContains?: string[]; isError?: boolean },
) {
  const { text, ok } = await callTool(toolName, args);
  const errors: string[] = [];

  if (expect.isError && !text.toLowerCase().includes('error') && !text.toLowerCase().includes('provide') && !text.toLowerCase().includes('not found')) {
    errors.push(`Expected error, got: ${text.slice(0, 100)}`);
  }

  for (const s of expect.contains ?? []) {
    if (!text.includes(s)) errors.push(`Missing "${s}"`);
  }
  for (const s of expect.notContains ?? []) {
    if (text.includes(s)) errors.push(`Should not contain "${s}"`);
  }

  if (errors.length === 0) {
    console.log(`  ✅ ${label}`);
    passCount++;
  } else {
    console.log(`  ❌ ${label}`);
    console.log(`     Result: ${text.slice(0, 150)}`);
    for (const e of errors) console.log(`     ${e}`);
    failCount++;
  }
}

function skip(label: string) {
  console.log(`  ⏭️  ${label} (skipped — use --include-writes)`);
  skipCount++;
}

async function main() {
  console.log(`=== Comprehensive MCP Tool Test Suite ===`);
  console.log(`Target: ${MCP_URL}`);
  console.log(`Write tests: ${INCLUDE_WRITES ? 'ENABLED' : 'DISABLED (use --include-writes)'}\n`);

  // ════════════════════════════════════════
  // UTILITY
  // ════════════════════════════════════════
  console.log('── Utility ──');
  await test('get_whoami', 'get_whoami', {}, { contains: ['Scott', 'Trulock'] });
  await test('get_rate_limit', 'get_rate_limit', {}, { contains: ['remaining'] });

  // ════════════════════════════════════════
  // PEOPLE
  // ════════════════════════════════════════
  console.log('\n── People ──');
  await test('search_people by name', 'search_people', { query: 'Jerry Walker' }, { contains: ['Jerry', 'Walker'] });
  await test('search_people by email', 'search_people', { query: 'strulock@nrgcap.com' }, { contains: ['Trulock'] });
  await test('search_people with limit', 'search_people', { query: 'a', limit: 3 }, { contains: ['person'] });
  await test('search_people no results', 'search_people', { query: 'zzznonexistent99999' }, { contains: ['No people'] });
  await test('get_person valid ID', 'get_person', { person_id: PERSON_EXTERNAL }, { contains: ['Jerry', 'Walker'] });
  await test('get_person invalid ID', 'get_person', { person_id: 999999999 }, { contains: ['error', 'valid id'] });
  await test('get_person string coercion', 'get_person', { person_id: String(PERSON_EXTERNAL) }, { contains: ['Jerry'] });

  if (INCLUDE_WRITES) {
    const { text } = await callTool('create_person', { first_name: 'Test', last_name: 'McTestface', emails: ['test-mctestface@example.com'] });
    const idMatch = text.match(/\[id:(\d+)\]/);
    if (idMatch) {
      const newId = parseInt(idMatch[1]);
      console.log(`  ✅ create_person → id:${newId}`);
      passCount++;
      await test('update_person', 'update_person', { person_id: newId, last_name: 'Updated' }, { contains: ['Updated'] });
      await test('delete_person', 'delete_person', { person_id: newId }, { contains: ['deleted'] });
    } else {
      console.log(`  ❌ create_person: ${text.slice(0, 150)}`);
      failCount++;
    }
  } else {
    skip('create_person / update_person / delete_person');
  }

  // ════════════════════════════════════════
  // ORGANIZATIONS
  // ════════════════════════════════════════
  console.log('\n── Organizations ──');
  await test('search_organizations', 'search_organizations', { query: 'Fox' }, { contains: ['Fox'] });
  await test('search_organizations no results', 'search_organizations', { query: 'zzznonexistent99999' }, { contains: ['No organizations'] });
  await test('get_organization', 'get_organization', { org_id: ORG_ID }, { contains: ['Fox'] });
  await test('get_organization invalid', 'get_organization', { org_id: 999999999 }, { contains: ['error', 'valid id'] });

  if (INCLUDE_WRITES) {
    const { text } = await callTool('create_organization', { name: 'Test Corp E2E', domain: 'testcorpe2e.example.com' });
    const idMatch = text.match(/\[id:(\d+)\]/);
    if (idMatch) {
      const newId = parseInt(idMatch[1]);
      console.log(`  ✅ create_organization → id:${newId}`);
      passCount++;
      await test('update_organization', 'update_organization', { org_id: newId, name: 'Test Corp Updated' }, { contains: ['Updated'] });
      await test('delete_organization', 'delete_organization', { org_id: newId }, { contains: ['deleted'] });
    } else {
      console.log(`  ❌ create_organization: ${text.slice(0, 150)}`);
      failCount++;
    }
  } else {
    skip('create_organization / update_organization / delete_organization');
  }

  // ════════════════════════════════════════
  // OPPORTUNITIES
  // ════════════════════════════════════════
  console.log('\n── Opportunities ──');
  await test('search_opportunities (all)', 'search_opportunities', {}, { contains: ['opportunity'] });
  await test('search_opportunities by term', 'search_opportunities', { term: 'Fox' }, { contains: ['Fox'] });
  await test('search_opportunities by list', 'search_opportunities', { list_id: LIST_ID }, { contains: ['opportunity'] });
  await test('search_opportunities no results', 'search_opportunities', { term: 'zzznonexistent99999' }, { contains: ['No opportunities'] });
  await test('get_opportunity', 'get_opportunity', { opportunity_id: OPP_ID }, { contains: ['Name:'] });
  await test('get_opportunity invalid', 'get_opportunity', { opportunity_id: 999999999 }, { contains: ['error', 'valid id'] });

  // ════════════════════════════════════════
  // LISTS
  // ════════════════════════════════════════
  console.log('\n── Lists ──');
  await test('get_lists', 'get_lists', {}, { contains: ['list(s)'] });
  await test('get_list_entries', 'get_list_entries', { list_id: LIST_ID, limit: 3 }, { contains: ['entries'] });
  await test('get_list_entries invalid list', 'get_list_entries', { list_id: 999999999 }, { contains: ['error', 'valid id'] });
  await test('get_list_entries with limit 1', 'get_list_entries', { list_id: LIST_ID, limit: 1 }, { contains: ['1 entries'] });
  await test('get_field_values', 'get_field_values', { list_entry_id: 235084849 }, { contains: ['Field'] });
  await test('get_field_values invalid', 'get_field_values', { list_entry_id: 999999999 }, { notContains: ['undefined'] });
  await test('get_saved_views', 'get_saved_views', { list_id: LIST_ID }, { notContains: ['error'] });
  await test('get_pipeline_summary', 'get_pipeline_summary', { list_id: LIST_ID, field_id: FIELD_ID }, { contains: ['Pipeline summary', 'entries total'] });

  // ════════════════════════════════════════
  // FIELDS
  // ════════════════════════════════════════
  console.log('\n── Fields ──');
  await test('get_field_definitions scope=all', 'get_field_definitions', { scope: 'all' }, { contains: ['field definition'] });
  await test('get_field_definitions scope=person', 'get_field_definitions', { scope: 'person' }, { contains: ['field definition'] });
  await test('get_field_definitions scope=organization', 'get_field_definitions', { scope: 'organization' }, { contains: ['field definition'] });
  await test('get_field_definitions scope=list', 'get_field_definitions', { scope: 'list', list_id: LIST_ID }, { contains: ['field definition'] });
  await test('get_field_definitions scope=list missing list_id', 'get_field_definitions', { scope: 'list' }, { contains: ['list_id is required'] });
  await test('get_field_value_changes', 'get_field_value_changes', { field_id: FIELD_ID }, { contains: ['change'] });
  await test('get_field_value_changes invalid field', 'get_field_value_changes', { field_id: 999999999 }, { contains: ['error'] });

  // ════════════════════════════════════════
  // NOTES
  // ════════════════════════════════════════
  console.log('\n── Notes ──');
  await test('get_notes (all)', 'get_notes', {}, { notContains: ['error'] });
  await test('get_notes for person', 'get_notes', { person_id: PERSON_INTERNAL }, { contains: ['note'] });
  await test('get_notes for org', 'get_notes', { organization_id: ORG_ID }, { notContains: ['error'] });
  await test('get_notes with limit', 'get_notes', { limit: 2 }, { notContains: ['error'] });

  if (INCLUDE_WRITES) {
    const { text } = await callTool('create_note', { content: 'E2E test note', person_ids: [PERSON_EXTERNAL] });
    const idMatch = text.match(/ID:\s*(\d+)/);
    if (idMatch) {
      const noteId = parseInt(idMatch[1]);
      console.log(`  ✅ create_note → id:${noteId}`);
      passCount++;
      await test('get_note_replies', 'get_note_replies', { note_id: noteId }, { notContains: ['error'] });
      await test('update_note', 'update_note', { note_id: noteId, content: 'Updated E2E note' }, { notContains: ['error'] });
      await test('delete_note', 'delete_note', { note_id: noteId }, { contains: ['deleted'] });
    } else {
      console.log(`  ❌ create_note: ${text.slice(0, 150)}`);
      failCount++;
    }
  } else {
    skip('create_note / get_note_replies / update_note / delete_note');
  }

  // ════════════════════════════════════════
  // REMINDERS
  // ════════════════════════════════════════
  console.log('\n── Reminders ──');
  await test('get_reminders', 'get_reminders', {}, { contains: ['reminder'] });
  await test('get_reminders for org', 'get_reminders', { organization_id: ORG_ID }, { notContains: ['error'] });

  if (INCLUDE_WRITES) {
    // Singular person_id
    const { text: t1 } = await callTool('create_reminder', { content: 'E2E singular', due_date: '2026-04-01', person_id: PERSON_EXTERNAL });
    const m1 = t1.match(/\[id:(\d+)\]/);
    if (m1) {
      console.log(`  ✅ create_reminder (person_id singular) → id:${m1[1]}`);
      passCount++;
      cleanupActions.push(async () => { await callTool('delete_reminder', { reminder_id: parseInt(m1[1]) }); });
    } else { console.log(`  ❌ create_reminder (singular): ${t1.slice(0, 150)}`); failCount++; }

    // Legacy person_ids array
    const { text: t2 } = await callTool('create_reminder', { content: 'E2E legacy array', due_date: '2026-04-01', person_ids: [PERSON_EXTERNAL] });
    const m2 = t2.match(/\[id:(\d+)\]/);
    if (m2) {
      console.log(`  ✅ create_reminder (person_ids array) → id:${m2[1]}`);
      passCount++;
      cleanupActions.push(async () => { await callTool('delete_reminder', { reminder_id: parseInt(m2[1]) }); });
    } else { console.log(`  ❌ create_reminder (array): ${t2.slice(0, 150)}`); failCount++; }

    // Organization
    const { text: t3 } = await callTool('create_reminder', { content: 'E2E org', due_date: '2026-04-01', organization_id: ORG_ID });
    const m3 = t3.match(/\[id:(\d+)\]/);
    if (m3) {
      console.log(`  ✅ create_reminder (organization_id) → id:${m3[1]}`);
      passCount++;
      cleanupActions.push(async () => { await callTool('delete_reminder', { reminder_id: parseInt(m3[1]) }); });
    } else { console.log(`  ❌ create_reminder (org): ${t3.slice(0, 150)}`); failCount++; }

    // Internal person (should fail gracefully)
    await test('create_reminder internal person (should error)', 'create_reminder',
      { content: 'Self test', due_date: '2026-04-01', person_id: PERSON_INTERNAL },
      { contains: ['not an external'] });

    // No association
    await test('create_reminder no assoc (should error)', 'create_reminder',
      { content: 'No assoc', due_date: '2026-04-01' },
      { contains: ['exactly one'] });

    // Multiple associations
    await test('create_reminder multiple assoc (should error)', 'create_reminder',
      { content: 'Multi', due_date: '2026-04-01', person_id: PERSON_EXTERNAL, organization_id: ORG_ID },
      { contains: ['exactly one'] });
  } else {
    skip('create_reminder (6 variations) / delete_reminder');
  }

  // ════════════════════════════════════════
  // INTERACTIONS (v2)
  // ════════════════════════════════════════
  console.log('\n── Interactions v2 ──');
  await test('get_emails', 'get_emails', { limit: 3 }, { notContains: ['MCP error'] });
  await test('get_emails for person', 'get_emails', { person_id: PERSON_EXTERNAL, limit: 3 }, { notContains: ['MCP error'] });
  await test('get_calls', 'get_calls', { limit: 3 }, { notContains: ['MCP error'] });
  await test('get_meetings', 'get_meetings', { limit: 3 }, { notContains: ['MCP error'] });
  await test('get_chat_messages', 'get_chat_messages', { limit: 3 }, { notContains: ['MCP error'] });

  // ════════════════════════════════════════
  // INTELLIGENCE
  // ════════════════════════════════════════
  console.log('\n── Intelligence ──');
  await test('get_relationship_strength person', 'get_relationship_strength', { entity_id: PERSON_EXTERNAL, entity_type: 0 }, { contains: ['/100'] });
  await test('get_relationship_strength org (should explain)', 'get_relationship_strength', { entity_id: ORG_ID, entity_type: 1 }, { contains: ['only available for people'] });
  await test('find_intro_path', 'find_intro_path', { person_id: PERSON_EXTERNAL }, { notContains: ['MCP error'] });
  await test('find_intro_path invalid', 'find_intro_path', { person_id: 999999999 }, { contains: ['error'] });
  await test('summarize_relationship person', 'summarize_relationship', { person_id: PERSON_EXTERNAL }, { contains: ['Profile'] });
  await test('summarize_relationship org', 'summarize_relationship', { organization_id: ORG_ID }, { contains: ['Profile'] });
  await test('summarize_relationship neither', 'summarize_relationship', {}, { contains: ['Provide either'] });

  // ════════════════════════════════════════
  // ACTIVITY TIMELINE
  // ════════════════════════════════════════
  console.log('\n── Activity Timeline ──');
  await test('get_activity_timeline person', 'get_activity_timeline', { person_id: PERSON_INTERNAL, limit: 5 }, { notContains: ['MCP error'] });
  await test('get_activity_timeline org', 'get_activity_timeline', { organization_id: ORG_ID, limit: 5 }, { notContains: ['MCP error'] });
  await test('get_activity_timeline with since', 'get_activity_timeline', { person_id: PERSON_INTERNAL, limit: 5, since: '2026-01-01' }, { notContains: ['MCP error'] });
  await test('get_activity_timeline neither', 'get_activity_timeline', {}, { contains: ['Provide either'] });

  // ════════════════════════════════════════
  // SEARCH ALL
  // ════════════════════════════════════════
  console.log('\n── Search All ──');
  await test('search_all', 'search_all', { query: 'Fox' }, { contains: ['Fox'] });
  await test('search_all no results', 'search_all', { query: 'zzznonexistent99999' }, { contains: ['No results'] });

  // ════════════════════════════════════════
  // SEMANTIC SEARCH
  // ════════════════════════════════════════
  console.log('\n── Semantic Search ──');
  await test('semantic_search', 'semantic_search', { query: 'energy companies', limit: 3 }, { notContains: ['MCP error'] });

  // ════════════════════════════════════════
  // TRANSCRIPTS
  // ════════════════════════════════════════
  console.log('\n── Transcripts ──');
  await test('get_transcripts', 'get_transcripts', { limit: 3 }, { notContains: ['MCP error'] });

  // ════════════════════════════════════════
  // WEBHOOKS
  // ════════════════════════════════════════
  console.log('\n── Webhooks ──');
  await test('list_webhooks', 'list_webhooks', {}, { contains: ['webhook'] });
  await test('get_recent_events', 'get_recent_events', { limit: 5 }, { notContains: ['MCP error'] });
  await test('get_recent_events with enrich', 'get_recent_events', { limit: 3, enrich: true }, { notContains: ['MCP error'] });

  // ════════════════════════════════════════
  // CLEANUP
  // ════════════════════════════════════════
  if (cleanupActions.length > 0) {
    console.log(`\nCleaning up ${cleanupActions.length} test resource(s)...`);
    for (const action of cleanupActions) {
      try { await action(); } catch { /* best effort */ }
    }
  }

  // ════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  PASS: ${passCount}   FAIL: ${failCount}   SKIP: ${skipCount}   TOTAL: ${passCount + failCount + skipCount}`);
  console.log(`${'═'.repeat(50)}`);
  if (failCount > 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
