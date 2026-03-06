# AffinityConnector

An MCP (Model Context Protocol) server that gives Claude direct access to your [Affinity CRM](https://affinity.co) data. Ask Claude natural-language questions about your contacts, pipeline, notes, interactions, and relationship intelligence — all powered by live Affinity data.

Deployed as a **Cloudflare Worker** at `https://affinity.trulock.com/mcp`.

---

## Available Tools

### People & Organizations
| Tool | Description |
|------|-------------|
| `search_people` | Search contacts by name or email |
| `get_person` | Full profile + interaction history for a person |
| `search_organizations` | Search companies by name or domain |
| `get_organization` | Full org profile + associated people |

### Lists & Pipeline
| Tool | Description |
|------|-------------|
| `get_lists` | List all Affinity lists (pipelines, contact lists, etc.) |
| `get_list_entries` | Entries in a list (people, orgs, or opportunities) |
| `get_field_values` | Custom field values for a list entry |

### Notes & Activity
| Tool | Description |
|------|-------------|
| `get_notes` | Notes on a person, org, or opportunity |
| `create_note` | Add a note to one or more records |
| `get_interactions` | Email and meeting history |

### Intelligence
| Tool | Description |
|------|-------------|
| `get_relationship_strength` | 0–100 relationship score for a person or org |
| `find_intro_path` | Who in your network can introduce you to a target |
| `summarize_relationship` | Full relationship briefing (profile + notes + interactions + strength) |

---

## Connecting to Claude

### claude.ai (Remote MCP)

1. Go to **claude.ai → Settings → Integrations**
2. Click **Add Integration**
3. Enter the MCP URL: `https://affinity.trulock.com/mcp`
4. Click **Connect**

### Claude Desktop (Local config)

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "affinity": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://affinity.trulock.com/mcp"
      ]
    }
  }
}
```

Config file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

---

## Architecture

```
User (Claude Desktop / claude.ai)
        │
        │  HTTPS + Cloudflare Access (SSO)
        ▼
┌──────────────────────────────┐
│   Cloudflare Worker          │
│  ┌────────────────────────┐  │
│  │    MCP Server Layer    │  │  ← Streamable HTTP transport
│  └──────────┬─────────────┘  │
│  ┌──────────▼─────────────┐  │
│  │   Affinity API Client  │  │  ← fetch-based REST wrapper
│  └──────────┬─────────────┘  │
│  ┌──────────▼─────────────┐  │
│  │   Cloudflare KV Cache  │  │  ← 2–10 min TTL per data type
│  └────────────────────────┘  │
└──────────────────────────────┘
        │  HTTPS / REST
        ▼
  Affinity CRM API (affinity.co)
```

---

## Deployment

### Prerequisites
- Cloudflare account with Workers enabled
- Affinity API key (Settings → API)
- `wrangler` CLI: `npm install -g wrangler`

### First-time setup

```bash
# 1. Clone the repo
git clone https://github.com/strulock/AffinityConnector.git
cd AffinityConnector
npm install

# 2. Authenticate wrangler
wrangler login

# 3. Set the Affinity API key as a secret
wrangler secret put AFFINITY_API_KEY

# 4. Deploy
wrangler deploy
```

### CI/CD (GitHub Actions)

Every push to `main` automatically type-checks and deploys via `.github/workflows/deploy.yml`.

Required GitHub repository secrets:
| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers and KV edit permissions |
| `AFFINITY_API_KEY` | Affinity CRM API key |

### Local development

Create a `.dev.vars` file (gitignored):

```
AFFINITY_API_KEY=your_key_here
```

Then run:

```bash
npm run dev
```

The server will be available at `http://localhost:8787/mcp`.

---

## Configuration

**`wrangler.toml`** — non-sensitive config and KV binding:

```toml
name = "affinity-connector"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
AFFINITY_V1_BASE_URL = "https://api.affinity.co"
AFFINITY_V2_BASE_URL = "https://api.affinity.co/v2"

[[kv_namespaces]]
binding = "AFFINITY_CACHE"
id = "<your-kv-namespace-id>"
```

**Secrets** (set via `wrangler secret put`):
- `AFFINITY_API_KEY` — your Affinity API key, encrypted at rest

---

## License

GNU General Public License v3.0
