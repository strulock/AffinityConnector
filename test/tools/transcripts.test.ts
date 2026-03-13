import { describe, it, expect, vi } from 'vitest';
import { TranscriptsApi } from '../../src/affinity/transcripts.js';
import { registerTranscriptTools } from '../../src/tools/transcripts.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityTranscript, AffinityTranscriptFragment } from '../../src/affinity/types.js';

const MOCK_TRANSCRIPT: AffinityTranscript = {
  id: 1, call_id: 'call-1', meeting_id: null,
  created_at: '2024-01-12T10:00:00Z', person_ids: [1], organization_ids: [10],
  note: { content: { html: '<p>Intro call</p>' }, creator: { firstName: 'Alice', lastName: 'Smith', emailAddress: 'alice@example.com' } },
};

const MOCK_FRAGMENT: AffinityTranscriptFragment = {
  id: 'frag-1', transcript_id: 1, speaker: 'Alice',
  content: 'Hello, nice to meet you.', startTimestamp: 0, endTimestamp: 3,
};

const MOCK_TRANSCRIPT_NO_NOTE: AffinityTranscript = {
  id: 2, call_id: null, meeting_id: 'mtg-1',
  created_at: '2024-02-01T10:00:00Z', person_ids: [], organization_ids: [],
  note: null,
};

const BASE_API = () => ({
  getTranscripts: vi.fn(),
  getTranscript: vi.fn(),
  getTranscriptFragments: vi.fn(),
});

describe('get_transcripts tool', () => {
  it('returns formatted transcripts list with AI summary', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscripts: vi.fn().mockResolvedValue({ transcripts: [MOCK_TRANSCRIPT], nextCursor: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcripts', { limit: 20 });
    const text = result.content[0].text;
    expect(text).toContain('[transcript:1]');
    expect(text).toContain('Intro call');
    expect(text).toContain('1 transcript');
  });

  it('shows pagination cursor when available', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscripts: vi.fn().mockResolvedValue({ transcripts: [MOCK_TRANSCRIPT], nextCursor: 'cursor-abc' }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcripts', { limit: 20 });
    expect(result.content[0].text).toContain('cursor-abc');
  });

  it('passes filter and cursor to the API', async () => {
    const mockGetTranscripts = vi.fn().mockResolvedValue({ transcripts: [MOCK_TRANSCRIPT], nextCursor: undefined });
    const mockApi = { ...BASE_API(), getTranscripts: mockGetTranscripts } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    await callTool('get_transcripts', { filter: 'createdAt>2024-01-01T00:00:00Z', limit: 10, cursor: 'c1' });
    expect(mockGetTranscripts).toHaveBeenCalledWith(expect.objectContaining({
      filter: 'createdAt>2024-01-01T00:00:00Z',
      cursor: 'c1',
      limit: 10,
    }));
  });

  it('formats a transcript with null note gracefully', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscripts: vi.fn().mockResolvedValue({ transcripts: [MOCK_TRANSCRIPT_NO_NOTE], nextCursor: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcripts', { limit: 20 });
    const text = result.content[0].text;
    expect(text).toContain('[transcript:2]');
    expect(text).not.toContain(' — "');
    expect(text).not.toContain('[people:');
  });

  it('returns message when no transcripts found', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscripts: vi.fn().mockResolvedValue({ transcripts: [], nextCursor: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcripts', { limit: 20 });
    expect(result.content[0].text).toContain('No transcripts found');
  });
});

describe('get_transcript tool', () => {
  it('returns transcript header with summary and fragment content', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
      getTranscriptFragments: vi.fn().mockResolvedValue({ fragments: [MOCK_FRAGMENT], nextCursor: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript', { transcript_id: 1, limit: 20 });
    const text = result.content[0].text;
    expect(text).toContain('[transcript:1]');
    expect(text).toContain('Intro call');
    expect(text).toContain('Alice');
    expect(text).toContain('Hello, nice to meet you.');
    expect(text).toContain('[0.0s]');
  });

  it('displays creator info', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
      getTranscriptFragments: vi.fn().mockResolvedValue({ fragments: [MOCK_FRAGMENT], nextCursor: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript', { transcript_id: 1, limit: 20 });
    expect(result.content[0].text).toContain('Alice Smith');
  });

  it('formats a fragment with no speaker', async () => {
    const fragmentNoSpeaker: AffinityTranscriptFragment = {
      ...MOCK_FRAGMENT, id: 'frag-2', speaker: null, content: 'Background noise.',
    };
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
      getTranscriptFragments: vi.fn().mockResolvedValue({ fragments: [fragmentNoSpeaker], nextCursor: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript', { transcript_id: 1, limit: 20 });
    const text = result.content[0].text;
    expect(text).toContain('Background noise.');
    expect(text).not.toContain('null:');
  });

  it('shows pagination cursor when more fragments available', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
      getTranscriptFragments: vi.fn().mockResolvedValue({ fragments: [MOCK_FRAGMENT], nextCursor: 'frag-page-2' }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript', { transcript_id: 1, limit: 20 });
    expect(result.content[0].text).toContain('frag-page-2');
    expect(result.content[0].text).toContain('More content available');
  });

  it('returns "no content" message when fragments are empty', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
      getTranscriptFragments: vi.fn().mockResolvedValue({ fragments: [], nextCursor: undefined }),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript', { transcript_id: 1, limit: 20 });
    expect(result.content[0].text).toContain('No transcript content available');
  });
});

describe('get_transcript_info tool', () => {
  it('returns metadata and AI summary', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript_info', { transcript_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('[transcript:1]');
    expect(text).toContain('Summary:');
    expect(text).toContain('Intro call');
    expect(text).toContain('Alice Smith');
  });

  it('omits summary section when note is null', async () => {
    const mockApi = {
      ...BASE_API(),
      getTranscript: vi.fn().mockResolvedValue(MOCK_TRANSCRIPT_NO_NOTE),
    } as unknown as TranscriptsApi;
    const { server, callTool } = makeMockServer();
    registerTranscriptTools(server, mockApi);
    const result = await callTool('get_transcript_info', { transcript_id: 2 });
    expect(result.content[0].text).not.toContain('Summary:');
  });
});
