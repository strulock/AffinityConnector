// Shared formatting utilities for MCP tool display.

/** Type guard for Affinity dropdown/ranked-dropdown values that carry a `.text` label. */
function hasText(v: unknown): v is { text: string } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'text' in v;
}

/**
 * Convert an arbitrary Affinity field value to a display string.
 * Dropdown objects are shown by their `.text` label; null/undefined use the provided fallback.
 */
export function displayValue(value: unknown, nullLabel = '(empty)'): string {
  if (value === null || value === undefined) return nullLabel;
  if (hasText(value)) return String(value.text);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
