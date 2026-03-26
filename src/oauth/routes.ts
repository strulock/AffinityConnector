// HTTP route handlers for OAuth 2.1 endpoints.
// Each handler takes (request, env) and returns a Response.

import type { Env } from "../index.js";
import { importEncryptionKey } from "./crypto.js";
import {
  registerClient,
  getClient,
  createAuthorizationCode,
  exchangeCodeForTokens,
  refreshAccessToken,
  OAuthError,
} from "./provider.js";
import { renderAuthorizePage } from "./authorize-page.js";

/** Asserts OAuth bindings are configured, returning the required env values. */
function requireOAuthEnv(env: Env): { kv: KVNamespace; encryptionKey: string } {
  if (!env.OAUTH_KV || !env.OAUTH_ENCRYPTION_KEY) {
    throw new Error("OAuth is not configured. Set OAUTH_KV and OAUTH_ENCRYPTION_KEY.");
  }
  return { kv: env.OAUTH_KV, encryptionKey: env.OAUTH_ENCRYPTION_KEY };
}

// CORS headers for OAuth endpoints (called by Claude's client, which may vary in origin)
const OAUTH_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function withOAuthCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(OAUTH_CORS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(body: unknown, status = 200, extra?: Record<string, string>): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...OAUTH_CORS, ...extra };
  return new Response(JSON.stringify(body), { status, headers });
}

function oauthErrorResponse(e: OAuthError, status = 400): Response {
  return jsonResponse(e.toJSON(), status);
}

// --- GET /.well-known/oauth-authorization-server ---

export function handleOAuthMetadata(request: Request, env: Env): Response {
  const { origin } = new URL(request.url);
  return jsonResponse({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["affinity"],
  });
}

// --- POST /oauth/register ---

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return withOAuthCors(new Response("Method Not Allowed", { status: 405 }));
  }

  const { kv } = requireOAuthEnv(env);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthErrorResponse(new OAuthError("invalid_client_metadata", "Invalid JSON body."));
  }

  try {
    const client = await registerClient(kv, body);
    return jsonResponse(client, 201);
  } catch (e) {
    if (e instanceof OAuthError) return oauthErrorResponse(e);
    throw e;
  }
}

// --- GET /oauth/authorize ---

export async function handleAuthorizeGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const params = {
    response_type: url.searchParams.get("response_type") ?? "",
    client_id: url.searchParams.get("client_id") ?? "",
    redirect_uri: url.searchParams.get("redirect_uri") ?? "",
    code_challenge: url.searchParams.get("code_challenge") ?? "",
    code_challenge_method: url.searchParams.get("code_challenge_method") ?? "",
    state: url.searchParams.get("state") ?? "",
    scope: url.searchParams.get("scope") ?? "affinity",
  };

  // Validate required params
  if (params.response_type !== "code") {
    return errorRedirectOrPage(params, "Unsupported response_type. Must be 'code'.");
  }
  if (!params.client_id || !params.redirect_uri || !params.code_challenge) {
    return errorRedirectOrPage(params, "Missing required parameters (client_id, redirect_uri, code_challenge).");
  }
  if (params.code_challenge_method !== "S256") {
    return errorRedirectOrPage(params, "Only code_challenge_method=S256 is supported.");
  }

  // Verify client exists and redirect_uri is registered
  const { kv } = requireOAuthEnv(env);
  const client = await getClient(kv, params.client_id);
  if (!client) {
    return errorRedirectOrPage(params, "Unknown client_id.");
  }
  if (!client.redirect_uris.includes(params.redirect_uri)) {
    return errorRedirectOrPage(params, "redirect_uri is not registered for this client.");
  }

  // Render the API key entry form
  const html = renderAuthorizePage(params);
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// --- POST /oauth/authorize ---

