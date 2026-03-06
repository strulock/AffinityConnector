import { describe, it, expect, vi, afterEach } from 'vitest';
import { RemindersApi } from '../../src/affinity/reminders.js';
import { AffinityClient } from '../../src/affinity/client.js';
import { registerReminderTools } from '../../src/tools/reminders.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityReminder } from '../../src/affinity/types.js';

const MOCK_REMINDER: AffinityReminder = {
  id: 1,
  content: 'Follow up with Alice',
  due_date: '2024-03-01',
  person_ids: [10],
  organization_ids: [],
  opportunity_ids: [],
  creator_id: 99,
  completed_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const COMPLETED_REMINDER: AffinityReminder = {
  ...MOCK_REMINDER,
  id: 2,
  completed_at: '2024-02-15T10:00:00Z',
};

afterEach(() => vi.unstubAllGlobals());

const BASE_MOCK_API = () => ({
  getReminders: vi.fn(),
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
});

describe('get_reminders tool', () => {
  it('returns formatted reminders', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([MOCK_REMINDER]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    const result = await callTool('get_reminders', {});
    const text = result.content[0].text;
    expect(text).toContain('Follow up with Alice');
    expect(text).toContain('due 2024-03-01');
    expect(text).toContain('[reminder:1]');
    expect(text).toContain('people: 10');
    expect(text).toContain('1 reminder');
  });

  it('shows "completed" status for completed reminders', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([COMPLETED_REMINDER]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    const result = await callTool('get_reminders', {});
    expect(result.content[0].text).toContain('completed 2024-02-15');
  });

  it('returns a message when no reminders exist', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    const result = await callTool('get_reminders', {});
    expect(result.content[0].text).toContain('No reminders found');
  });

  it('passes filter params to the API', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([MOCK_REMINDER]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    await callTool('get_reminders', { person_id: 10 });
    expect(mockApi.getReminders).toHaveBeenCalledWith(expect.objectContaining({ person_id: 10 }));
  });
});

describe('create_reminder tool', () => {
  it('returns a success message with the new reminder ID', async () => {
    const mockApi = { ...BASE_MOCK_API(), createReminder: vi.fn().mockResolvedValue(MOCK_REMINDER) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    const result = await callTool('create_reminder', {
      content: 'Follow up with Alice',
      due_date: '2024-03-01',
      person_ids: [10],
    });
    const text = result.content[0].text;
    expect(text).toContain('Created reminder');
    expect(text).toContain('[id:1]');
    expect(text).toContain('2024-03-01');
  });

  it('returns a validation error when no associations are provided', async () => {
    const mockApi = BASE_MOCK_API();
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    const result = await callTool('create_reminder', { content: 'Test', due_date: '2024-03-01' });
    expect(result.content[0].text).toContain('At least one of');
    expect(mockApi.createReminder).not.toHaveBeenCalled();
  });
});

describe('update_reminder tool', () => {
  it('returns a success message with updated details', async () => {
    const updated = { ...MOCK_REMINDER, due_date: '2024-04-01' };
    const mockApi = { ...BASE_MOCK_API(), updateReminder: vi.fn().mockResolvedValue(updated) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    const result = await callTool('update_reminder', { reminder_id: 1, due_date: '2024-04-01' });
    const text = result.content[0].text;
    expect(text).toContain('Updated reminder');
    expect(text).toContain('[id:1]');
    expect(text).toContain('due 2024-04-01');
  });

  it('shows "completed" when the reminder was marked done', async () => {
    const mockApi = { ...BASE_MOCK_API(), updateReminder: vi.fn().mockResolvedValue(COMPLETED_REMINDER) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    const result = await callTool('update_reminder', { reminder_id: 2, completed: true });
    expect(result.content[0].text).toContain('completed');
  });

  it('returns a validation error when no fields are provided', async () => {
    const mockApi = BASE_MOCK_API();
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    const result = await callTool('update_reminder', { reminder_id: 1 });
    expect(result.content[0].text).toContain('Provide at least one field');
    expect(mockApi.updateReminder).not.toHaveBeenCalled();
  });
});

describe('delete_reminder tool', () => {
  it('returns a success message after deletion', async () => {
    const mockApi = { ...BASE_MOCK_API(), deleteReminder: vi.fn().mockResolvedValue(undefined) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi);
    const result = await callTool('delete_reminder', { reminder_id: 1 });
    expect(mockApi.deleteReminder).toHaveBeenCalledWith(1);
    expect(result.content[0].text).toContain('1');
    expect(result.content[0].text).toContain('deleted successfully');
  });
});
