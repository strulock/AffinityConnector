import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { RemindersApi } from '../../src/affinity/reminders.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityReminder } from '../../src/affinity/types.js';

const MOCK_REMINDER: AffinityReminder = {
  id: 1,
  type: 0,
  content: 'Follow up with Alice',
  due_date: '2024-03-01T00:00:00.000Z',
  status: 1,
  person: { id: 10, first_name: 'Alice', last_name: 'Smith' },
  organization: null,
  opportunity: null,
  owner: { id: 99, first_name: 'Me', last_name: 'User' },
  creator: { id: 99, first_name: 'Me', last_name: 'User' },
  completed_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RemindersApi.getReminders', () => {
  it('returns reminders from wrapped API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reminders: [MOCK_REMINDER] }), { status: 200 })
    ));
    const api = new RemindersApi(new AffinityClient('key'));
    expect(await api.getReminders()).toEqual([MOCK_REMINDER]);
  });

  it('returns reminders from plain array response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_REMINDER]), { status: 200 })
    ));
    const api = new RemindersApi(new AffinityClient('key'));
    expect(await api.getReminders()).toEqual([MOCK_REMINDER]);
  });

  it('returns an empty array when the API returns a non-array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(null), { status: 200 })
    ));
    const api = new RemindersApi(new AffinityClient('key'));
    expect(await api.getReminders()).toEqual([]);
  });

  it('serves results from cache on the second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reminders: [MOCK_REMINDER] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new RemindersApi(new AffinityClient('key', { cache: makeKVMock() }));
    await api.getReminders({ person_id: 10 });
    await api.getReminders({ person_id: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats params with different key insertion order as the same cache key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reminders: [MOCK_REMINDER] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new RemindersApi(new AffinityClient('key', { cache: makeKVMock() }));
    await api.getReminders({ person_id: 10, organization_id: 20 });
    await api.getReminders({ organization_id: 20, person_id: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses separate cache keys for different filter params', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ reminders: [MOCK_REMINDER] }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new RemindersApi(new AffinityClient('key', { cache: makeKVMock() }));
    await api.getReminders({ person_id: 10 });
    await api.getReminders({ organization_id: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('RemindersApi.createReminder', () => {
  it('POSTs to /reminders with type, owner_id, and singular person_id', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_REMINDER), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new RemindersApi(new AffinityClient('key'));
    const result = await api.createReminder({
      content: 'Follow up', due_date: '2024-03-01', owner_id: 99, person_id: 10,
    });
    expect(result).toEqual(MOCK_REMINDER);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/reminders');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe(0);
    expect(body.owner_id).toBe(99);
    expect(body.person_id).toBe(10);
    expect(body.due_date).toBe('2024-03-01T00:00:00Z');
  });

  it('sends organization_id when provided', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_REMINDER), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new RemindersApi(new AffinityClient('key'));
    await api.createReminder({
      content: 'Check', due_date: '2024-03-01', owner_id: 99, organization_id: 20,
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.organization_id).toBe(20);
    expect(body.person_id).toBeUndefined();
  });
});

describe('RemindersApi.updateReminder', () => {
  it('PUTs to /reminders/{id} and returns the updated reminder', async () => {
    const updated = { ...MOCK_REMINDER, content: 'Updated follow up' };
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(updated), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new RemindersApi(new AffinityClient('key'));
    const result = await api.updateReminder(1, { content: 'Updated follow up' });
    expect(result.content).toBe('Updated follow up');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/reminders/1');
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('converts YYYY-MM-DD to ISO datetime', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_REMINDER), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new RemindersApi(new AffinityClient('key'));
    await api.updateReminder(1, { due_date: '2024-04-01' });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.due_date).toBe('2024-04-01T00:00:00Z');
  });
});

describe('RemindersApi.deleteReminder', () => {
  it('sends DELETE to /reminders/{id}', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new RemindersApi(new AffinityClient('key'));
    await api.deleteReminder(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/reminders/1');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('handles 204 No Content without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const api = new RemindersApi(new AffinityClient('key'));
    await expect(api.deleteReminder(1)).resolves.toBeUndefined();
  });
});