export async function handleAuthorizePost(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const params = {
    client_id: formData.get("client_id") as string ?? "",
    redirect_uri: formData.get("redirect_uri") as string ?? "",
    state: formData.get("state") as string ?? "",
    code_challenge: formData.get("code_challenge") as string ?? "",
    code_challenge_method: formData.get("code_challenge_method") as string ?? "",
    scope: formData.get("scope") as string ?? "affinity",
  };
  const apiKey = (formData.get("api_key") as string ?? "").trim();

  if (!apiKey) {
    return renderFormWithError(params, "Please enter your Affinity API key.");
  }

  // Validate the API key against Affinity
  try {
    const res = await fetch("https://api.affinity.co/v2/auth/whoami", {
      headers: { Authorization: "Bearer " + apiKey },
    });
    if (res.status === 401 || res.status === 403) {
      return renderFormWithError(params, "Invalid API key. Please check and try again.");
    }
    if (!res.ok) {
      return renderFormWithError(params, `Affinity returned an error (${res.status}). Please try again later.`);
    }
  } catch {
    return renderFormWithError(params, "Could not reach Affinity to validate your key. Please try again.");
  }

  // Key is valid — encrypt and create authorization code
  const { kv, encryptionKey } = requireOAuthEnv(env);
  const encKey = await importEncryptionKey(encryptionKey);
  const code = await createAuthorizationCode(kv, encKey, {
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method,
    scopes: params.scope.split(" ").filter(Boolean),
    apiKey,
  });

  // Redirect back to the client with the authorization code
  const redirectUrl = new URL(params.redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (params.state) redirectUrl.searchParams.set("state", params.state);

  return new Response(null, { status: 302, headers: { Location: redirectUrl.toString() } });
}

// --- POST /oauth/token ---

export async function handleToken(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return withOAuthCors(new Response("Method Not Allowed", { status: 405 }));
  }

  let form: URLSearchParams;
  try {
    const text = await request.text();
    form = new URLSearchParams(text);
  } catch {
    return oauthErrorResponse(new OAuthError("invalid_request", "Could not parse form body."));
  }

  const grantType = form.get("grant_type") ?? "";
  const { kv, encryptionKey } = requireOAuthEnv(env);
  const encKey = await importEncryptionKey(encryptionKey);

  try {
    if (grantType === "authorization_code") {
      const code = form.get("code") ?? "";
      const clientId = form.get("client_id") ?? "";
      const redirectUri = form.get("redirect_uri") ?? undefined;
      const codeVerifier = form.get("code_verifier") ?? "";

      if (!code || !clientId || !codeVerifier) {
        throw new OAuthError("invalid_request", "Missing required parameters (code, client_id, code_verifier).");
      }

      const tokens = await exchangeCodeForTokens(kv, encKey, {
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });
      return jsonResponse(tokens, 200, { "Cache-Control": "no-store" });
    }

    if (grantType === "refresh_token") {
      const refreshToken = form.get("refresh_token") ?? "";
      const clientId = form.get("client_id") ?? "";

      if (!refreshToken || !clientId) {
        throw new OAuthError("invalid_request", "Missing required parameters (refresh_token, client_id).");
      }

      const tokens = await refreshAccessToken(kv, encKey, {
        refresh_token: refreshToken,
        client_id: clientId,
      });
      return jsonResponse(tokens, 200, { "Cache-Control": "no-store" });
    }

    return oauthErrorResponse(new OAuthError("unsupported_grant_type", `Unsupported grant_type: ${grantType}`));
  } catch (e) {
    if (e instanceof OAuthError) return oauthErrorResponse(e);
    throw e;
  }
}

// --- Helpers ---

function renderFormWithError(params: { client_id: string; redirect_uri: string; state: string; code_challenge: string; code_challenge_method: string; scope: string }, error: string): Response {
  const html = renderAuthorizePage({ ...params, error });
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function errorRedirectOrPage(params: { client_id: string; redirect_uri: string; state: string; code_challenge: string; code_challenge_method: string; scope: string }, error: string): Response {
  // If we can't trust the redirect_uri (client not verified), show an error page instead of redirecting
  const html = renderAuthorizePage({ ...params, error });
  return new Response(html, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
