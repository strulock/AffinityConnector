import { describe, it, expect, vi } from 'vitest';
import { TranscriptsApi } from '../../src/affinity/transcripts.js';
import { registerTranscriptTools } from '../../src/tools/transcripts.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityTranscript, AffinityTranscriptFragment } from '../../src/affinity/types.js';

const MOCK_TRANSCRIPT: AffinityTranscript = {
  id: 'tx-1', title: 'Intro call', call_id: 'call-1', meeting_id: null,
  created_at: '2024-01-12T10:00:00Z', person_ids: [1], organization_ids: [10],
};

const MOCK_FRAGMENT: AffinityTranscriptFragment = {
  id: 'frag-1', transcript_id: 'tx-1', speaker_label: 'Alice',
  content: 'Hello, nice to meet you.', start_ms: 0, end_ms: 3000,
};

const BASE_API = () => ({
  getTranscripts: vi.fn(),
  getTranscript: vi.fn(),
  getTranscriptFragments: vi.fn(),
});

const MOCK_TRANSCRIPT_NO_TITLE: AffinityTranscript = {
  id: 'tx-2', title: null, call_id: null, meeting_id: 'mtg-1',
  created_at: '2024-02-01T10:00:00Z', person_ids: [], organization_ids: [],
};

describe('get_transcripts tool', () => {
  it('returns formatted transcripts list', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscripts: vi.fn().mockResolvedValue({ transcripts: [MOCK_TRANSCRIPT], nextPageToken: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcripts', { limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('[transcript:tx-1]');
    expect(text).toContain('Intro call');
    expect(text).toContain('1 transcript');
  });

  it('shows pagination token when available', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscripts: vi.fn().mockResolvedValue({ transcripts: [MOCK_TRANSCRIPT], nextPageToken: 'tok-tx' }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcripts', { limit: 25 });
    expect(result.content[0].text).toContain('tok-tx');
  });

  it('formats a transcript with null title and no associations', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscripts: vi.fn().mockResolvedValue({ transcripts: [MOCK_TRANSCRIPT_NO_TITLE], nextPageToken: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcripts', { limit: 25 });
    const text = result.content[0].text;
    expect(text).toContain('[transcript:tx-2]');
    // No title dash, no association bracket
    expect(text).not.toContain(' — "');
    expect(text).not.toContain('[people:');
  });

  it('returns message when no transcripts found', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscripts: vi.fn().mockResolvedValue({ transcripts: [], nextPageToken: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcripts', { limit: 25 });
    expect(result.content[0].text).toContain('No transcripts found');
  });
});

describe('get_transcript tool', () => {
  it('returns transcript header and fragment content', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
      getTranscriptFragments: vi.fn().mockResolvedValue({ fragments: [MOCK_FRAGMENT], nextPageToken: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript', { transcript_id: 'tx-1', limit: 100 });
    const text = result.content[0].text;
    expect(text).toContain('[transcript:tx-1]');
    expect(text).toContain('Alice');
    expect(text).toContain('Hello, nice to meet you.');
    expect(text).toContain('[0.0s]');
  });

  it('formats a fragment with no speaker label', async () => {
    const fragmentNoSpeaker: AffinityTranscriptFragment = {
      ...MOCK_FRAGMENT, id: 'frag-2', speaker_label: null, content: 'Background noise.',
    };
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
      getTranscriptFragments: vi.fn().mockResolvedValue({ fragments: [fragmentNoSpeaker], nextPageToken: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript', { transcript_id: 'tx-1', limit: 100 });
    const text = result.content[0].text;
    expect(text).toContain('Background noise.');
    expect(text).toContain('[0.0s]');
    // No "speaker: " prefix
    expect(text).not.toContain('null:');
  });

  it('shows pagination token when more fragments are available', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
      getTranscriptFragments: vi.fn().mockResolvedValue({ fragments: [MOCK_FRAGMENT], nextPageToken: 'frag-page-2' }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript', { transcript_id: 'tx-1', limit: 100 });
    expect(result.content[0].text).toContain('frag-page-2');
    expect(result.content[0].text).toContain('More content available');
  });

  it('returns "no content" message when fragments are empty', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
      getTranscriptFragments: vi.fn().mockResolvedValue({ fragments: [], nextPageToken: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript', { transcript_id: 'tx-1', limit: 100 });
    expect(result.content[0].text).toContain('No transcript content available');
  });
});
