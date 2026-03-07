import { describe, it, expect } from 'vitest';
import { KVCache, CACHE_TTL } from '../src/cache.js';
import { makeKVMock } from './helpers/kv-mock.js';

describe('KVCache', () => {
  describe('with no KV namespace', () => {
    const cache = new KVCache(undefined);

    it('get returns null', async () => {
      expect(await cache.get('any-key')).toBeNull();
    });

    it('set is a no-op', async () => {
      await expect(cache.set('any-key', { foo: 1 }, 60)).resolves.toBeUndefined();
    });
  });

  describe('with a KV namespace', () => {
    it('get returns null for a missing key', async () => {
      const cache = new KVCache(makeKVMock());
      expect(await cache.get('missing')).toBeNull();
    });

    it('set then get round-trips a value', async () => {
      const cache = new KVCache(makeKVMock());
      const value = { id: 1, name: 'Acme' };
      await cache.set('orgs:1', value, 300);
      expect(await cache.get('orgs:1')).toEqual(value);
    });

    it('get returns null for invalid JSON', async () => {
      const kv = makeKVMock();
      // Bypass KVCache.set to inject invalid JSON directly
      await kv.put('bad-key', 'not-json');
      const cache = new KVCache(kv);
      expect(await cache.get('bad-key')).toBeNull();
    });

    it('set stores value as JSON string with the given TTL', async () => {
      const putCalls: { key: string; value: string; options: unknown }[] = [];
      const kv = {
        ...makeKVMock(),
        put: async (key: string, value: string, options: unknown) => {
          putCalls.push({ key, value, options });
        },
      } as unknown as KVNamespace;
      const cache = new KVCache(kv);
      await cache.set('test-key', [1, 2, 3], 120);
      expect(putCalls).toHaveLength(1);
      expect(putCalls[0].key).toBe('test-key');
      expect(JSON.parse(putCalls[0].value as string)).toEqual([1, 2, 3]);
      expect(putCalls[0].options).toEqual({ expirationTtl: 120 });
    });
  });

  describe('delete', () => {
    it('removes a key from the store', async () => {
      const cache = new KVCache(makeKVMock());
      await cache.set('to-delete', { x: 1 }, 60);
      await cache.delete('to-delete');
      expect(await cache.get('to-delete')).toBeNull();
    });

    it('is a no-op when no KV namespace is configured', async () => {
      const cache = new KVCache(undefined);
      await expect(cache.delete('any-key')).resolves.toBeUndefined();
    });
  });

  describe('deleteWithPrefix', () => {
    it('deletes all keys matching the prefix', async () => {
      const cache = new KVCache(makeKVMock());
      await cache.set('people:search:Alice:20', ['Alice'], 60);
      await cache.set('people:search:Bob:20', ['Bob'], 60);
      await cache.set('orgs:1', { id: 1 }, 60);
      await cache.deleteWithPrefix('people:search:');
      expect(await cache.get('people:search:Alice:20')).toBeNull();
      expect(await cache.get('people:search:Bob:20')).toBeNull();
      // Non-matching key is untouched
      expect(await cache.get('orgs:1')).toEqual({ id: 1 });
    });

    it('is a no-op when no KV namespace is configured', async () => {
      const cache = new KVCache(undefined);
      await expect(cache.deleteWithPrefix('people:search:')).resolves.toBeUndefined();
    });
  });

  describe('CACHE_TTL constants', () => {
    it('has expected TTL values', () => {
      expect(CACHE_TTL.profile).toBe(300);
      expect(CACHE_TTL.list).toBe(600);
      expect(CACHE_TTL.listEntries).toBe(300);
      expect(CACHE_TTL.notes).toBe(120);
      expect(CACHE_TTL.strength).toBe(300);
    });
  });
});
