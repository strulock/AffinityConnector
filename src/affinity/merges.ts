// Affinity v2 merge (deduplication) endpoints.
// Merges are asynchronous; poll getMergeTaskStatus for completion.

import { AffinityClient } from './client.js';
import type { AffinityMergeTask } from './types.js';

export class MergesApi {
  constructor(private client: AffinityClient) {}

  /**
   * Initiate a person merge (v2 POST /person-merges).
   * Merges toMergePersonId into basePersonId; the base record is kept.
   * Returns a task object — status may be 'pending' on first response.
   * Requires "Manage duplicates" permission and organization admin role.
   */
  async mergePersons(basePersonId: number, toMergePersonId: number): Promise<AffinityMergeTask> {
    return this.client.post<AffinityMergeTask>(
      '/person-merges',
      { base_entity_id: basePersonId, to_merge_entity_id: toMergePersonId },
      'v2',
    );
  }

  /**
   * Initiate a company merge (v2 POST /company-merges).
   * Merges toMergeCompanyId into baseCompanyId; the base record is kept.
   * Returns a task object — status may be 'pending' on first response.
   * Requires "Manage duplicates" permission and organization admin role.
   */
  async mergeCompanies(baseCompanyId: number, toMergeCompanyId: number): Promise<AffinityMergeTask> {
    return this.client.post<AffinityMergeTask>(
      '/company-merges',
      { base_entity_id: baseCompanyId, to_merge_entity_id: toMergeCompanyId },
      'v2',
    );
  }

  /**
   * Poll the status of an in-progress merge task (v2).
   * type 'person' → GET /v2/person-merge-tasks/{taskId}
   * type 'company' → GET /v2/company-merge-tasks/{taskId}
   */
  async getMergeTaskStatus(taskId: string, type: 'person' | 'company'): Promise<AffinityMergeTask> {
    const path = type === 'person'
      ? `/person-merge-tasks/${taskId}`
      : `/company-merge-tasks/${taskId}`;
    return this.client.get<AffinityMergeTask>(path, undefined, 'v2');
  }
}
