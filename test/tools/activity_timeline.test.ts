import { describe, it, expect, vi } from 'vitest';
import { NotesApi } from '../../src/affinity/notes.js';
import { registerActivityTimelineTool } from '../../src/tools/activity_timeline.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityNote } from '../../src/affinity/types.js';

const MOCK_NOTE: AffinityNote = {
  id: 1, person_ids: [1], organization_ids: [], opportunity_ids: [],
  creator_id: 99, content: 'Expressed strong interest in Series B round',
  type: 0, is_deleted: false, created_at: '2024-03-01T00:00:00Z',
};

function setup(notes: AffinityNote[] = []) {
  const notesApi = {
    getNotes: vi.fn().mockResolvedValue({ notes, nextPageToken: undefined }),
  } as unknown as NotesApi;
  const { server, callTool } = makeMockServer();
  registerActivityTimelineTool(server, notesApi);
  return { callTool, notesApi };
}

describe('get_activity_timeline tool', () => {
  it('returns a validation error when neither person_id nor organization_id is provided', async () => {
    const { callTool } = setup();
    const result = await callTool('get_activity_timeline', {});
    expect(result.content[0].text).toContain('Provide either person_id or organization_id');
  });

  it('returns "No activity found" when notes are empty', async () => {
    const { callTool } = setup();
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    expect(result.content[0].text).toBe('No activity found.');
  });

  it('returns a sorted note timeline', async () => {
    const older: AffinityNote = { ...MOCK_NOTE, id: 2, content: 'Older note', created_at: '2024-02-01T00:00:00Z' };
    const newer: AffinityNote = { ...MOCK_NOTE, id: 3, content: 'Newer note', created_at: '2024-04-01T00:00:00Z' };
    const { callTool } = setup([older, MOCK_NOTE, newer]);
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('[2024-04-01 Note] Newer note');
    expect(text).toContain('[2024-03-01 Note] Expressed strong interest');
    expect(text).toContain('[2024-02-01 Note] Older note');
    expect(text.indexOf('2024-04-01')).toBeLessThan(text.indexOf('2024-03-01'));
    expect(text.indexOf('2024-03-01')).toBeLessThan(text.indexOf('2024-02-01'));
    expect(text).toContain('3 activity item(s) for person 1');
  });

  it('filters out items before the since date', async () => {
    const older: AffinityNote = { ...MOCK_NOTE, id: 2, created_at: '2024-02-01T00:00:00Z' };
    const { callTool } = setup([MOCK_NOTE, older]);
    const result = await callTool('get_activity_timeline', { person_id: 1, since: '2024-03-01' });
    const text = result.content[0].text;
    expect(text).toContain('2024-03-01');
    expect(text).not.toContain('2024-02-01');
    expect(text).toContain('since 2024-03-01');
    expect(text).toContain('1 activity item(s)');
  });

  it('caps results at the limit', async () => {
    const notes: AffinityNote[] = Array.from({ length: 5 }, (_, i) => ({
      ...MOCK_NOTE,
      id: i + 1,
      created_at: `2024-0${i + 1}-01T00:00:00Z`,
    }));
    const { callTool } = setup(notes);
    const result = await callTool('get_activity_timeline', { person_id: 1, limit: 3 });
    expect(result.content[0].text).toContain('3 activity item(s)');
  });

  it('forwards person_id to notesApi', async () => {
    const { callTool, notesApi } = setup();
    await callTool('get_activity_timeline', { person_id: 42, limit: 20 });
    expect(notesApi.getNotes).toHaveBeenCalledWith(expect.objectContaining({ person_id: 42 }));
  });

  it('forwards organization_id to notesApi', async () => {
    const { callTool, notesApi } = setup();
    await callTool('get_activity_timeline', { organization_id: 10, limit: 20 });
    expect(notesApi.getNotes).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 10 }));
  });

  it('uses "organization N" in the header when org scope is used', async () => {
    const { callTool } = setup([MOCK_NOTE]);
    const result = await callTool('get_activity_timeline', { organization_id: 10 });
    expect(result.content[0].text).toContain('organization 10');
  });

  it('truncates long note content to 120 chars', async () => {
    const longNote: AffinityNote = { ...MOCK_NOTE, content: 'A'.repeat(200) };
    const { callTool } = setup([longNote]);
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    const line = result.content[0].text.split('\n').find(l => l.includes('[2024-03-01 Note]'))!;
    const label = line.slice(line.indexOf('] ') + 2);
    expect(label.length).toBe(120);
  });
});
