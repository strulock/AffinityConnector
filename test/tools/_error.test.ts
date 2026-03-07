import { describe, it, expect } from 'vitest';
import { toolError } from '../../src/tools/_error.js';
import {
  AffinityNotFoundError,
  AffinityPermissionError,
  AffinityServerError,
  AffinityConflictError,
} from '../../src/affinity/client.js';

describe('toolError', () => {
  it('returns a "Not found" text response for AffinityNotFoundError', () => {
    const result = toolError(new AffinityNotFoundError('person 999 not found'));
    expect(result.content[0].text).toContain('Not found:');
    expect(result.content[0].text).toContain('person 999 not found');
  });

  it('returns a "Permission denied" text response for AffinityPermissionError', () => {
    const result = toolError(new AffinityPermissionError('insufficient scope'));
    expect(result.content[0].text).toContain('Permission denied:');
    expect(result.content[0].text).toContain('insufficient scope');
  });

  it('returns a server error text response for AffinityServerError', () => {
    const result = toolError(new AffinityServerError(503, 'service unavailable'));
    expect(result.content[0].text).toContain('Affinity server error (503):');
    expect(result.content[0].text).toContain('service unavailable');
  });

  it('returns a "Conflict" text response for AffinityConflictError', () => {
    const result = toolError(new AffinityConflictError('duplicate record detected'));
    expect(result.content[0].text).toContain('Conflict:');
    expect(result.content[0].text).toContain('duplicate record detected');
  });

  it('re-throws unknown errors', () => {
    const unknown = new Error('network failure');
    expect(() => toolError(unknown)).toThrow('network failure');
  });
});
