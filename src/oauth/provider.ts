// Core OAuth 2.1 server logic: client registration, authorization codes, token exchange.
// All state is stored in a dedicated OAUTH_KV namespace.

import { encryptApiKey, decryptApiKey, sha256Hex, randomHex } from "./crypto.js";

// --- KV key prefixes ---
const PREFIX_CLIENT = "oauth:client:";
const PREFIX_CODE = "oauth:code:";
const PREFIX_TOKEN = "oauth:token:";
const PREFIX_REFRESH = "oauth:refresh:";

// --- TTLs (seconds) ---
const TTL_CLIENT = 30 * 24 * 3600;    // 30 days
const TTL_CODE = 10 * 60;             // 10 minutes
const TTL_ACCESS = 3600;              // 1 hour
const TTL_REFRESH = 30 * 24 * 3600;   // 30 days

// --- Types ---

export interface OAuthClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_id_issued_at: number;
}

interface AuthorizationCodeRecord {
  encrypted_api_key: string;
  code_challenge: string;
  code_challenge_method: string;
  client_id: string;
  redirect_uri: string;
  scopes: string[];
}

interface TokenRecord {
  encrypted_api_key: string;
  client_id: string;
  scopes: string[];
  expires_at: number;
}

interface RefreshTokenRecord {
  encrypted_api_key: string;
  client_id: string;
  scopes: string[];
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

// --- Client Registration (RFC 7591) ---

export async function registerClient(kv: KVNamespace, body: unknown): Promise<OAuthClient> {
  if (!body || typeof body !== "object") {
    throw new OAuthError("invalid_client_metadata", "Request body must be a JSON object.");
  }
  const meta = body as Record<string, unknown>;

  // redirect_uris is required
  if (!Array.isArray(meta.redirect_uris) || meta.redirect_uris.length === 0) {
    throw new OAuthError("invalid_client_metadata", "redirect_uris is required and must be a non-empty array.");
  }
  for (const uri of meta.redirect_uris) {
    if (typeof uri !== "string") {
      throw new OAuthError("invalid_client_metadata", "Each redirect_uri must be a string.");
    }
    try { new URL(uri); } catch {
      throw new OAuthError("invalid_client_metadata", `Invalid redirect_uri: ${uri}`);
    }
  }

  // grant_types defaults to ["authorization_code"]
  const grantTypes = Array.isArray(meta.grant_types) ? meta.grant_types as string[] : ["authorization_code"];
  if (!grantTypes.includes("authorization_code")) {
    throw new OAuthError("invalid_client_metadata", "grant_types must include authorization_code.");
  }

  // Public clients only (OAuth 2.1 for browser-based apps)
  const authMethod = typeof meta.token_endpoint_auth_method === "string"
    ? meta.token_endpoint_auth_method
    : "none";
  if (authMethod !== "none") {
    throw new OAuthError("invalid_client_metadata", "Only token_endpoint_auth_method=none (public clients) is supported.");
  }

  const client: OAuthClient = {
    client_id: crypto.randomUUID(),
    client_name: typeof meta.client_name === "string" ? meta.client_name : undefined,
    redirect_uris: meta.redirect_uris as string[],
    grant_types: grantTypes,
    response_types: Array.isArray(meta.response_types) ? meta.response_types as string[] : ["code"],
    token_endpoint_auth_method: authMethod,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };

  await kv.put(PREFIX_CLIENT + client.client_id, JSON.stringify(client), { expirationTtl: TTL_CLIENT });
  return client;
}

export async function getClient(kv: KVNamespace, clientId: string): Promise<OAuthClient | null> {
  const raw = await kv.get(PREFIX_CLIENT + clientId);
  if (!raw) return null;
  return JSON.parse(raw) as OAuthClient;
}

// --- Authorization Codes ---

export async function createAuthorizationCode(
  kv: KVNamespace,
  encKey: CryptoKey,
  params: {
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    scopes: string[];
    apiKey: string;
  },
): Promise<string> {
  if (params.code_challenge_method !== "S256") {
    throw new OAuthError("invalid_request", "Only code_challenge_method=S256 is supported.");
  }

  const client = await getClient(kv, params.client_id);
  if (!client) {
    throw new OAuthError("invalid_request", "Unknown client_id.");
  }
  if (!client.redirect_uris.includes(params.redirect_uri)) {
    throw new OAuthError("invalid_request", "redirect_uri does not match any registered URI.");
  }

  const encrypted = await encryptApiKey(encKey, params.apiKey);
  const code = randomHex(32);

  const record: AuthorizationCodeRecord = {
    encrypted_api_key: encrypted,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method,
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    scopes: params.scopes,
  };

  await kv.put(PREFIX_CODE + code, JSON.stringify(record), { expirationTtl: TTL_CODE });
  return code;
}

// --- Token Exchange ---

export async function exchangeCodeForTokens(
  kv: KVNamespace,
  encKey: CryptoKey,
  params: {
    code: string;
    client_id: string;
    redirect_uri?: string;
    code_verifier: string;
  },
): Promise<OAuthTokenResponse> {
  const codeKey = PREFIX_CODE + params.code;
  const raw = await kv.get(codeKey);
  if (!raw) {
    throw new OAuthError("invalid_grant", "Authorization code is invalid or expired.");
  }
  // One-time use: delete immediately
  await kv.delete(codeKey);

  const record = JSON.parse(raw) as AuthorizationCodeRecord;

  if (record.client_id !== params.client_id) {
    throw new OAuthError("invalid_grant", "client_id mismatch.");
  }
  if (params.redirect_uri && record.redirect_uri !== params.redirect_uri) {
    throw new OAuthError("invalid_grant", "redirect_uri mismatch.");
  }

  // PKCE S256 verification
  const verifierHash = await sha256Hex(params.code_verifier);
  const challengeHex = base64urlToHex(record.code_challenge);
  if (verifierHash !== challengeHex) {
    throw new OAuthError("invalid_grant", "PKCE code_verifier does not match code_challenge.");
  }

  return issueTokens(kv, encKey, record.encrypted_api_key, record.client_id, record.scopes);
}

// --- Refresh Token ---

export async function refreshAccessToken(
  kv: KVNamespace,
  encKey: CryptoKey,
  params: {
    refresh_token: string;
    client_id: string;
  },
): Promise<OAuthTokenResponse> {
  const refreshHash = await sha256Hex(params.refresh_token);
  const refreshKey = PREFIX_REFRESH + refreshHash;
  const raw = await kv.get(refreshKey);
  if (!raw) {
    throw new OAuthError("invalid_grant", "Refresh token is invalid or expired.");
  }
  // Token rotation: delete old refresh token
  await kv.delete(refreshKey);

  const record = JSON.parse(raw) as RefreshTokenRecord;

  if (record.client_id !== params.client_id) {
    throw new OAuthError("invalid_grant", "client_id mismatch.");
  }

  return issueTokens(kv, encKey, record.encrypted_api_key, record.client_id, record.scopes);
}

// --- Token Resolution (for /mcp requests) ---

export async function resolveToken(
  kv: KVNamespace,
  encKey: CryptoKey,
  bearerToken: string,
): Promise<string | null> {
  const tokenHash = await sha256Hex(bearerToken);
  const raw = await kv.get(PREFIX_TOKEN + tokenHash);
  if (!raw) return null;

  const record = JSON.parse(raw) as TokenRecord;
  if (record.expires_at < Math.floor(Date.now() / 1000)) return null;

  return decryptApiKey(encKey, record.encrypted_api_key);
}

// --- Helpers ---

async function issueTokens(
  kv: KVNamespace,
  encKey: CryptoKey,
  encryptedApiKey: string,
  clientId: string,
  scopes: string[],
): Promise<OAuthTokenResponse> {
  const accessToken = randomHex(32);
  const refreshToken = randomHex(32);
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_ACCESS;

  const tokenRecord: TokenRecord = {
    encrypted_api_key: encryptedApiKey,
    client_id: clientId,
    scopes,
    expires_at: expiresAt,
  };

  const refreshRecord: RefreshTokenRecord = {
    encrypted_api_key: encryptedApiKey,
    client_id: clientId,
    scopes,
  };

  const accessHash = await sha256Hex(accessToken);
  const refreshHash = await sha256Hex(refreshToken);

  await Promise.all([
    kv.put(PREFIX_TOKEN + accessHash, JSON.stringify(tokenRecord), { expirationTtl: TTL_ACCESS }),
    kv.put(PREFIX_REFRESH + refreshHash, JSON.stringify(refreshRecord), { expirationTtl: TTL_REFRESH }),
  ]);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TTL_ACCESS,
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  };
}

/** Convert a base64url-encoded string to lowercase hex. */
function base64urlToHex(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - b64url.length % 4) % 4);
  const binary = atob(b64);
  let hex = "";
  for (let i = 0; i < binary.length; i++) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

// --- Error class ---

export class OAuthError extends Error {
  constructor(readonly errorCode: string, message: string) {
    super(message);
    this.name = "OAuthError";
  }

  toJSON() {
    return { error: this.errorCode, error_description: this.message };
  }
}
