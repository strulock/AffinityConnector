import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { WebhooksApi } from '../../src/affinity/webhooks.js';
import type { AffinityWebhookSubscription } from '../../src/affinity/types.js';

const MOCK_WEBHOOK: AffinityWebhookSubscription = {
  id: 1,
  webhook_url: 'https://affinity.trulock.com/webhook',
  subscriptions: ['person.created', 'note.created'],
  disabled: false,
  created_by: 5678,
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
  it('POSTs to /webhook/subscribe with webhook_url as query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_WEBHOOK), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    const result = await api.createWebhook('https://affinity.trulock.com/webhook');
    expect(result).toEqual(MOCK_WEBHOOK);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/webhook/subscribe');
    expect(url).toContain('webhook_url=');
    expect(init.method).toBe('POST');
  });

  it('encodes the webhook_url query parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_WEBHOOK), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    await api.createWebhook('https://example.com/hook?foo=bar');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(encodeURIComponent('https://example.com/hook?foo=bar'));
  });
});

describe('WebhooksApi.updateWebhook', () => {
  it('PUTs to /webhook/{id} with params as query string', async () => {
    const updated = { ...MOCK_WEBHOOK, disabled: true };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(updated), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    const result = await api.updateWebhook(1, { disabled: true });
    expect(result.disabled).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/webhook/1');
    expect(url).toContain('disabled=true');
    expect(init.method).toBe('PUT');
  });

  it('includes multiple params in query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_WEBHOOK), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    await api.updateWebhook(1, { webhook_url: 'https://example.com/hook', disabled: false });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('webhook_url=');
    expect(url).toContain('disabled=false');
  });

  it('omits undefined params from query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_WEBHOOK), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    await api.updateWebhook(1, { webhook_url: 'https://example.com/hook' });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('webhook_url=');
    expect(url).not.toContain('disabled');
  });
});

describe('WebhooksApi.deleteWebhook', () => {
  it('sends DELETE to /webhook/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new WebhooksApi(new AffinityClient('key'));
    await api.deleteWebhook(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/webhook/1');
    expect(init.method).toBe('DELETE');
  });

  it('handles 204 No Content without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const api = new WebhooksApi(new AffinityClient('key'));
    await expect(api.deleteWebhook(1)).resolves.toBeUndefined();
  });
});
