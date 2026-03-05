import { AffinityClient } from './client.js';
import type { AffinityList, AffinityListEntry, AffinityFieldValue } from './types.js';

export class ListsApi {
  constructor(private client: AffinityClient) {}

  async getLists(): Promise<AffinityList[]> {
    return this.client.get<AffinityList[]>('/lists');
  }

  async getListEntries(
    listId: number,
    limit = 25,
    pageToken?: string,
  ): Promise<{ entries: AffinityListEntry[]; nextPageToken?: string }> {
    const params: Record<string, unknown> = { page_size: limit };
    if (pageToken) params.page_token = pageToken;
    const result = await this.client.get<{
      list_entries: AffinityListEntry[];
      next_page_token?: string | null;
    }>(`/lists/${listId}/list-entries`, params);
    return {
      entries: result.list_entries ?? [],
      nextPageToken: result.next_page_token ?? undefined,
    };
  }

  async getFieldValues(listEntryId: number): Promise<AffinityFieldValue[]> {
    return this.client.get<AffinityFieldValue[]>('/field-values', {
      list_entry_id: listEntryId,
    });
  }
}
