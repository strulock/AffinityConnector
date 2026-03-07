import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebhooksApi } from '../../src/affinity/webhooks.js';
import { KVCache } from '../../src/cache.js';
import { PeopleApi } from '../../src/affinity/people.js';
import { OrganizationsApi } from '../../src/affinity/organizations.js';
import { registerWebhookTools } from '../../src/tools/webhooks.js';
import { makeMockServer } from '../helpers/mock-server.js';
import { makeKVMock } from '../helpers/kv-mock.js';
import type { AffinityWebhookSubscription, AffinityPerson, AffinityOrganization } from '../../src/affinity/types.js';

const BASE_DATES = { first_email_date: null, last_email_date: null, first_event_date: null, last_event_date: null, last_interaction_date: null, next_event_date: null };

const MOCK_PERSON: AffinityPerson = {
  id: 42, type: 0, first_name: 'Alice', last_name: 'Smith',
  emails: ['alice@acme.com'], primary_email: 'alice@acme.com',
  phones: [], organization_ids: [], opportunity_ids: [], list_entries: [],
  interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z',
};

const MOCK_ORG: AffinityOrganization = {
  id: 99, name: 'Acme Corp', domain: 'acme.com', domains: ['acme.com'],
  person_ids: [], opportunity_ids: [], list_entries: [],
  interaction_dates: BASE_DATES, created_at: '2023-01-01T00:00:00Z',
};

const MOCK_WEBHOOK: AffinityWebhookSubscription = {
  id: 1,
  webhook_url: 'https://affinity.trulock.com/webhook',
  subscriptions: ['person.created', 'note.created'],
  state: 'active',
  created_at: '2024-01-01T00:00:00Z',
};

afterEach(() => vi.unstubAllGlobals());

const BASE_MOCK_API = () => ({
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
});

function setup(
  api = BASE_MOCK_API(),
  cache = new KVCache(undefined),
  peopleApi = { getById: vi.fn() } as unknown as PeopleApi,
  orgsApi = { getById: vi.fn() } as unknown as OrganizationsApi,
) {
  const { server, callTool } = makeMockServer();
  registerWebhookTools(server, api as unknown as WebhooksApi, cache, peopleApi, orgsApi);
  return { callTool, api, peopleApi, orgsApi };
}

describe('list_webhooks tool', () => {
  it('returns formatted webhooks', async () => {
    const api = { ...BASE_MOCK_API(), listWebhooks: vi.fn().mockResolvedValue([MOCK_WEBHOOK]) };
    const { callTool } = setup(api);
    const result = await callTool('list_webhooks', {});
    const text = result.content[0].text;
    expect(text).toContain('[webhook:1]');
    expect(text).toContain('active');
    expect(text).toContain('person.created');
    expect(text).toContain('1 webhook');
  });

  it('returns a message when no webhooks exist', async () => {
    const api = { ...BASE_MOCK_API(), listWebhooks: vi.fn().mockResolvedValue([]) };
    const { callTool } = setup(api);
    const result = await callTool('list_webhooks', {});
    expect(result.content[0].text).toContain('No webhook subscriptions found');
  });
});

describe('create_webhook tool', () => {
  it('creates a webhook and returns confirmation', async () => {
    const api = { ...BASE_MOCK_API(), createWebhook: vi.fn().mockResolvedValue(MOCK_WEBHOOK) };
    const { callTool } = setup(api);
    const result = await callTool('create_webhook', { subscriptions: ['person.created'] });
    const text = result.content[0].text;
    expect(text).toContain('Created webhook');
    expect(text).toContain('[id:1]');
    expect(text).toContain('active');
  });

  it('defaults webhook_url to affinity.trulock.com/webhook', async () => {
    const api = { ...BASE_MOCK_API(), createWebhook: vi.fn().mockResolvedValue(MOCK_WEBHOOK) };
    const { callTool } = setup(api);
    await callTool('create_webhook', { subscriptions: ['note.created'] });
    expect(api.createWebhook).toHaveBeenCalledWith(expect.objectContaining({
      webhook_url: 'https://affinity.trulock.com/webhook',
    }));
  });

  it('uses the provided webhook_url when supplied', async () => {
    const api = { ...BASE_MOCK_API(), createWebhook: vi.fn().mockResolvedValue(MOCK_WEBHOOK) };
    const { callTool } = setup(api);
    await callTool('create_webhook', {
      subscriptions: ['note.created'],
      webhook_url: 'https://example.com/hook',
    });
    expect(api.createWebhook).toHaveBeenCalledWith(expect.objectContaining({
      webhook_url: 'https://example.com/hook',
    }));
  });
});

