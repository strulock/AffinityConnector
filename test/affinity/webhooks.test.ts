import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { WebhooksApi } from '../../src/affinity/webhooks.js';
import type { AffinityWebhookSubscription } from '../../src/affinity/types.js';

const MOCK_WEBHOOK: AffinityWebhookSubscription = {
  id: 1,
  webhook_url: 'https://affinity.trulock.com/webhook',
  subscriptions: ['person.created', 'note.created'],
  state: 'active',
  created_at: '2024-01-01T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebhooksApi.listWebhooks', () => {
  it('returns webhooks from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([MOCK_WEBHOOK]), { status: 200 })
    ));
    const api = new WebhooksApi(new AffinityClient('key'));
    expect(await api.listWebhooks()).toEqual([MOCK_WEBHOOK]);
  });

  it('returns empty array when API returns a non-array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(null), { status: 200 })
    ));
    const api = new WebhooksApi(new AffinityClient('key'));
    expect(await api.listWebhooks()).toEqual([]);
  });
});

describe('WebhooksApi.createWebhook', () => {
  it('POSTs to /webhook-subscriptions and returns the created webhook', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_WEBHOOK), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    const result = await api.createWebhook({
      webhook_url: 'https://affinity.trulock.com/webhook',
      subscriptions: ['person.created'],
    });
    expect(result).toEqual(MOCK_WEBHOOK);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/webhook-subscriptions');
    expect(init.method).toBe('POST');
  });

  it('sends the correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_WEBHOOK), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    await api.createWebhook({ webhook_url: 'https://example.com/hook', subscriptions: ['note.created'] });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.webhook_url).toBe('https://example.com/hook');
    expect(body.subscriptions).toEqual(['note.created']);
  });
});

describe('WebhooksApi.updateWebhook', () => {
  it('PUTs to /webhook-subscriptions/{id} and returns the updated webhook', async () => {
    const updated = { ...MOCK_WEBHOOK, state: 'inactive' as const };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(updated), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    const result = await api.updateWebhook(1, { state: 'inactive' });
    expect(result.state).toBe('inactive');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/webhook-subscriptions/1');
    expect(init.method).toBe('PUT');
  });
});

describe('WebhooksApi.deleteWebhook', () => {
  it('sends DELETE to /webhook-subscriptions/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    await api.deleteWebhook(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/webhook-subscriptions/1');
    expect(init.method).toBe('DELETE');
  });

  it('handles 204 No Content without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const api = new WebhooksApi(new AffinityClient('key'));
    await expect(api.deleteWebhook(1)).resolves.toBeUndefined();
  });
});
