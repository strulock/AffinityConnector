import { describe, it, expect, vi } from 'vitest';
import { UtilityApi } from '../../src/affinity/utility.js';
import { registerUtilityTools } from '../../src/tools/utility.js';
import { makeMockServer } from '../helpers/mock-server.js';
import type { AffinityCurrentUser, AffinityRateLimit } from '../../src/affinity/types.js';

const MOCK_USER: AffinityCurrentUser = {
  id: 1, first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com',
  organization_id: 42, organization_name: 'Example Corp',
};

const MOCK_RATE_LIMIT: AffinityRateLimit = {
  limit: 900, remaining: 750, reset_in: 30,
};

describe('get_whoami tool', () => {
  it('returns formatted user identity', async () => {
    const mockApi = {
      getCurrentUser: vi.fn().mockResolvedValue(MOCK_USER),
      getRateLimit: vi.fn(),
    } as unknown as UtilityApi;
    const { server, callTool } = makeMockServer();
    registerUtilityTools(server, mockApi);
    const result = await callTool('get_whoami', {});
    const text = result.content[0].text;
    expect(text).toContain('Jane Doe');
    expect(text).toContain('jane@example.com');
    expect(text).toContain('Example Corp');
    expect(text).toContain('[user:1]');
    expect(text).toContain('[org:42]');
  });

  it('shows "(unknown)" when both first and last name are empty', async () => {
    const userNoName = { ...MOCK_USER, first_name: '', last_name: '' };
    const mockApi = {
      getCurrentUser: vi.fn().mockResolvedValue(userNoName),
      getRateLimit: vi.fn(),
    } as unknown as UtilityApi;
    const { server, callTool } = makeMockServer();
    registerUtilityTools(server, mockApi);
    const result = await callTool('get_whoami', {});
    expect(result.content[0].text).toContain('(unknown)');
  });

  it('omits org name when organization_name is null', async () => {
    const userNoOrg = { ...MOCK_USER, organization_name: null };
    const mockApi = {
      getCurrentUser: vi.fn().mockResolvedValue(userNoOrg),
      getRateLimit: vi.fn(),
    } as unknown as UtilityApi;
    const { server, callTool } = makeMockServer();
    registerUtilityTools(server, mockApi);
    const result = await callTool('get_whoami', {});
    const text = result.content[0].text;
    expect(text).toContain('Jane Doe');
    expect(text).not.toContain(' at ');
  });
});

describe('get_rate_limit tool', () => {
  it('returns formatted rate limit info', async () => {
    const mockApi = {
      getCurrentUser: vi.fn(),
      getRateLimit: vi.fn().mockResolvedValue(MOCK_RATE_LIMIT),
    } as unknown as UtilityApi;
    const { server, callTool } = makeMockServer();
    registerUtilityTools(server, mockApi);
    const result = await callTool('get_rate_limit', {});
    const text = result.content[0].text;
    expect(text).toContain('750');
    expect(text).toContain('900');
    expect(text).toContain('30s');
  });
});
