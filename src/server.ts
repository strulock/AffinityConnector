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
import { InteractionsV2Api } from "./affinity/interactions_v2.js";
import { registerInteractionsV2Tools } from "./tools/interactions_v2.js";
import { SemanticSearchApi } from "./affinity/semantic_search.js";
import { registerSemanticSearchTools } from "./tools/semantic_search.js";
import { TranscriptsApi } from "./affinity/transcripts.js";
import { registerTranscriptTools } from "./tools/transcripts.js";
import { MergesApi } from "./affinity/merges.js";
import { registerMergeTools } from "./tools/merges.js";
import { UtilityApi } from "./affinity/utility.js";
import { registerUtilityTools } from "./tools/utility.js";
import { WebhooksApi } from "./affinity/webhooks.js";
import { registerWebhookTools } from "./tools/webhooks.js";
import { registerSearchAllTool } from "./tools/search_all.js";
import { registerActivityTimelineTool } from "./tools/activity_timeline.js";

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
  const interactionsV2Api = new InteractionsV2Api(client);
  const semanticSearchApi = new SemanticSearchApi(client);
  const transcriptsApi = new TranscriptsApi(client);
  const mergesApi = new MergesApi(client);
  const utilityApi = new UtilityApi(client);
  const webhooksApi = new WebhooksApi(client);

  const server = new McpServer({
    name: "affinity-connector",
    version: "0.1.0",
  });

  registerPeopleTools(server, peopleApi);
  registerOrganizationTools(server, orgsApi);
  registerListTools(server, listsApi);
  registerNotesTools(server, notesApi);
  // Intelligence tools cross-reference people, orgs, and notes to build intro paths and summaries.
  registerIntelligenceTools(server, intelligenceApi, peopleApi, orgsApi, notesApi, interactionsV2Api);
  registerFieldTools(server, fieldsApi);
  registerOpportunityTools(server, opportunitiesApi);
  registerReminderTools(server, remindersApi);
  registerInteractionsV2Tools(server, interactionsV2Api);
  registerSemanticSearchTools(server, semanticSearchApi);
  registerTranscriptTools(server, transcriptsApi);
  registerMergeTools(server, mergesApi);
  registerUtilityTools(server, utilityApi);
  registerWebhookTools(server, webhooksApi, client.cache, peopleApi, orgsApi);
  registerSearchAllTool(server, peopleApi, orgsApi, opportunitiesApi);
  registerActivityTimelineTool(server, interactionsV2Api, notesApi);

  return server;
}