describe('update_webhook tool', () => {
  it('returns success with updated state', async () => {
    const updated = { ...MOCK_WEBHOOK, state: 'inactive' as const };
    const api = { ...BASE_MOCK_API(), updateWebhook: vi.fn().mockResolvedValue(updated) };
    const { callTool } = setup(api);
    const result = await callTool('update_webhook', { webhook_id: 1, state: 'inactive' });
    const text = result.content[0].text;
    expect(text).toContain('Updated webhook');
    expect(text).toContain('[id:1]');
    expect(text).toContain('inactive');
  });

  it('returns a validation error when no fields are provided', async () => {
    const { callTool, api } = setup();
    const result = await callTool('update_webhook', { webhook_id: 1 });
    expect(result.content[0].text).toContain('Provide at least one field');
    expect(api.updateWebhook).not.toHaveBeenCalled();
  });
});

describe('delete_webhook tool', () => {
  it('returns a success message after deletion', async () => {
    const api = { ...BASE_MOCK_API(), deleteWebhook: vi.fn().mockResolvedValue(undefined) };
    const { callTool } = setup(api);
    const result = await callTool('delete_webhook', { webhook_id: 1 });
    expect(api.deleteWebhook).toHaveBeenCalledWith(1);
    expect(result.content[0].text).toContain('1');
    expect(result.content[0].text).toContain('deleted successfully');
  });
});

