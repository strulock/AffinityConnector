// Thin wrapper around Cloudflare KV for caching Affinity API GET responses.
// If no KV namespace is provided (e.g. local dev without .dev.vars binding),
// all operations are no-ops and requests pass through to the API.

export class KVCache {
  constructor(private kv: KVNamespace | undefined) {}

  async get<T>(key: string): Promise<T | null> {
    if (!this.kv) return null;
    const raw = await this.kv.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.kv) return;
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  }
}

// TTLs in seconds for different data categories
export const CACHE_TTL = {
  profile: 300,       // person/org profiles — 5 min
  list: 600,          // list metadata — 10 min
  listEntries: 300,   // list entries — 5 min
  notes: 120,         // notes — 2 min
  interactions: 120,  // interactions — 2 min
  strength: 300,      // relationship strength — 5 min
  fields: 600,        // field definitions — 10 min (schema changes infrequently)
} as const;
