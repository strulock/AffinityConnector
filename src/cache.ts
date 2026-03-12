// Thin wrapper around Cloudflare KV for caching Affinity API GET responses.
// If no KV namespace is provided (e.g. local dev without .dev.vars binding),
// all operations are no-ops and requests pass through to the API.

// Cache key convention: "<namespace>:<sorted-params-json>"
// Use stableKey() for any key derived from an object so key order never affects cache hits.
// Simple scalar keys (e.g. `people:${id}`) are fine as plain template strings.

/**
 * Build a deterministic cache key by sorting object keys before stringifying.
 * Undefined values are omitted so optional params don't affect the key.
 */
export function stableKey(prefix: string, params: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
  );
  return `${prefix}:${JSON.stringify(sorted)}`;
}

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

  async delete(key: string): Promise<void> {
    if (!this.kv) return;
    await this.kv.delete(key);
  }

  /** Delete all keys that start with the given prefix. */
  async deleteWithPrefix(prefix: string): Promise<void> {
    if (!this.kv) return;
    const { keys } = await this.kv.list({ prefix });
    await Promise.all(keys.map(k => this.kv!.delete(k.name)));
  }
}

// TTLs in seconds for different data categories
export const CACHE_TTL = {
  profile: 300,       // person/org profiles — 5 min
  list: 600,          // list metadata — 10 min
  listEntries: 300,   // list entries — 5 min
  notes: 120,         // notes — 2 min
  strength: 300,      // relationship strength — 5 min
  fields: 600,        // field definitions — 10 min (schema changes infrequently)
  reminders: 120,     // reminders — 2 min (time-sensitive follow-ups)
} as const;
