// Affinity v1 list endpoints: /lists, /lists/:id/list-entries, /field-values

import { AffinityClient } from './client.js';
import { CACHE_TTL } from '../cache.js';
import { extractCursor } from './pagination.js';
import type { AffinityList, AffinityListEntry, AffinityFieldValue, AffinitySavedView } from './types.js';

export class ListsApi {
  constructor(private client: AffinityClient) {}

  /** Fetch all lists in the workspace (pipelines, contact lists, etc.). */
  async getLists(): Promise<AffinityList[]> {
    const cacheKey = 'lists:all';
    const cached = await this.client.cache.get<AffinityList[]>(cacheKey);
    if (cached) return cached;

    const raw = await this.client.get<AffinityList[]>('/lists');
    const lists = Array.isArray(raw) ? raw : [];
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

    const raw = await this.client.get<AffinityFieldValue[]>('/field-values', {
      list_entry_id: listEntryId,
    });
    const values = Array.isArray(raw) ? raw : [];
    await this.client.cache.set(cacheKey, values, CACHE_TTL.listEntries);
    return values;
  }

  /**
   * Create or update a field value on a list entry (v1).
   * - Provide `field_value_id` to update an existing value (PUT /field-values/{id}).
   * - Omit `field_value_id` to create a new value (POST /field-values).
   */
  async setFieldValue(params: {
    field_id: number;
    entity_id: number;
    entity_type: number;
    list_entry_id: number;
    value: unknown;
    field_value_id?: number;
  }): Promise<AffinityFieldValue> {
    const { field_value_id, ...createBody } = params;
    if (field_value_id != null) {
      return this.client.put<AffinityFieldValue>(`/field-values/${field_value_id}`, { value: params.value });
    }
    return this.client.post<AffinityFieldValue>('/field-values', createBody);
  }

  /** Delete a field value by its ID (v1 DELETE /field-values/{id}). */
  async deleteFieldValue(fieldValueId: number): Promise<void> {
    await this.client.del<{ success: boolean }>(`/field-values/${fieldValueId}`);
  }

  /** Add an entity to a list (v1 POST /lists/{id}/list-entries). */
  async addListEntry(listId: number, entityId: number, entityType: number): Promise<AffinityListEntry> {
    return this.client.post<AffinityListEntry>(`/lists/${listId}/list-entries`, {
      entity_id: entityId,
      entity_type: entityType,
    });
  }

  /**
   * Batch update up to 100 fields on a single list entry (v2).
   * PATCH /v2/lists/{listId}/entries/{listEntryId}/fields with operation: update-fields
   * Requires "Export data from Lists" permission.
   */
  async batchSetFieldValues(
    listId: number,
    listEntryId: number,
    fields: Array<{ field_id: number; value: unknown }>,
  ): Promise<AffinityFieldValue[]> {
    const result = await this.client.patch<{ data: AffinityFieldValue[] }>(
      `/lists/${listId}/entries/${listEntryId}/fields`,
      { operation: 'update-fields', fields },
      'v2',
    );
    return result.data ?? [];
  }

  /**
   * Fetch field values for a specific field across all entries in a list.
   * The v1 /field-values endpoint requires a per-entity ID (not list_id),
   * so we first fetch list entries then query per entry in parallel batches.
   * Capped at 500 entries to avoid excessive API calls.
   */
  async getFieldValuesByList(listId: number, fieldId: number): Promise<AffinityFieldValue[]> {
    // Paginate through list entries (up to 500)
    const MAX_ENTRIES = 500;
    const allEntryIds: number[] = [];
    let pageToken: string | undefined;
    while (allEntryIds.length < MAX_ENTRIES) {
      const { entries, nextPageToken } = await this.getListEntries(listId, 100, pageToken);
      for (const e of entries) allEntryIds.push(e.id);
      if (!nextPageToken || entries.length === 0) break;
      pageToken = nextPageToken;
    }
    if (allEntryIds.length === 0) return [];

    // Fetch field values per entry in parallel batches of 10.
    // The v1 /field-values endpoint ignores `field_id` as a filter — it only
    // filters by entity/list_entry — so we filter client-side after fetching.
    const BATCH_SIZE = 10;
    const allValues: AffinityFieldValue[] = [];
    for (let i = 0; i < allEntryIds.length; i += BATCH_SIZE) {
      const batch = allEntryIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (entryId) => {
          const raw = await this.client.get<AffinityFieldValue[]>('/field-values', {
            list_entry_id: entryId,
          });
          if (!Array.isArray(raw)) return [];
          return raw.filter((v) => v.field_id === fieldId);
        }),
      );
      for (const values of results) allValues.push(...values);
    }
    return allValues;
  }

  /** Remove a list entry (v1 DELETE /lists/{id}/list-entries/{entry_id}). */
  async removeListEntry(listId: number, listEntryId: number): Promise<void> {
    await this.client.del<{ success: boolean }>(`/lists/${listId}/list-entries/${listEntryId}`);
  }

  /** Fetch all saved views for a list (v2 GET /v2/lists/{id}/saved-views). */
  async getSavedViews(listId: number): Promise<AffinitySavedView[]> {
    const cacheKey = `saved-views:${listId}`;
    const cached = await this.client.cache.get<AffinitySavedView[]>(cacheKey);
    if (cached) return cached;

    const result = await this.client.get<{ data: AffinitySavedView[] }>(
      `/lists/${listId}/saved-views`, undefined, 'v2',
    );
    const views = result.data ?? [];
    await this.client.cache.set(cacheKey, views, CACHE_TTL.list);
    return views;
  }

  /**
   * Fetch list entries through a saved view (v2).
   * Respects the view's filters, sort order, and visible columns.
   */
  async getSavedViewEntries(
    listId: number,
    viewId: number,
    limit = 25,
    pageToken?: string,
  ): Promise<{ entries: AffinityListEntry[]; nextPageToken?: string }> {
    // v2 uses `limit` and `cursor` (not `page_size` / `page_token`)
    const params: Record<string, unknown> = { limit };
    if (pageToken) params.cursor = pageToken;

    // v2 response shape: { data: [...], pagination: { prevUrl, nextUrl } }
    // entity type is a string ('person' | 'company' | 'opportunity'), not a numeric code
    const result = await this.client.get<{
      data: Array<{
        id: number;
        type: string;
        listId: number;
        createdAt: string;
        creatorId: number | null;
        entity: Record<string, unknown>;
      }>;
      pagination?: { prevUrl?: string | null; nextUrl?: string | null };
    }>(`/lists/${listId}/saved-views/${viewId}/list-entries`, params, 'v2');

    const TYPE_MAP: Record<string, number> = { person: 0, company: 1, opportunity: 8 };
    const entries = (result.data ?? []).map(e => ({
      id: e.id,
      list_id: e.listId ?? listId,
      entity_id: (e.entity?.id as number) ?? 0,
      entity_type: TYPE_MAP[e.type] ?? -1,
      entity: e.entity as unknown as AffinityListEntry['entity'],
      creator_id: e.creatorId ?? null,
      created_at: e.createdAt ?? '',
    })) as AffinityListEntry[];

    return { entries, nextPageToken: extractCursor(result.pagination?.nextUrl) };
  }
}
