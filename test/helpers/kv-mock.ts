/**
 * In-memory mock of Cloudflare KVNamespace for use in tests.
 * Supports get, put, delete, and prefix-filtered list.
 */
export function makeKVMock(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    list: async (options?: { prefix?: string }) => {
      const prefix = options?.prefix ?? '';
      const keys = [...store.keys()]
        .filter(k => k.startsWith(prefix))
        .map(name => ({ name, expiration: undefined, metadata: null }));
      return { keys, list_complete: true, cursor: '', cacheStatus: null };
    },
    getWithMetadata: async (key: string) => ({ value: store.get(key) ?? null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}
