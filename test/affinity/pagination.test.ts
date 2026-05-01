import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractCursor } from '../../src/affinity/pagination.js';

afterEach(() => vi.restoreAllMocks());

describe('extractCursor', () => {
  it('returns the cursor query param when nextUrl is well-formed', () => {
    expect(extractCursor('https://api.affinity.co/v2/notes?cursor=tok-abc')).toBe('tok-abc');
  });

  it('returns undefined when nextUrl is null, undefined, or empty', () => {
    expect(extractCursor(null)).toBeUndefined();
    expect(extractCursor(undefined)).toBeUndefined();
    expect(extractCursor('')).toBeUndefined();
  });

  it('returns undefined when the URL has no cursor query param', () => {
    expect(extractCursor('https://api.affinity.co/v2/notes?limit=25')).toBeUndefined();
  });

  it('warns and returns undefined when nextUrl is non-empty but unparseable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractCursor('not-a-url')).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('not-a-url');
  });
});
