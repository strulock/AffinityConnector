// Affinity v1 list endpoints: /lists, /lists/:id/list-entries, /field-values

import { AffinityClient } from './client.js';
import { CACHE_TTL } from '../cache.js';
import type { AffinityList, AffinityListEntry, AffinityFieldValue } from './types.js';

export class ListsApi {
  constructor(private client: AffinityClient) {}

  /** Fetch all lists in the workspace (pipelines, contact lists, etc.). */
  async getLists(): Promise<AffinityList[]> {
    const cacheKey = 'lists:all';
    const cached = await this.client.cache.get<AffinityList[]>(cacheKey);
    if (cached) return cached;

    const lists = await this.client.get<AffinityList[]>('/lists');
    await this.client.cache.set(cacheKey, lists, CACHE_TTL.list);
    return lists;
  }

  /**
   * Fetch entries for a list. The v1 response wraps entries in `list_entries` with a
   * `next_page_token` cursor; we normalise this to `{ entries, nextPageToken }`.
   */
  async getListEntries(
    listId: number,
    limit = 25,
    pageToken?: string,
  ): Promise<{ entries: AffinityListEntry[]; nextPageToken?: string }> {
    const cacheKey = `list-entries:${listId}:${limit}:${pageToken ?? ''}`;
    const cached = await this.client.cache.get<{ entries: AffinityListEntry[]; nextPageToken?: string }>(cacheKey);
    if (cached) return cached;

    const params: Record<string, unknown> = { page_size: limit };
    if (pageToken) params.page_token = pageToken;
    const result = await this.client.get<{
      list_entries: AffinityListEntry[];
      next_page_token?: string | null;
    }>(`/lists/${listId}/list-entries`, params);
    const response = {
      entries: result.list_entries ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
    await this.client.cache.set(cacheKey, response, CACHE_TTL.listEntries);
    return response;
  }

  /** Fetch all custom field values for a specific list entry. Returns an array directly. */
  async getFieldValues(listEntryId: number): Promise<AffinityFieldValue[]> {
    const cacheKey = `field-values:${listEntryId}`;
    const cached = await this.client.cache.get<AffinityFieldValue[]>(cacheKey);
    if (cached) return cached;

    const values = await this.client.get<AffinityFieldValue[]>('/field-values', {
      list_entry_id: listEntryId,
    });
    await this.client.cache.set(cacheKey, values, CACHE_TTL.listEntries);
    return values;
  }
}
