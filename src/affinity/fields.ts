// Affinity v1 field endpoints: /fields, /persons/fields, /organizations/fields, /field-value-changes
//
// Fields represent the schema of custom columns in Affinity lists and global entity types.
// Field value changes provide a full audit trail of mutations to any field value.

import { AffinityClient } from './client.js';
import { CACHE_TTL } from '../cache.js';
import type { AffinityField, AffinityFieldValueChange } from './types.js';

export class FieldsApi {
  constructor(private client: AffinityClient) {}

  /**
   * Fetch custom field definitions. Pass `listId` to scope to a specific list;
   * omit for all fields in the workspace (global + list-specific combined).
   */
  async getFields(listId?: number): Promise<AffinityField[]> {
    const cacheKey = `fields:list:${listId ?? 'all'}`;
    const cached = await this.client.cache.get<AffinityField[]>(cacheKey);
    if (cached) return cached;

    const params = listId ? { list_id: listId } : undefined;
    const fields = await this.client.get<AffinityField[]>('/fields', params);
    const result = Array.isArray(fields) ? fields : [];
    await this.client.cache.set(cacheKey, result, CACHE_TTL.fields);
    return result;
  }

  /**
   * Fetch global field definitions that apply to all Person records.
   * These fields are not tied to a specific list.
   */
  async getPersonFields(): Promise<AffinityField[]> {
    const cacheKey = 'fields:persons';
    const cached = await this.client.cache.get<AffinityField[]>(cacheKey);
    if (cached) return cached;

    const fields = await this.client.get<AffinityField[]>('/persons/fields');
    const result = Array.isArray(fields) ? fields : [];
    await this.client.cache.set(cacheKey, result, CACHE_TTL.fields);
    return result;
  }

  /**
   * Fetch global field definitions that apply to all Organization records.
   * These fields are not tied to a specific list.
   */
  async getOrganizationFields(): Promise<AffinityField[]> {
    const cacheKey = 'fields:organizations';
    const cached = await this.client.cache.get<AffinityField[]>(cacheKey);
    if (cached) return cached;

    const fields = await this.client.get<AffinityField[]>('/organizations/fields');
    const result = Array.isArray(fields) ? fields : [];
    await this.client.cache.set(cacheKey, result, CACHE_TTL.fields);
    return result;
  }

  /**
   * Fetch the audit history of value changes for a specific field.
   * Optionally filter by entity or list entry.
   * Not cached — always returns live audit data.
   */
  async getFieldValueChanges(params: {
    field_id: number;
    entity_id?: number;
    list_entry_id?: number;
  }): Promise<AffinityFieldValueChange[]> {
    const result = await this.client.get<AffinityFieldValueChange[]>(
      '/field-value-changes',
      params
    );
    return Array.isArray(result) ? result : [];
  }
}
