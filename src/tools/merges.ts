// MCP tools for Affinity v2 record deduplication (merges).
// Both tools initiate an async merge, poll for completion, and return the final status.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MergesApi } from '../affinity/merges.js';
import { toolError } from './_error.js';
import type { AffinityMergeTask } from '../affinity/types.js';

/**
 * Poll a merge task until it reaches a terminal state (completed/failed)
 * or the attempt limit is reached. Returns null if polling throws (network/auth error).
 */
async function pollUntilDone(
  api: MergesApi,
  taskId: string,
  type: 'person' | 'company',
  maxAttempts = 5,
): Promise<AffinityMergeTask | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const task = await api.getMergeTaskStatus(taskId, type);
      if (task.status === 'completed' || task.status === 'failed') return task;
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch {
      return null;
    }
  }
  try {
    return await api.getMergeTaskStatus(taskId, type);
  } catch {
    return null;
  }
}

function formatMergeResult(task: AffinityMergeTask, baseId: number, mergeId: number, entityLabel: string): string {
  if (task.status === 'completed') {
    return `Merged ${entityLabel} ${mergeId} into ${entityLabel} ${baseId}. Task [${task.id}] completed successfully.`;
  }
  if (task.status === 'failed') {
    return `Merge task [${task.id}] failed. Check Affinity for details.`;
  }
  return `Merge initiated. Task [${task.id}] is ${task.status}. Check back using the Affinity UI or retry.`;
}

export function registerMergeTools(server: McpServer, api: MergesApi): void {
  server.tool(
    'merge_persons',
    'DESTRUCTIVE — permanently merge two Affinity person records. The base person record is kept; the other is merged in and deleted. Requires "Manage duplicates" permission. This cannot be undone — confirm with the user before calling.',
    {
      base_person_id: z.coerce.number().int().min(1).describe('ID of the person record to keep (the merge target)'),
      to_merge_person_id: z.coerce.number().int().min(1).describe('ID of the person record to merge in (will be deleted)'),
    },
    async ({ base_person_id, to_merge_person_id }) => {
      try {
        const initial = await api.mergePersons(base_person_id, to_merge_person_id);
        const task = (initial.status === 'completed' || initial.status === 'failed')
          ? initial
          : await pollUntilDone(api, initial.id, 'person');
        if (task === null) {
          return { content: [{ type: 'text', text: `Merge initiated but status unknown. Task ID: ${initial.id} — check Affinity for the result.` }] };
        }
        return { content: [{ type: 'text', text: formatMergeResult(task, base_person_id, to_merge_person_id, 'person') }] };
      } catch (e) { return toolError(e); }
    }
  );

  server.tool(
    'merge_companies',
    'DESTRUCTIVE — permanently merge two Affinity company records. The base company record is kept; the other is merged in and deleted. Requires "Manage duplicates" permission. This cannot be undone — confirm with the user before calling.',
    {
      base_company_id: z.coerce.number().int().min(1).describe('ID of the company record to keep (the merge target)'),
      to_merge_company_id: z.coerce.number().int().min(1).describe('ID of the company record to merge in (will be deleted)'),
    },
    async ({ base_company_id, to_merge_company_id }) => {
      try {
        const initial = await api.mergeCompanies(base_company_id, to_merge_company_id);
        const task = (initial.status === 'completed' || initial.status === 'failed')
          ? initial
          : await pollUntilDone(api, initial.id, 'company');
        if (task === null) {
          return { content: [{ type: 'text', text: `Merge initiated but status unknown. Task ID: ${initial.id} — check Affinity for the result.` }] };
        }
        return { content: [{ type: 'text', text: formatMergeResult(task, base_company_id, to_merge_company_id, 'company') }] };
      } catch (e) { return toolError(e); }
    }
  );
}
