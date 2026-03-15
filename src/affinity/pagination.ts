// Shared v2 cursor pagination utilities.

/** Extract cursor from a v2 pagination.nextUrl string. Returns undefined if absent or malformed. */
export function extractCursor(nextUrl: string | null | undefined): string | undefined {
  if (!nextUrl) return undefined;
  try {
    return new URL(nextUrl).searchParams.get('cursor') ?? undefined;
  } catch {
    return undefined;
  }
}
