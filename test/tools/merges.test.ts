import { describe, it, expect, vi } from 'vitest';
import { MergesApi } from '../../src/affinity/merges.js';
import { registerMergeTools } from '../../src/tools/merges.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityMergeTask } from '../../src/affinity/types.js';

const COMPLETED_TASK: AffinityMergeTask = {
  id: 'task-1', status: 'completed', merges: [], created_at: '2024-01-15T10:00:00Z',
};
const FAILED_TASK: AffinityMergeTask = {
  id: 'task-2', status: 'failed', merges: [], created_at: '2024-01-15T10:00:00Z',
};
const PENDING_TASK: AffinityMergeTask = {
  id: 'task-3', status: 'pending', merges: [], created_at: '2024-01-15T10:00:00Z',
};

const BASE_API = () => ({
  mergePersons: vi.fn(),
  mergeCompanies: vi.fn(),
  getMergeTaskStatus: vi.fn(),
});

describe('merge_persons tool', () => {
  it('returns success message when merge completes immediately', async () => {
    const mockApi = {
      ...BASE_API(),
      mergePersons: vi.fn().mockResolvedValue(COMPLETED_TASK),
    } as unknown as MergesApi;
    const { server, callTool } = makeMockServer();
    registerMergeTools(server, mockApi);
    const result = await callTool('merge_persons', { base_person_id: 100, to_merge_person_id: 200 });
    const text = result.content[0].text;
    expect(text).toContain('200');
    expect(text).toContain('100');
    expect(text).toContain('completed');
    expect(text).toContain('task-1');
  });

  it('returns failure message when task fails', async () => {
    const mockApi = {
      ...BASE_API(),
      mergePersons: vi.fn().mockResolvedValue(FAILED_TASK),
    } as unknown as MergesApi;
    const { server, callTool } = makeMockServer();
    registerMergeTools(server, mockApi);
    const result = await callTool('merge_persons', { base_person_id: 100, to_merge_person_id: 200 });
    expect(result.content[0].text).toContain('failed');
  });

  it('polls getMergeTaskStatus when initial status is pending', async () => {
    const mockApi = {
      ...BASE_API(),
      mergePersons: vi.fn().mockResolvedValue(PENDING_TASK),
      getMergeTaskStatus: vi.fn().mockResolvedValue(COMPLETED_TASK),
    } as unknown as MergesApi;
    vi.useFakeTimers();
    const { server, callTool } = makeMockServer();
    registerMergeTools(server, mockApi);
    const resultPromise = callTool('merge_persons', { base_person_id: 1, to_merge_person_id: 2 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(mockApi.getMergeTaskStatus).toHaveBeenCalled();
    expect(result.content[0].text).toContain('completed');
    vi.useRealTimers();
  });
});

describe('merge_companies tool', () => {
  it('returns success message when merge completes immediately', async () => {
    const mockApi = {
      ...BASE_API(),
      mergeCompanies: vi.fn().mockResolvedValue(COMPLETED_TASK),
    } as unknown as MergesApi;
    const { server, callTool } = makeMockServer();
    registerMergeTools(server, mockApi);
    const result = await callTool('merge_companies', { base_company_id: 300, to_merge_company_id: 400 });
    const text = result.content[0].text;
    expect(text).toContain('completed');
    expect(text).toContain('task-1');
  });
});
