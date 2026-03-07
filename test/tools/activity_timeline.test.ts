import { describe, it, expect, vi } from 'vitest';
import { InteractionsV2Api } from '../../src/affinity/interactions_v2.js';
import { NotesApi } from '../../src/affinity/notes.js';
import { registerActivityTimelineTool } from '../../src/tools/activity_timeline.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityEmailV2, AffinityMeetingV2, AffinityNote } from '../../src/affinity/types.js';

const MOCK_EMAIL: AffinityEmailV2 = {
  id: 'email-1', subject: 'Intro call follow-up', sent_at: '2024-03-15T09:00:00Z',
  created_at: '2024-03-15T09:00:00Z', person_ids: [1], organization_ids: [],
};

const MOCK_MEETING: AffinityMeetingV2 = {
  id: 'meeting-1', title: 'Q1 Pipeline Review',
  start_time: '2024-03-10T10:00:00Z', end_time: '2024-03-10T10:45:00Z',
  created_at: '2024-03-10T10:00:00Z', person_ids: [1], organization_ids: [],
};

const MOCK_NOTE: AffinityNote = {
  id: 1, person_ids: [1], organization_ids: [], opportunity_ids: [],
  creator_id: 99, content: 'Expressed strong interest in Series B round',
  type: 0, is_deleted: false, created_at: '2024-03-01T00:00:00Z',
};

function setup(
  emails: AffinityEmailV2[] = [],
  meetings: AffinityMeetingV2[] = [],
  notes: AffinityNote[] = [],
) {
  const interactionsV2Api = {
    getEmails: vi.fn().mockResolvedValue({ emails, nextPageToken: undefined }),
    getMeetings: vi.fn().mockResolvedValue({ meetings, nextPageToken: undefined }),
  } as unknown as InteractionsV2Api;
  const notesApi = {
    getNotes: vi.fn().mockResolvedValue({ notes, nextPageToken: undefined }),
  } as unknown as NotesApi;
  const { server, callTool } = makeMockServer();
  registerActivityTimelineTool(server, interactionsV2Api, notesApi);
  return { callTool, interactionsV2Api, notesApi };
}

