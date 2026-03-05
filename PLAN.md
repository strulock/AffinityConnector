# AffinityConnector — Development Plan

## What It Is

An **MCP (Model Context Protocol) server** that gives Claude direct access to your Affinity CRM data, enabling natural language queries, relationship intelligence, and AI-assisted workflows against your live Affinity data.

---

## Architecture

```
Claude (Claude.ai / Claude Code)
        │
        │  MCP Protocol (stdio / SSE)
        ▼
┌──────────────────────────────┐
│      AffinityConnector       │
│  ┌────────────────────────┐  │
│  │    MCP Server Layer    │  │  ← Exposes tools & resources
│  └──────────┬─────────────┘  │
│  ┌──────────▼─────────────┐  │
│  │   Affinity API Client  │  │  ← REST API wrapper
│  └──────────┬─────────────┘  │
│  ┌──────────▼─────────────┐  │
│  │    Auth / Config       │  │  ← API key management
│  └────────────────────────┘  │
└──────────────────────────────┘
        │
        │  HTTPS / REST
        ▼
  Affinity CRM API (affinity.co)
```

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | **TypeScript** | MCP SDK is TypeScript-first; strong typing for API responses |
| Runtime | **Node.js** | Native MCP SDK support |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK |
| HTTP Client | `axios` | Affinity REST API calls |
| Config | `dotenv` | API key management |
| Build | `tsx` + `tsc` | Fast dev, compiled output |
| Package manager | `npm` | Standard |

---

## MCP Tools to Expose

### People & Organizations
- `search_people` — search contacts by name, email, domain
- `get_person` — full profile + interaction history
- `search_organizations` — search companies
- `get_organization` — full org profile + associated people

### Lists & Opportunities
- `get_lists` — list all Affinity lists
- `get_list_entries` — entries in a list (deals, contacts, orgs)
- `get_opportunities` — pipeline/deal data

### Notes & Activity
- `get_notes` — notes on a person or org
- `create_note` — add a note to a record
- `get_interactions` — email/meeting history

### Intelligence
- `find_intro_path` — who can intro me to a target person/org
- `get_relationship_strength` — relationship score data
- `summarize_relationship` — AI-generated relationship summary

---

## MCP Resources to Expose

- `affinity://lists` — available lists
- `affinity://people/{id}` — person record
- `affinity://organizations/{id}` — org record

---

## Phased Roadmap

### Phase 1 — Foundation (MVP)
- Project scaffolding (TypeScript, MCP SDK, `package.json`)
- Affinity API client with auth
- Read-only tools: search people, get person, search orgs, get org
- MCP server wired up and testable via Claude Desktop

### Phase 2 — Lists & Pipeline
- List enumeration and entry retrieval
- Opportunity/deal data
- Field values (custom fields support)

### Phase 3 — Notes & Activity
- Read notes from records
- Write notes (create_note tool)
- Interaction history (emails, meetings)

### Phase 4 — Intelligence Features
- Relationship strength scoring
- Intro path finder
- Meeting prep brief generation (combines Affinity data + Claude synthesis)

### Phase 5 — Polish
- Error handling & rate limit management
- Caching layer (avoid redundant API calls)
- Claude Desktop config documentation
- README with setup guide

---

## Key Affinity API Details

- **Base URL**: `https://api.affinity.co`
- **Auth**: HTTP Basic auth — API key as password, empty username
- **Rate limits**: ~900 req/min (standard)
- **Docs**: https://affinity.co/documentation

---

## Target File Structure

```
AffinityConnector/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── server.ts         # Tool/resource registration
│   ├── affinity/
│   │   ├── client.ts     # Affinity API client
│   │   ├── people.ts     # People endpoints
│   │   ├── organizations.ts
│   │   ├── lists.ts
│   │   ├── notes.ts
│   │   └── types.ts      # TypeScript types for API responses
│   └── tools/
│       ├── people.ts     # MCP tool handlers
│       ├── organizations.ts
│       ├── lists.ts
│       └── notes.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```
