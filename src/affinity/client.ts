import { KVCache } from '../cache.js';

// Typed error classes for Affinity API failures

export class AffinityAuthError extends Error {
  readonly status = 401;
  constructor(message: string) { super(message); this.name = "AffinityAuthError"; }
}

export class AffinityPermissionError extends Error {
  readonly status = 403;
  constructor(message: string) { super(message); this.name = "AffinityPermissionError"; }
}

export class AffinityNotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) { super(message); this.name = "AffinityNotFoundError"; }
}

export class AffinityRateLimitError extends Error {
  readonly status = 429;
  constructor(message: string) { super(message); this.name = "AffinityRateLimitError"; }
}

export class AffinityServerError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "AffinityServerError";
  }
}

export interface AffinityClientOptions {
  v1BaseUrl?: string;
  v2BaseUrl?: string;
  cache?: KVNamespace;
}

export class AffinityClient {
  private readonly v1BaseUrl: string;
  private readonly v2BaseUrl: string;
  private readonly authHeader: string;
  readonly cache: KVCache;

  constructor(apiKey: string, options?: AffinityClientOptions) {
    if (!apiKey) throw new AffinityAuthError("AFFINITY_API_KEY is required.");
    // Affinity supports both Basic and Bearer auth; Bearer is simpler on the edge.
    this.authHeader = "Bearer " + apiKey;
    this.v1BaseUrl = options?.v1BaseUrl ?? "https://api.affinity.co";
    this.v2BaseUrl = options?.v2BaseUrl ?? "https://api.affinity.co/v2";
    this.cache = new KVCache(options?.cache);
  }

  /** Issue a GET request. Defaults to v1; pass `version: "v2"` for v2 endpoints. */
  async get<T>(path: string, params?: Record<string, unknown>, version: "v1" | "v2" = "v1"): Promise<T> {
    return this.apiRequest<T>("GET", path, undefined, params, version);
  }

  /** Issue a POST request with a JSON body. Defaults to v1. */
  async post<T>(path: string, body: unknown, version: "v1" | "v2" = "v1"): Promise<T> {
    return this.apiRequest<T>("POST", path, body, undefined, version);
  }

  /** Issue a PUT request with a JSON body. Defaults to v1. */
  async put<T>(path: string, body: unknown, version: "v1" | "v2" = "v1"): Promise<T> {
    return this.apiRequest<T>("PUT", path, body, undefined, version);
  }

  /** Issue a DELETE request. Defaults to v1. */
  async del<T>(path: string, version: "v1" | "v2" = "v1"): Promise<T> {
    return this.apiRequest<T>("DELETE", path, undefined, undefined, version);
  }

  /**
   * Builds the full URL (selecting v1 or v2 base), appends non-null query params,
   * attaches auth headers, and delegates to fetchWithRetry.
   */
  private async apiRequest<T>(
    method: string,
    path: string,
    body: unknown,
    params: Record<string, unknown> | undefined,
    version: "v1" | "v2"
  ): Promise<T> {
    const baseUrl = version === "v2" ? this.v2BaseUrl : this.v1BaseUrl;
    const url = new URL(baseUrl + path);

    if (params) {
      // Skip null/undefined so callers can spread optional fields without filtering first.
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const init: RequestInit = {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    return this.fetchWithRetry<T>(url.toString(), init);
  }

  private async fetchWithRetry<T>(url: string, init: RequestInit, attempt = 0): Promise<T> {
    const response = await fetch(url, init);

    if (response.ok) {
      if (response.status === 204) return undefined as unknown as T;
      return response.json() as Promise<T>;
    }

    const status = response.status;
    let message: string;
    try {
      const body = await response.json() as { message?: string; error?: string };
      message = body.message ?? body.error ?? response.statusText;
    } catch {
      message = response.statusText;
    }

    if (status === 401) throw new AffinityAuthError(message);
    if (status === 403) throw new AffinityPermissionError(message);
    if (status === 404) throw new AffinityNotFoundError(message);

    if (status === 429) {
      if (attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.fetchWithRetry<T>(url, init, attempt + 1);
      }
      throw new AffinityRateLimitError("Rate limit exceeded after 3 retries.");
    }

    if (status >= 500) throw new AffinityServerError(status, message);

    throw new Error("Affinity API error " + status + ": " + message);
  }
}
