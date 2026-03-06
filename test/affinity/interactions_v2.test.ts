import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { InteractionsV2Api } from '../../src/affinity/interactions_v2.js';
import type { AffinityEmailV2, AffinityCallV2, AffinityMeetingV2, AffinityChatMessageV2 } from '../../src/affinity/types.js';

const MOCK_EMAIL: AffinityEmailV2 = {
  id: 'email-1', subject: 'Hello', sent_at: '2024-01-10T09:00:00Z',
  created_at: '2024-01-10T09:00:00Z', person_ids: [1], organization_ids: [],
};

const MOCK_CALL: AffinityCallV2 = {
  id: 'call-1', start_time: '2024-01-11T14:00:00Z',
  created_at: '2024-01-11T14:00:00Z', person_ids: [1], organization_ids: [],
};

const MOCK_MEETING: AffinityMeetingV2 = {
  id: 'meeting-1', title: 'Intro call', start_time: '2024-01-12T10:00:00Z',
  end_time: '2024-01-12T11:00:00Z', created_at: '2024-01-12T10:00:00Z',
  person_ids: [1], organization_ids: [],
};

const MOCK_CHAT: AffinityChatMessageV2 = {
  id: 'chat-1', content: 'Hey!', sent_at: '2024-01-13T08:00:00Z',
  created_at: '2024-01-13T08:00:00Z', person_ids: [1], organization_ids: [],
};

afterEach(() => vi.unstubAllGlobals());

function mockV2Response<T>(data: T[], next_page_token: string | null = null) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ data, next_page_token }), { status: 200 }))
  ));
}

describe('InteractionsV2Api.getEmails', () => {
  it('returns emails from the v2 API', async () => {
    mockV2Response([MOCK_EMAIL]);
    const api = new InteractionsV2Api(new AffinityClient('key'));
    const result = await api.getEmails();
    expect(result.emails).toEqual([MOCK_EMAIL]);
    expect(result.nextPageToken).toBeUndefined();
  });

  it('returns nextPageToken when present', async () => {
    mockV2Response([MOCK_EMAIL], 'tok-next');
    const api = new InteractionsV2Api(new AffinityClient('key'));
    const result = await api.getEmails();
    expect(result.nextPageToken).toBe('tok-next');
  });

  it('returns empty array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    ));
    const api = new InteractionsV2Api(new AffinityClient('key'));
    const result = await api.getEmails();
    expect(result.emails).toEqual([]);
  });

  it('uses the v2 base URL', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new InteractionsV2Api(new AffinityClient('key'));
    await api.getEmails({ person_id: 5 });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/v2/');
    expect(url).toContain('/emails');
  });
});

describe('InteractionsV2Api.getCalls', () => {
  it('returns calls from the v2 API', async () => {
    mockV2Response([MOCK_CALL]);
    const api = new InteractionsV2Api(new AffinityClient('key'));
    const result = await api.getCalls();
    expect(result.calls).toEqual([MOCK_CALL]);
  });

  it('returns empty array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    ));
    const api = new InteractionsV2Api(new AffinityClient('key'));
    expect((await api.getCalls()).calls).toEqual([]);
  });
});

describe('InteractionsV2Api.getMeetings', () => {
  it('returns meetings from the v2 API', async () => {
    mockV2Response([MOCK_MEETING]);
    const api = new InteractionsV2Api(new AffinityClient('key'));
    const result = await api.getMeetings();
    expect(result.meetings).toEqual([MOCK_MEETING]);
  });

  it('returns empty array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    ));
    const api = new InteractionsV2Api(new AffinityClient('key'));
    expect((await api.getMeetings()).meetings).toEqual([]);
  });
});

describe('InteractionsV2Api.getChatMessages', () => {
  it('returns chat messages from the v2 API', async () => {
    mockV2Response([MOCK_CHAT]);
    const api = new InteractionsV2Api(new AffinityClient('key'));
    const result = await api.getChatMessages();
    expect(result.messages).toEqual([MOCK_CHAT]);
  });

  it('returns empty array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    ));
    const api = new InteractionsV2Api(new AffinityClient('key'));
    expect((await api.getChatMessages()).messages).toEqual([]);
  });
});
