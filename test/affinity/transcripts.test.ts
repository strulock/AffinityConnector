import { describe, it, expect, vi, afterEach } from 'vitest';
import { AffinityClient } from '../../src/affinity/client.js';
import { TranscriptsApi } from '../../src/affinity/transcripts.js';
import type { AffinityTranscript, AffinityTranscriptFragment } from '../../src/affinity/types.js';

const MOCK_TRANSCRIPT: AffinityTranscript = {
  id: 'tx-1', title: 'Intro call', call_id: 'call-1', meeting_id: null,
  created_at: '2024-01-12T10:00:00Z', person_ids: [1], organization_ids: [10],
};

const MOCK_FRAGMENT: AffinityTranscriptFragment = {
  id: 'frag-1', transcript_id: 'tx-1', speaker_label: 'Alice',
  content: 'Hello, nice to meet you.', start_ms: 0, end_ms: 3000,
};

afterEach(() => vi.unstubAllGlobals());

function mockV2<T>(data: T[], next_page_token: string | null = null) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ data, next_page_token }), { status: 200 }))
  ));
}

describe('TranscriptsApi.getTranscripts', () => {
  it('returns transcripts from v2 API', async () => {
    mockV2([MOCK_TRANSCRIPT]);
    const api = new TranscriptsApi(new AffinityClient('key'));
    const result = await api.getTranscripts();
    expect(result.transcripts).toEqual([MOCK_TRANSCRIPT]);
    expect(result.nextPageToken).toBeUndefined();
  });

  it('returns nextPageToken when present', async () => {
    mockV2([MOCK_TRANSCRIPT], 'tok-tx');
    const api = new TranscriptsApi(new AffinityClient('key'));
    const result = await api.getTranscripts();
    expect(result.nextPageToken).toBe('tok-tx');
  });

  it('returns empty array when data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    ));
    const api = new TranscriptsApi(new AffinityClient('key'));
    expect((await api.getTranscripts()).transcripts).toEqual([]);
  });

  it('uses v2 URL and /transcripts path', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new TranscriptsApi(new AffinityClient('key'));
    await api.getTranscripts({ person_id: 5 });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/v2/');
    expect(url).toContain('/transcripts');
  });
});

describe('TranscriptsApi.getTranscript', () => {
  it('returns a single transcript by ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(MOCK_TRANSCRIPT), { status: 200 }))
    ));
    const api = new TranscriptsApi(new AffinityClient('key'));
    const result = await api.getTranscript('tx-1');
    expect(result.id).toBe('tx-1');
    expect(result.title).toBe('Intro call');
  });
});

describe('TranscriptsApi.getTranscriptFragments', () => {
  it('returns fragments for a transcript', async () => {
    mockV2([MOCK_FRAGMENT]);
    const api = new TranscriptsApi(new AffinityClient('key'));
    const result = await api.getTranscriptFragments('tx-1');
    expect(result.fragments).toEqual([MOCK_FRAGMENT]);
    expect(result.nextPageToken).toBeUndefined();
  });

  it('returns nextPageToken when present', async () => {
    mockV2([MOCK_FRAGMENT], 'tok-frag');
    const api = new TranscriptsApi(new AffinityClient('key'));
    const result = await api.getTranscriptFragments('tx-1');
    expect(result.nextPageToken).toBe('tok-frag');
  });

  it('uses v2 URL with /fragments path', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const api = new TranscriptsApi(new AffinityClient('key'));
    await api.getTranscriptFragments('tx-1');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/v2/');
    expect(url).toContain('/transcripts/tx-1/fragments');
  });
});
