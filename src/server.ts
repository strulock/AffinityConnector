// Assembles the MCP server: instantiates all Affinity API classes and registers
// all tool groups. Called once per Worker request with the API key from env.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AffinityClient, AffinityClientOptions } from "./affinity/client.js";
import { PeopleApi } from "./affinity/people.js";
import { OrganizationsApi } from "./affinity/organizations.js";
import { registerPeopleTools } from "./tools/people.js";
import { registerOrganizationTools } from "./tools/organizations.js";
import { ListsApi } from "./affinity/lists.js";
import { registerListTools } from "./tools/lists.js";
import { NotesApi } from "./affinity/notes.js";
import { registerNotesTools } from "./tools/notes.js";
import { IntelligenceApi } from "./affinity/intelligence.js";
import { registerIntelligenceTools } from "./tools/intelligence.js";
import { FieldsApi } from "./affinity/fields.js";
import { registerFieldTools } from "./tools/fields.js";
import { OpportunitiesApi } from "./affinity/opportunities.js";
import { registerOpportunityTools } from "./tools/opportunities.js";
import { RemindersApi } from "./affinity/reminders.js";
import { registerReminderTools } from "./tools/reminders.js";

export function createServer(apiKey: string, options?: AffinityClientOptions): McpServer {
  const client = new AffinityClient(apiKey, options);
  const peopleApi = new PeopleApi(client);
  const orgsApi = new OrganizationsApi(client);
  const listsApi = new ListsApi(client);
  const notesApi = new NotesApi(client);
  const intelligenceApi = new IntelligenceApi(client);
  const fieldsApi = new FieldsApi(client);
  const opportunitiesApi = new OpportunitiesApi(client);
  const remindersApi = new RemindersApi(client);

  const server = new McpServer({
    name: "affinity-connector",
    version: "0.1.0",
  });

  registerPeopleTools(server, peopleApi);
  registerOrganizationTools(server, orgsApi);
  registerListTools(server, listsApi);
  registerNotesTools(server, notesApi);
  // Intelligence tools cross-reference people, orgs, and notes to build intro paths and summaries.
  registerIntelligenceTools(server, intelligenceApi, peopleApi, orgsApi, notesApi);
  registerFieldTools(server, fieldsApi);
  registerOpportunityTools(server, opportunitiesApi);
  registerReminderTools(server, remindersApi);

  return server;
}
