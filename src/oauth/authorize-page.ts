// Renders the HTML page where users paste their Affinity API key during the OAuth authorize step.

export interface AuthorizePageParams {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  error?: string;
}

export function renderAuthorizePage(params: AuthorizePageParams): string {
  const errorBanner = params.error
    ? `<div class="error">${escapeHtml(params.error)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Affinity</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 2rem; max-width: 420px; width: 100%; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; color: #1a1a1a; }
    p { font-size: 0.9rem; color: #666; margin-bottom: 1.25rem; line-height: 1.4; }
    label { display: block; font-size: 0.85rem; font-weight: 600; color: #333; margin-bottom: 0.4rem; }
    input[type="password"] { width: 100%; padding: 0.6rem 0.75rem; border: 1px solid #d0d0d0; border-radius: 6px; font-size: 0.95rem; margin-bottom: 1rem; }
    input[type="password"]:focus { outline: none; border-color: #4a90d9; box-shadow: 0 0 0 2px rgba(74,144,217,0.2); }
    button { width: 100%; padding: 0.7rem; background: #4a90d9; color: #fff; border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #3a7bc8; }
    .error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 6px; padding: 0.6rem 0.75rem; font-size: 0.85rem; margin-bottom: 1rem; }
    .help { text-align: center; margin-top: 1rem; font-size: 0.8rem; }
    .help a { color: #4a90d9; text-decoration: none; }
    .help a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect your Affinity account</h1>
    <p>Enter your Affinity API key to allow Claude to access your CRM data. Your key is encrypted before storage.</p>
    ${errorBanner}
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeAttr(params.client_id)}">
      <input type="hidden" name="redirect_uri" value="${escapeAttr(params.redirect_uri)}">
      <input type="hidden" name="state" value="${escapeAttr(params.state)}">
      <input type="hidden" name="code_challenge" value="${escapeAttr(params.code_challenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeAttr(params.code_challenge_method)}">
      <input type="hidden" name="scope" value="${escapeAttr(params.scope)}">
      <label for="api_key">Affinity API Key</label>
      <input type="password" id="api_key" name="api_key" placeholder="Paste your API key here" required autocomplete="off">
      <button type="submit">Connect</button>
    </form>
    <div class="help">
      <a href="https://support.affinity.co/hc/en-us/articles/360032633992-How-to-obtain-your-API-key" target="_blank" rel="noopener">Where do I find my API key?</a>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
