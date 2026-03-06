import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer } from '../src/server.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createServer', () => {
  it('returns an McpServer instance without throwing', () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(() => createServer('test-api-key')).not.toThrow();
  });

  it('throws when API key is empty', () => {
    expect(() => createServer('')).toThrow();
  });

  it('accepts custom base URL options', () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(() =>
      createServer('key', {
        v1BaseUrl: 'https://custom.v1.example.com',
        v2BaseUrl: 'https://custom.v2.example.com',
      })
    ).not.toThrow();
  });
});
