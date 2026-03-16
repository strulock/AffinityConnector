#!/usr/bin/env npx tsx
/**
 * Webhook Recreate Script
 *
 * Deletes the old Affinity webhook and creates a new one,
 * printing the webhook_secret that must be set on the Worker.
 *
 * Usage:
 *   AFFINITY_API_KEY=<key> npx tsx scripts/webhook-recreate.ts
 *
 * After running, set the secret:
 *   npx wrangler secret put AFFINITY_WEBHOOK_SECRET
 *   (paste the secret printed by this script)
 */

const API_KEY = process.env.AFFINITY_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? 'https://affinity.trulock.com/webhook';

if (!API_KEY) {
  console.error('Error: AFFINITY_API_KEY environment variable is required');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function main() {
  // Step 1: List existing webhooks
  console.log('Listing existing webhooks...');
  const listRes = await fetch('https://api.affinity.co/webhook', { headers });
  if (!listRes.ok) {
    console.error(`Failed to list webhooks: ${listRes.status} ${await listRes.text()}`);
    process.exit(1);
  }
  const webhooks = await listRes.json() as Array<{ id: number; webhook_url: string; disabled: boolean }>;
  console.log(`Found ${webhooks.length} webhook(s)`);

  // Step 2: Delete webhooks pointing to our URL
  for (const wh of webhooks) {
    if (wh.webhook_url === WEBHOOK_URL) {
      console.log(`Deleting webhook ${wh.id} (${wh.webhook_url})...`);
      const delRes = await fetch(`https://api.affinity.co/webhook/${wh.id}`, {
        method: 'DELETE',
        headers,
      });
      if (delRes.ok || delRes.status === 204) {
        console.log(`  Deleted webhook ${wh.id}`);
      } else {
        console.error(`  Failed to delete: ${delRes.status} ${await delRes.text()}`);
      }
    }
  }

  // Step 3: Create new webhook
  console.log(`\nCreating new webhook → ${WEBHOOK_URL}...`);
  const createRes = await fetch(
    `https://api.affinity.co/webhook/subscribe?webhook_url=${encodeURIComponent(WEBHOOK_URL)}`,
    { method: 'POST', headers },
  );
  if (!createRes.ok) {
    console.error(`Failed to create webhook: ${createRes.status} ${await createRes.text()}`);
    process.exit(1);
  }

  const created = await createRes.json() as {
    id: number;
    webhook_url: string;
    webhook_secret: string;
    subscriptions: string[];
    disabled: boolean;
  };

  console.log(`\n✅ Webhook created successfully!`);
  console.log(`   ID: ${created.id}`);
  console.log(`   URL: ${created.webhook_url}`);
  console.log(`   Disabled: ${created.disabled}`);
  console.log(`   Subscriptions: ${created.subscriptions?.length ? created.subscriptions.join(', ') : 'all'}`);
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log(`║  WEBHOOK SECRET: ${created.webhook_secret}`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Now run:');
  console.log('  npx wrangler secret put AFFINITY_WEBHOOK_SECRET');
  console.log(`  (paste: ${created.webhook_secret})`);
  console.log('');
  console.log('Then redeploy:');
  console.log('  npx wrangler deploy');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
