import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { MergesApi } from '../../src/affinity/merges.js';
import type { AffinityMergeTask } from '../../src/affinity/types.js';

const MOCK_TASK: AffinityMergeTask = {
  id: 'task-1', status: 'completed', merges: [], created_at: '2024-01-15T10:00:00Z',
};

afterEach(() => vi.unstubAllGlobals());

function mockPost(response: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(response), { status: 200 }))
  ));
}

describe('MergesApi.mergePersons', () => {
  it('POSTs to /v2/person-merges with correct body', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_TASK), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new MergesApi(new AffinityClient('key'));
    const result = await api.mergePersons(100, 200);
    expect(result).toEqual(MOCK_TASK);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v2/');
    expect(url).toContain('/person-merges');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.base_entity_id).toBe(100);
    expect(body.to_merge_entity_id).toBe(200);
  });
});

describe('MergesApi.mergeCompanies', () => {
  it('POSTs to /v2/company-merges with correct body', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_TASK), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new MergesApi(new AffinityClient('key'));
    const result = await api.mergeCompanies(300, 400);
    expect(result).toEqual(MOCK_TASK);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v2/');
    expect(url).toContain('/company-merges');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.base_entity_id).toBe(300);
    expect(body.to_merge_entity_id).toBe(400);
  });
});

describe('MergesApi.getMergeTaskStatus', () => {
  it('GETs /v2/person-merge-tasks/{taskId} for person type', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_TASK), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new MergesApi(new AffinityClient('key'));
    const result = await api.getMergeTaskStatus('task-1', 'person');
    expect(result).toEqual(MOCK_TASK);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/person-merge-tasks/task-1');
  });

  it('GETs /v2/company-merge-tasks/{taskId} for company type', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_TASK), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new MergesApi(new AffinityClient('key'));
    await api.getMergeTaskStatus('task-2', 'company');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/company-merge-tasks/task-2');
  });
});