describe('get_recent_events tool', () => {
  it('returns a message when no events have been received', async () => {
    const { callTool } = setup();
    const result = await callTool('get_recent_events', {});
    expect(result.content[0].text).toContain('No webhook events received yet');
  });

  it('returns formatted events from KV', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-1', type: 'person.created', body: { id: 42 }, created_at: '2024-01-15T10:00:00Z' };
    await cache.set('webhook:event:evt-1', event, 600);
    await cache.set('webhook:recent', ['evt-1'], 600);
    const { callTool } = setup(undefined, cache);
    const result = await callTool('get_recent_events', {});
    const text = result.content[0].text;
    expect(text).toContain('person.created');
    expect(text).toContain('evt-1');
    expect(text).toContain('1 event');
  });

  it('filters by event_type', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event1 = { id: 'evt-1', type: 'person.created', body: {}, created_at: '2024-01-15T10:00:00Z' };
    const event2 = { id: 'evt-2', type: 'note.created', body: {}, created_at: '2024-01-16T10:00:00Z' };
    await cache.set('webhook:event:evt-1', event1, 600);
    await cache.set('webhook:event:evt-2', event2, 600);
    await cache.set('webhook:recent', ['evt-2', 'evt-1'], 600);
    const { callTool } = setup(undefined, cache);
    const result = await callTool('get_recent_events', { event_type: 'note.created' });
    expect(result.content[0].text).toContain('note.created');
    expect(result.content[0].text).not.toContain('person.created');
  });

  it('filters by entity_id using body.id', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-1', type: 'person.created', body: { id: 42 }, created_at: '2024-01-15T10:00:00Z' };
    await cache.set('webhook:event:evt-1', event, 600);
    await cache.set('webhook:recent', ['evt-1'], 600);
    const { callTool } = setup(undefined, cache);
    const notMatch = await callTool('get_recent_events', { entity_id: 99 });
    expect(notMatch.content[0].text).toContain('No events match');
    const match = await callTool('get_recent_events', { entity_id: 42 });
    expect(match.content[0].text).toContain('person.created');
  });

  it('filters by entity_id using body.entity_id', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-1', type: 'field_value.created', body: { entity_id: 55 }, created_at: '2024-01-15T10:00:00Z' };
    await cache.set('webhook:event:evt-1', event, 600);
    await cache.set('webhook:recent', ['evt-1'], 600);
    const { callTool } = setup(undefined, cache);
    const result = await callTool('get_recent_events', { entity_id: 55 });
    expect(result.content[0].text).toContain('field_value.created');
  });

  it('respects the limit parameter', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = `evt-${i}`;
      ids.push(id);
      await cache.set(`webhook:event:${id}`, { id, type: 'person.updated', body: {}, created_at: '2024-01-15T10:00:00Z' }, 600);
    }
    await cache.set('webhook:recent', ids, 600);
    const { callTool } = setup(undefined, cache);
    const result = await callTool('get_recent_events', { limit: 3 });
    expect(result.content[0].text).toContain('3 event(s)');
  });

  it('skips events whose KV entries have expired', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    await cache.set('webhook:recent', ['expired-evt'], 600);
    const { callTool } = setup(undefined, cache);
    const result = await callTool('get_recent_events', {});
    expect(result.content[0].text).toContain('No events match');
  });

  it('enriches person events with name and email when enrich=true', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-1', type: 'person.created', body: { id: 42 }, created_at: '2024-01-15T10:00:00Z' };
    await cache.set('webhook:event:evt-1', event, 600);
    await cache.set('webhook:recent', ['evt-1'], 600);
    const peopleApi = { getById: vi.fn().mockResolvedValue(MOCK_PERSON) } as unknown as PeopleApi;
    const { callTool } = setup(undefined, cache, peopleApi);
    const result = await callTool('get_recent_events', { enrich: true });
    const text = result.content[0].text;
    expect(text).toContain('Alice Smith');
    expect(text).toContain('alice@acme.com');
    expect(peopleApi.getById).toHaveBeenCalledWith(42);
  });

  it('enriches organization events with org name when enrich=true', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-2', type: 'organization.updated', body: { id: 99 }, created_at: '2024-01-16T10:00:00Z' };
    await cache.set('webhook:event:evt-2', event, 600);
    await cache.set('webhook:recent', ['evt-2'], 600);
    const mockPeople = { getById: vi.fn() } as unknown as PeopleApi;
    const orgsApi = { getById: vi.fn().mockResolvedValue(MOCK_ORG) } as unknown as OrganizationsApi;
    const { callTool } = setup(undefined, cache, mockPeople, orgsApi);
    const result = await callTool('get_recent_events', { enrich: true });
    expect(result.content[0].text).toContain('Acme Corp');
    expect(orgsApi.getById).toHaveBeenCalledWith(99);
  });

  it('falls back to base format when entity lookup fails during enrichment', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-3', type: 'person.updated', body: { id: 999 }, created_at: '2024-01-17T10:00:00Z' };
    await cache.set('webhook:event:evt-3', event, 600);
    await cache.set('webhook:recent', ['evt-3'], 600);
    const peopleApi = { getById: vi.fn().mockRejectedValue(new Error('Not found')) } as unknown as PeopleApi;
    const { callTool } = setup(undefined, cache, peopleApi);
    const result = await callTool('get_recent_events', { enrich: true });
    // Should still return the event, just without enrichment detail
    expect(result.content[0].text).toContain('person.updated');
    expect(result.content[0].text).toContain('evt-3');
    expect(result.content[0].text).not.toContain('→');
  });

  it('caps enrichment at 5 events even when more are returned', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    for (let i = 0; i < 7; i++) {
      const id = `evt-${i}`;
      await cache.set(`webhook:event:${id}`, { id, type: 'person.created', body: { id: i }, created_at: '2024-01-15T10:00:00Z' }, 600);
    }
    await cache.set('webhook:recent', ['evt-0','evt-1','evt-2','evt-3','evt-4','evt-5','evt-6'], 600);
    const peopleApi = { getById: vi.fn().mockResolvedValue(MOCK_PERSON) } as unknown as PeopleApi;
    const { callTool } = setup(undefined, cache, peopleApi);
    await callTool('get_recent_events', { enrich: true, limit: 7 });
    expect(peopleApi.getById).toHaveBeenCalledTimes(5);
  });

  it('uses body.entity_id as entity ID when body.id is not a number', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-eid', type: 'person.created', body: { entity_id: 42 }, created_at: '2024-01-18T10:00:00Z' };
    await cache.set('webhook:event:evt-eid', event, 600);
    await cache.set('webhook:recent', ['evt-eid'], 600);
    const peopleApi = { getById: vi.fn().mockResolvedValue(MOCK_PERSON) } as unknown as PeopleApi;
    const { callTool } = setup(undefined, cache, peopleApi);
    const result = await callTool('get_recent_events', { enrich: true });
    expect(peopleApi.getById).toHaveBeenCalledWith(42);
    expect(result.content[0].text).toContain('Alice Smith');
  });

  it('returns base text when event body has no numeric id or entity_id', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-noid', type: 'person.created', body: {}, created_at: '2024-01-19T10:00:00Z' };
    await cache.set('webhook:event:evt-noid', event, 600);
    await cache.set('webhook:recent', ['evt-noid'], 600);
    const peopleApi = { getById: vi.fn() } as unknown as PeopleApi;
    const { callTool } = setup(undefined, cache, peopleApi);
    const result = await callTool('get_recent_events', { enrich: true });
    expect(result.content[0].text).toContain('person.created');
    expect(peopleApi.getById).not.toHaveBeenCalled();
  });

  it('returns base format for non-person/non-org event types when enrich=true', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-note', type: 'note.created', body: { id: 5 }, created_at: '2024-01-20T10:00:00Z' };
    await cache.set('webhook:event:evt-note', event, 600);
    await cache.set('webhook:recent', ['evt-note'], 600);
    const peopleApi = { getById: vi.fn() } as unknown as PeopleApi;
    const { callTool } = setup(undefined, cache, peopleApi);
    const result = await callTool('get_recent_events', { enrich: true });
    expect(result.content[0].text).toContain('note.created');
    expect(peopleApi.getById).not.toHaveBeenCalled();
  });

  it('shows "(no name)" and "no email" fallbacks in person enrichment', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-noname', type: 'person.created', body: { id: 42 }, created_at: '2024-01-21T10:00:00Z' };
    await cache.set('webhook:event:evt-noname', event, 600);
    await cache.set('webhook:recent', ['evt-noname'], 600);
    const noNamePerson = { ...MOCK_PERSON, first_name: '', last_name: '', primary_email: null as unknown as string };
    const peopleApi = { getById: vi.fn().mockResolvedValue(noNamePerson) } as unknown as PeopleApi;
    const { callTool } = setup(undefined, cache, peopleApi);
    const result = await callTool('get_recent_events', { enrich: true });
    expect(result.content[0].text).toContain('(no name)');
    expect(result.content[0].text).toContain('no email');
  });

  it('does not call people/org APIs when enrich is false (default)', async () => {
    const kv = makeKVMock();
    const cache = new KVCache(kv);
    const event = { id: 'evt-1', type: 'person.created', body: { id: 42 }, created_at: '2024-01-15T10:00:00Z' };
    await cache.set('webhook:event:evt-1', event, 600);
    await cache.set('webhook:recent', ['evt-1'], 600);
    const peopleApi = { getById: vi.fn() } as unknown as PeopleApi;
    const { callTool } = setup(undefined, cache, peopleApi);
    await callTool('get_recent_events', {});
    expect(peopleApi.getById).not.toHaveBeenCalled();
  });
});
