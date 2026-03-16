/**
 * Webhook Diagnostic — deploy temporarily to test the pipeline from inside Cloudflare.
 *
 * Usage:
 *   1. Deploy: npx wrangler deploy scripts/webhook-diag-worker.ts --name affinity-diag --compatibility-date 2025-01-01
 *   2. Hit: curl https://affinity-diag.<your-subdomain>.workers.dev/diag
 *   3. Tear down: npx wrangler delete --name affinity-diag
 *
 * Or add a /diag route to the main worker temporarily (see below).
 *
 * This script:
 *   - Lists Affinity webhook subscriptions
 *   - Sends a test POST to the webhook endpoint with the configured secret
 *   - Reads KV to check if events are stored
 *   - Reports findings
 */

// This is designed to be added as a temporary route in src/index.ts:
//   if (pathname === "/diag") return handleDiag(env);

export async function handleDiag(env: {
  AFFINITY_API_KEY: string;
  AFFINITY_WEBHOOK_SECRET?: string;
  AFFINITY_CACHE: KVNamespace;
}): Promise<Response> {
  const results: string[] = [];
  const log = (s: string) => results.push(s);

  log('=== Webhook Pipeline Diagnostic ===\n');

  // Step 1: Check Affinity webhook subscriptions
  log('── Step 1: Affinity webhook subscriptions ──');
  try {
    const res = await fetch('https://api.affinity.co/webhook', {
      headers: { Authorization: `Bearer ${env.AFFINITY_API_KEY}` },
    });
    if (!res.ok) {
      log(`FAIL: GET /webhook → ${res.status}: ${await res.text()}`);
    } else {
      const webhooks = await res.json() as Array<{
        id: number; webhook_url: string; disabled: boolean;
        subscriptions: string[]; webhook_secret?: string;
      }>;
      if (webhooks.length === 0) {
        log('FAIL: No webhooks registered in Affinity');
      }
      for (const wh of webhooks) {
        const state = wh.disabled ? 'DISABLED' : 'active';
        const events = wh.subscriptions?.length ? wh.subscriptions.join(', ') : 'all';
        log(`  [${wh.id}] ${state} → ${wh.webhook_url}`);
        log(`    Events: ${events}`);
        if (wh.webhook_secret) {
          log(`    Secret from Affinity: ${wh.webhook_secret.slice(0, 8)}...`);
        } else {
          log(`    Secret: (not returned in GET — only shown on create)`);
        }
      }
    }
  } catch (err) {
    log(`FAIL: Error querying Affinity webhooks: ${err}`);
  }

  // Step 2: Check Worker secret config
  log('\n── Step 2: Worker secret configuration ──');
  if (env.AFFINITY_WEBHOOK_SECRET) {
    log(`PASS: AFFINITY_WEBHOOK_SECRET is set (${env.AFFINITY_WEBHOOK_SECRET.length} chars, starts with "${env.AFFINITY_WEBHOOK_SECRET.slice(0, 8)}...")`);
  } else {
    log('FAIL: AFFINITY_WEBHOOK_SECRET is NOT set — all webhook POSTs will be rejected with 401');
  }

  // Step 3: Self-test — POST to our own webhook endpoint
  log('\n── Step 3: Self-test POST to webhook ──');
  const testPayload = {
    type: 'diag.self_test',
    body: { id: 99999, message: 'diagnostic self-test' },
    sent_at: Math.floor(Date.now() / 1000),
  };
  try {
    const res = await fetch('https://affinity.trulock.com/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.AFFINITY_WEBHOOK_SECRET ? { 'X-Affinity-Webhook-Secret': env.AFFINITY_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(testPayload),
    });
    const body = await res.text();
    if (res.status === 200) {
      log(`PASS: Self-test POST → 200 OK`);
    } else {
      log(`FAIL: Self-test POST → ${res.status}: ${body}`);
    }
  } catch (err) {
    log(`FAIL: Self-test POST error: ${err}`);
  }

  // Step 4: Check KV for events
  log('\n── Step 4: KV webhook event storage ──');
  try {
    const { keys } = await env.AFFINITY_CACHE.list({ prefix: 'webhook:' });
    log(`Found ${keys.length} webhook-related KV key(s)`);
    for (const k of keys.slice(0, 10)) {
      log(`  ${k.name}`);
    }
    if (keys.length > 10) log(`  ... and ${keys.length - 10} more`);

    // Check the recency index
    const recentRaw = await env.AFFINITY_CACHE.get('webhook:recent');
    if (recentRaw) {
      const recent = JSON.parse(recentRaw) as string[];
      log(`\nRecency index has ${recent.length} event(s):`);
      for (const id of recent.slice(0, 5)) {
        log(`  ${id}`);
      }
    } else {
      log('\nRecency index: empty (no events stored)');
    }

    // Check if the self-test event was stored
    const selfTestId = `diag.self_test:${testPayload.sent_at}:99999`;
    const selfTestEvent = await env.AFFINITY_CACHE.get(`webhook:event:${selfTestId}`);
    if (selfTestEvent) {
      log(`\nSelf-test event found in KV: ✅`);
    } else {
      log(`\nSelf-test event NOT found in KV ❌`);
      log(`  Expected key: webhook:event:${selfTestId}`);
      log(`  This means either the POST was rejected or KV write failed`);
    }
  } catch (err) {
    log(`FAIL: KV access error: ${err}`);
  }

  // Step 5: Diagnosis
  log('\n── Diagnosis ──');
  log('If Step 1 shows no active webhook → create one via create_webhook tool');
  log('If Step 2 shows secret not set → run: npx wrangler secret put AFFINITY_WEBHOOK_SECRET');
  log('If Step 3 self-test fails with 401 → secret mismatch between Worker and test');
  log('If Step 3 passes but Step 4 shows no events → KV write failure');
  log('If self-test stored but Affinity events missing → Affinity secret ≠ Worker secret');
  log('  → Delete webhook in Affinity, recreate, capture the secret from the response,');
  log('    then update the Worker secret to match.');

  return new Response(results.join('\n'), {
    headers: { 'Content-Type': 'text/plain' },
  });
}
