#!/usr/bin/env npx tsx
/**
 * Webhook Pipeline Diagnostic Script
 *
 * Tests each stage of the webhook event pipeline:
 *   1. Is the webhook endpoint reachable?
 *   2. Does Affinity have a webhook configured and active?
 *   3. Can we POST a test event (with the correct secret)?
 *   4. Does the Worker store events in KV?
 *   5. Can the get_recent_events tool read them back?
 *
 * Usage:
 *   npx tsx scripts/webhook-diag.ts
 *
 * Required env vars (set in .dev.vars or export manually):
 *   AFFINITY_API_KEY         — Affinity API key
 *   AFFINITY_WEBHOOK_SECRET  — shared secret for webhook auth (if configured)
 *
 * Optional:
 *   WEBHOOK_URL              — override webhook URL (default: https://affinity.trulock.com/webhook)
 */

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? 'https://affinity.trulock.com/webhook';
const API_KEY = process.env.AFFINITY_API_KEY;
const WEBHOOK_SECRET = process.env.AFFINITY_WEBHOOK_SECRET;

function log(label: string, status: 'PASS' | 'FAIL' | 'WARN' | 'INFO', detail: string) {
  const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️', INFO: 'ℹ️' }[status];
  console.log(`${icon} [${label}] ${detail}`);
}

async function step1_reachable() {
  console.log('\n── Step 1: Is the webhook endpoint reachable? ──');
  try {
    // GET should return 405 (Method Not Allowed) if the route exists
    const res = await fetch(WEBHOOK_URL, { method: 'GET' });
    if (res.status === 405) {
      log('Reachable', 'PASS', `GET ${WEBHOOK_URL} → 405 (route exists, correct rejection)`);
    } else if (res.status === 404) {
      log('Reachable', 'FAIL', `GET ${WEBHOOK_URL} → 404 (route not found — check deployment)`);
    } else {
      log('Reachable', 'WARN', `GET ${WEBHOOK_URL} → ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    log('Reachable', 'FAIL', `Could not connect: ${err}`);
  }
}

async function step2_affinity_webhooks() {
  console.log('\n── Step 2: Affinity webhook subscriptions ──');
  if (!API_KEY) {
    log('Affinity', 'WARN', 'AFFINITY_API_KEY not set — skipping Affinity webhook check');
    return;
  }

  try {
    const res = await fetch('https://api.affinity.co/webhook', {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok) {
      log('Affinity', 'FAIL', `GET /webhook → ${res.status}: ${await res.text()}`);
      return;
    }
    const webhooks = await res.json() as Array<{
      id: number; webhook_url: string; disabled: boolean; subscriptions: string[];
    }>;

    if (webhooks.length === 0) {
      log('Affinity', 'FAIL', 'No webhooks registered in Affinity');
      return;
    }

    for (const wh of webhooks) {
      const state = wh.disabled ? 'DISABLED' : 'active';
      const events = wh.subscriptions?.length ? wh.subscriptions.join(', ') : 'all';
      const urlMatch = wh.webhook_url === WEBHOOK_URL;
      log('Affinity', urlMatch ? 'PASS' : 'WARN',
        `[${wh.id}] ${state} → ${wh.webhook_url} (events: ${events})${urlMatch ? '' : ' ← URL does NOT match expected!'}`);
    }

    const matching = webhooks.find(w => w.webhook_url === WEBHOOK_URL && !w.disabled);
    if (!matching) {
      log('Affinity', 'FAIL', `No active webhook pointing to ${WEBHOOK_URL}`);
    }
  } catch (err) {
    log('Affinity', 'FAIL', `Error querying Affinity webhooks: ${err}`);
  }
}

async function step3_post_test_event() {
  console.log('\n── Step 3: POST a test event to the webhook ──');

  // First try without secret
  const testPayload = {
    type: 'diag.test',
    body: { id: 0, message: 'diagnostic test event' },
    sent_at: Math.floor(Date.now() / 1000),
  };

  // Test without secret header
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
    });
    if (res.status === 401) {
      log('No-secret', 'INFO', `POST without secret → 401 (Worker requires secret — this is correct)`);
    } else if (res.status === 200) {
      log('No-secret', 'WARN', `POST without secret → 200 (Worker accepted without secret — AFFINITY_WEBHOOK_SECRET may not be configured)`);
    } else {
      log('No-secret', 'WARN', `POST without secret → ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    log('No-secret', 'FAIL', `Connection error: ${err}`);
    return;
  }

  // Test with secret
  if (!WEBHOOK_SECRET) {
    log('With-secret', 'WARN', 'AFFINITY_WEBHOOK_SECRET not set — cannot test authenticated POST');
    log('With-secret', 'INFO', 'Set AFFINITY_WEBHOOK_SECRET env var to test the full pipeline');
    return;
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Affinity-Webhook-Secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify(testPayload),
    });
    const body = await res.text();
    if (res.status === 200) {
      log('With-secret', 'PASS', `POST with secret → 200 OK (event accepted)`);
    } else if (res.status === 401) {
      log('With-secret', 'FAIL', `POST with secret → 401 (secret mismatch — the AFFINITY_WEBHOOK_SECRET you provided doesn't match what's configured on the Worker)`);
    } else {
      log('With-secret', 'FAIL', `POST with secret → ${res.status}: ${body}`);
    }
  } catch (err) {
    log('With-secret', 'FAIL', `Connection error: ${err}`);
  }
}

async function step4_check_kv_via_wrangler() {
  console.log('\n── Step 4: Check KV for stored events ──');
  console.log('  Run these commands manually to inspect KV:');
  console.log('');
  console.log('  # List webhook keys:');
  console.log('  npx wrangler kv key list --binding AFFINITY_CACHE --prefix "webhook:"');
  console.log('');
  console.log('  # Read the recency index:');
  console.log('  npx wrangler kv key get --binding AFFINITY_CACHE "webhook:recent"');
  console.log('');
  console.log('  # Read a specific event (replace EVENT_ID):');
  console.log('  npx wrangler kv key get --binding AFFINITY_CACHE "webhook:event:EVENT_ID"');
}

async function step5_summary() {
  console.log('\n── Summary ──');
  console.log('If the webhook endpoint returns 401 for ALL requests (including Affinity):');
  console.log('  → AFFINITY_WEBHOOK_SECRET is either not set or mismatched');
  console.log('  → Fix: wrangler secret put AFFINITY_WEBHOOK_SECRET');
  console.log('  → Then verify Affinity webhook config sends the same secret');
  console.log('');
  console.log('If the endpoint returns 200 but no events show up in get_recent_events:');
  console.log('  → KV binding issue — check AFFINITY_CACHE namespace in wrangler.toml');
  console.log('  → Or events are stored but the recency index key is different');
  console.log('');
  console.log('If Affinity has no active webhook:');
  console.log('  → Create one: use the create_webhook MCP tool');
  console.log('  → Or via API: POST https://api.affinity.co/webhook/subscribe?webhook_url=...');
}

async function main() {
  console.log('🔧 Webhook Pipeline Diagnostic');
  console.log(`   Target: ${WEBHOOK_URL}`);
  console.log(`   API Key: ${API_KEY ? '✓ set' : '✗ not set'}`);
  console.log(`   Webhook Secret: ${WEBHOOK_SECRET ? '✓ set' : '✗ not set'}`);

  await step1_reachable();
  await step2_affinity_webhooks();
  await step3_post_test_event();
  await step4_check_kv_via_wrangler();
  await step5_summary();
}

main().catch(console.error);
