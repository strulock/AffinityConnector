// Shared error handler for MCP tool handlers.
// Converts known Affinity API errors into user-readable text responses.
// Re-throws anything unknown so the MCP layer can handle it.

import {
  AffinityNotFoundError,
  AffinityPermissionError,
  AffinityServerError,
  AffinityConflictError,
} from '../affinity/client.js';

type ToolResult = { content: [{ type: 'text'; text: string }] };

export function toolError(e: unknown): ToolResult {
  if (e instanceof AffinityNotFoundError) {
    return { content: [{ type: 'text', text: `Not found: ${e.message}` }] };
  }
  if (e instanceof AffinityConflictError) {
    return { content: [{ type: 'text', text: `Conflict: ${e.message}` }] };
  }
  if (e instanceof AffinityPermissionError) {
    return { content: [{ type: 'text', text: `Permission denied: ${e.message}` }] };
  }
  if (e instanceof AffinityServerError) {
    return { content: [{ type: 'text', text: `Affinity server error (${e.status}): ${e.message}` }] };
  }
  throw e;
}
