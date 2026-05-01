// Shared v2 cursor pagination utilities.

/**
 * Extract cursor from a v2 pagination.nextUrl string. Returns undefined if absent.
 * Logs a warning if the URL is non-empty but unparseable — silently truncating a
 * paginated result set produces "complete" answers that are actually partial.
 */
export function extractCursor(nextUrl: string | null | undefined): string | undefined {
  if (!nextUrl) return undefined;
  try {
    return new URL(nextUrl).searchParams.get('cursor') ?? undefined;
  } catch {
    console.warn(`extractCursor: failed to parse pagination.nextUrl: ${nextUrl}`);
    return undefined;
  }
}
