import { describe, it, expect, vi, afterEach } from 'vitest';
import { RemindersApi } from '../../src/affinity/reminders.js';
import { AffinityClient, AffinityNotFoundError } from '../../src/affinity/client.js';
import { UtilityApi } from '../../src/affinity/utility.js';
import { registerReminderTools } from '../../src/tools/reminders.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityReminder } from '../../src/affinity/types.js';

const MOCK_REMINDER: AffinityReminder = {
  id: 1,
  type: 0,
  content: 'Follow up with Alice',
  due_date: '2024-03-01T00:00:00.000Z',
  status: 1,
  person: { id: 10, first_name: 'Alice', last_name: 'Smith' },
  organization: null,
  opportunity: null,
  owner: { id: 99, first_name: 'Me', last_name: 'User' },
  creator: { id: 99, first_name: 'Me', last_name: 'User' },
  completed_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const COMPLETED_REMINDER: AffinityReminder = {
  ...MOCK_REMINDER,
  id: 2,
  completed_at: '2024-02-15T10:00:00Z',
};

const ORG_REMINDER: AffinityReminder = {
  ...MOCK_REMINDER, id: 3, person: null,
  organization: { id: 20, name: 'Acme Corp' },
};

const OPP_REMINDER: AffinityReminder = {
  ...MOCK_REMINDER, id: 4, person: null,
  opportunity: { id: 30, name: 'Big Deal' },
};

const NO_ASSOC_REMINDER: AffinityReminder = {
  ...MOCK_REMINDER, id: 5, person: null, organization: null, opportunity: null,
};

afterEach(() => vi.unstubAllGlobals());

const BASE_MOCK_API = () => ({
  getReminders: vi.fn(),
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
});

const MOCK_UTILITY_API = {
  getCurrentUser: vi.fn().mockResolvedValue({ id: 99, first_name: 'Me', last_name: 'User', email: 'me@example.com', organization_id: 1, organization_name: 'Test' }),
  getRateLimit: vi.fn(),
} as unknown as UtilityApi;

describe('get_reminders tool', () => {
  it('returns formatted reminders with person association', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([MOCK_REMINDER]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('get_reminders', {});
    const text = result.content[0].text;
    expect(text).toContain('Follow up with Alice');
    expect(text).toContain('[reminder:1]');
    expect(text).toContain('person: Alice Smith');
    expect(text).toContain('1 reminder');
  });

  it('formats a reminder associated with an organization', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([ORG_REMINDER]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('get_reminders', {});
    expect(result.content[0].text).toContain('org: Acme Corp');
  });

  it('formats a reminder associated with an opportunity', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([OPP_REMINDER]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('get_reminders', {});
    expect(result.content[0].text).toContain('opp: Big Deal');
  });

  it('formats a reminder with no associations (no bracket)', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([NO_ASSOC_REMINDER]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('get_reminders', {});
    expect(result.content[0].text).not.toContain('[person');
    expect(result.content[0].text).not.toContain('[org');
  });

  it('shows "completed" status for completed reminders', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([COMPLETED_REMINDER]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('get_reminders', {});
    expect(result.content[0].text).toContain('completed 2024-02-15');
  });

  it('returns a message when no reminders exist', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('get_reminders', {});
    expect(result.content[0].text).toContain('No reminders found');
  });

  it('passes filter params to the API', async () => {
    const mockApi = { ...BASE_MOCK_API(), getReminders: vi.fn().mockResolvedValue([MOCK_REMINDER]) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    await callTool('get_reminders', { person_id: 10 });
    expect(mockApi.getReminders).toHaveBeenCalledWith(expect.objectContaining({ person_id: 10 }));
  });
});

describe('create_reminder tool', () => {
  it('returns a success message with the new reminder ID', async () => {
    const mockApi = { ...BASE_MOCK_API(), createReminder: vi.fn().mockResolvedValue(MOCK_REMINDER) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('create_reminder', {
      content: 'Follow up with Alice', due_date: '2024-03-01', person_id: 10,
    });
    const text = result.content[0].text;
    expect(text).toContain('Created reminder');
    expect(text).toContain('[id:1]');
  });

  it('returns a validation error when no association is provided', async () => {
    const mockApi = BASE_MOCK_API();
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('create_reminder', { content: 'Test', due_date: '2024-03-01' });
    expect(result.content[0].text).toContain('exactly one');
    expect(mockApi.createReminder).not.toHaveBeenCalled();
  });

  it('rejects when multiple associations are provided', async () => {
    const mockApi = BASE_MOCK_API();
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('create_reminder', {
      content: 'Test', due_date: '2024-03-01', person_id: 10, organization_id: 20,
    });
    expect(result.content[0].text).toContain('exactly one');
    expect(mockApi.createReminder).not.toHaveBeenCalled();
  });

  it('passes owner_id from current user', async () => {
    const mockApi = { ...BASE_MOCK_API(), createReminder: vi.fn().mockResolvedValue(MOCK_REMINDER) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    await callTool('create_reminder', { content: 'Test', due_date: '2024-03-01', organization_id: 20 });
    expect(mockApi.createReminder).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 99 }));
  });

  it('returns a Not found response when the API throws AffinityNotFoundError', async () => {
    const mockApi = { ...BASE_MOCK_API(), createReminder: vi.fn().mockRejectedValue(new AffinityNotFoundError('not found')) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('create_reminder', { content: 'Test', due_date: '2024-03-01', person_id: 999 });
    expect(result.content[0].text).toContain('Not found:');
  });
});

describe('update_reminder tool', () => {
  it('returns a success message with updated details', async () => {
    const updated = { ...MOCK_REMINDER, due_date: '2024-04-01' };
    const mockApi = { ...BASE_MOCK_API(), updateReminder: vi.fn().mockResolvedValue(updated) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('update_reminder', { reminder_id: 1, due_date: '2024-04-01' });
    const text = result.content[0].text;
    expect(text).toContain('Updated reminder');
    expect(text).toContain('[id:1]');
  });

  it('shows "completed" when the reminder was marked done', async () => {
    const mockApi = { ...BASE_MOCK_API(), updateReminder: vi.fn().mockResolvedValue(COMPLETED_REMINDER) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('update_reminder', { reminder_id: 2, completed: true });
    expect(result.content[0].text).toContain('completed');
  });

  it('returns a validation error when no fields are provided', async () => {
    const mockApi = BASE_MOCK_API();
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('update_reminder', { reminder_id: 1 });
    expect(result.content[0].text).toContain('Provide at least one field');
    expect(mockApi.updateReminder).not.toHaveBeenCalled();
  });
});

describe('delete_reminder tool', () => {
  it('returns a success message after deletion', async () => {
    const mockApi = { ...BASE_MOCK_API(), deleteReminder: vi.fn().mockResolvedValue(undefined) };
    const { server, callTool } = makeMockServer();
    registerReminderTools(server, mockApi, MOCK_UTILITY_API);
    const result = await callTool('delete_reminder', { reminder_id: 1 });
    expect(mockApi.deleteReminder).toHaveBeenCalledWith(1);
    expect(result.content[0].text).toContain('deleted successfully');
  });
});
