#!/usr/bin/env npx tsx
/**
 * Test create_reminder through the actual MCP tool endpoint.
 * Simulates what Claude sends to the Worker.
 *
 * Usage:
 *   AFFINITY_API_KEY=<key> npx tsx scripts/test-mcp-reminder.ts
 */

const API_KEY = process.env.AFFINITY_API_KEY;
if (!API_KEY) { console.error('Set AFFINITY_API_KEY'); process.exit(1); }

const MCP_URL = 'https://affinity.trulock.com/mcp';

async function callMcpTool(toolName: string, args: Record<string, unknown>) {
  // MCP Streamable HTTP: POST with JSON-RPC
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  };

  console.log(`\n── ${toolName}(${JSON.stringify(args)}) ──`);

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`  HTTP ${res.status}`);

  // MCP may return SSE or JSON
  if (text.startsWith('{')) {
    const parsed = JSON.parse(text);
    console.log(`  Response: ${JSON.stringify(parsed, null, 2).slice(0, 500)}`);
  } else {
    // Parse SSE events
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.result?.content) {
            console.log(`  Tool result: ${data.result.content[0]?.text}`);
          } else if (data.error) {
            console.log(`  Error: ${JSON.stringify(data.error)}`);
          } else {
            console.log(`  Data: ${JSON.stringify(data).slice(0, 300)}`);
          }
        } catch {
          console.log(`  SSE: ${line.slice(0, 200)}`);
        }
      }
    }
  }
}

async function main() {
  console.log('=== MCP Tool create_reminder Tests ===');

  // Test 1: person_ids array (legacy format, external person)
  await callMcpTool('create_reminder', {
    content: 'MCP legacy test',
    due_date: '2026-03-25',
    person_ids: [253576561],
  });

  // Test 2: person_id singular (new format, external person)
  await callMcpTool('create_reminder', {
    content: 'MCP singular test',
    due_date: '2026-03-25',
    person_id: 253576561,
  });

  // Test 3: person_ids with internal person (should give clear validation error)
  await callMcpTool('create_reminder', {
    content: 'MCP self test',
    due_date: '2026-03-25',
    person_ids: [253573426],
  });

  // Test 4: organization_id
  await callMcpTool('create_reminder', {
    content: 'MCP org test',
    due_date: '2026-03-25',
    organization_id: 309981111,
  });

  // Test 5: No association
  await callMcpTool('create_reminder', {
    content: 'MCP no assoc',
    due_date: '2026-03-25',
  });

  // Test 6: get_reminders to verify they were created
  await callMcpTool('get_reminders', {});

  // Clean up via delete_reminder for any that were created
  console.log('\n(Manual cleanup may be needed via delete_reminder)');
}

main().catch(console.error);