describe('get_activity_timeline tool', () => {
  it('returns a validation error when neither person_id nor organization_id is provided', async () => {
    const { callTool } = setup();
    const result = await callTool('get_activity_timeline', {});
    expect(result.content[0].text).toContain('Provide either person_id or organization_id');
  });

  it('returns "No activity found" when all three sources are empty', async () => {
    const { callTool } = setup();
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    expect(result.content[0].text).toBe('No activity found.');
  });

  it('returns a combined sorted timeline with emails, meetings, and notes', async () => {
    const { callTool } = setup([MOCK_EMAIL], [MOCK_MEETING], [MOCK_NOTE]);
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    const text = result.content[0].text;
    expect(text).toContain('[2024-03-15 Email] Subject: Intro call follow-up');
    expect(text).toContain('[2024-03-10 Meeting] Q1 Pipeline Review (45 min)');
    expect(text).toContain('[2024-03-01 Note] Expressed strong interest');
    // Sorted descending: email first, meeting second, note third
    expect(text.indexOf('2024-03-15')).toBeLessThan(text.indexOf('2024-03-10'));
    expect(text.indexOf('2024-03-10')).toBeLessThan(text.indexOf('2024-03-01'));
    expect(text).toContain('3 activity item(s) for person 1');
  });

  it('filters out items before the since date', async () => {
    const { callTool } = setup([MOCK_EMAIL], [MOCK_MEETING], [MOCK_NOTE]);
    const result = await callTool('get_activity_timeline', { person_id: 1, since: '2024-03-10' });
    const text = result.content[0].text;
    expect(text).toContain('2024-03-15');
    expect(text).toContain('2024-03-10');
    expect(text).not.toContain('2024-03-01');
    expect(text).toContain('since 2024-03-10');
    expect(text).toContain('2 activity item(s)');
  });

  it('caps results at the limit', async () => {
    const emails: AffinityEmailV2[] = Array.from({ length: 5 }, (_, i) => ({
      ...MOCK_EMAIL,
      id: `email-${i}`,
      sent_at: `2024-0${i + 1}-01T00:00:00Z`,
      created_at: `2024-0${i + 1}-01T00:00:00Z`,
    }));
    const { callTool } = setup(emails);
    const result = await callTool('get_activity_timeline', { person_id: 1, limit: 3 });
    expect(result.content[0].text).toContain('3 activity item(s)');
  });

  it('forwards person_id to all three APIs', async () => {
    const { callTool, interactionsV2Api, notesApi } = setup();
    await callTool('get_activity_timeline', { person_id: 42, limit: 20 });
    expect(interactionsV2Api.getEmails).toHaveBeenCalledWith(expect.objectContaining({ person_id: 42 }));
    expect(interactionsV2Api.getMeetings).toHaveBeenCalledWith(expect.objectContaining({ person_id: 42 }));
    expect(notesApi.getNotes).toHaveBeenCalledWith(expect.objectContaining({ person_id: 42 }));
  });

  it('forwards organization_id to all three APIs', async () => {
    const { callTool, interactionsV2Api, notesApi } = setup();
    await callTool('get_activity_timeline', { organization_id: 10, limit: 20 });
    expect(interactionsV2Api.getEmails).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 10 }));
    expect(interactionsV2Api.getMeetings).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 10 }));
    expect(notesApi.getNotes).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 10 }));
  });

  it('uses "organization N" in the header when org scope is used', async () => {
    const { callTool } = setup([], [], [MOCK_NOTE]);
    const result = await callTool('get_activity_timeline', { organization_id: 10 });
    expect(result.content[0].text).toContain('organization 10');
  });

  it('formats meeting without end_time correctly (no duration)', async () => {
    const noEnd: AffinityMeetingV2 = { ...MOCK_MEETING, end_time: null };
    const { callTool } = setup([], [noEnd]);
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    expect(result.content[0].text).toContain('Q1 Pipeline Review');
    expect(result.content[0].text).not.toContain('min)');
  });

  it('shows "(no subject)" for email with null subject', async () => {
    const noSubject: AffinityEmailV2 = { ...MOCK_EMAIL, subject: null };
    const { callTool } = setup([noSubject]);
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    expect(result.content[0].text).toContain('(no subject)');
  });

  it('shows "(no title)" for meeting with null title', async () => {
    const noTitle: AffinityMeetingV2 = { ...MOCK_MEETING, title: null };
    const { callTool } = setup([], [noTitle]);
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    expect(result.content[0].text).toContain('(no title)');
  });

  it('omits duration when meeting start and end time are equal', async () => {
    const zeroDuration: AffinityMeetingV2 = { ...MOCK_MEETING, end_time: MOCK_MEETING.start_time };
    const { callTool } = setup([], [zeroDuration]);
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    expect(result.content[0].text).not.toContain('min)');
  });

  it('preserves order of items with equal dates (sort returns 0)', async () => {
    const email1: AffinityEmailV2 = { ...MOCK_EMAIL, id: 'e1', sent_at: '2024-03-15T09:00:00Z' };
    const email2: AffinityEmailV2 = { ...MOCK_EMAIL, id: 'e2', sent_at: '2024-03-15T09:00:00Z', subject: 'Same time email' };
    const { callTool } = setup([email1, email2]);
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    expect(result.content[0].text).toContain('Same time email');
  });

  it('truncates long note content to 120 chars', async () => {
    const longNote: AffinityNote = { ...MOCK_NOTE, content: 'A'.repeat(200) };
    const { callTool } = setup([], [], [longNote]);
    const result = await callTool('get_activity_timeline', { person_id: 1 });
    const line = result.content[0].text.split('\n').find(l => l.includes('[2024-03-01 Note]'))!;
    // label portion after "] " should be exactly 120 chars
    const label = line.slice(line.indexOf('] ') + 2);
    expect(label.length).toBe(120);
  });
});
