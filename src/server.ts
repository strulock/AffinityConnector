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

export function createServer(apiKey: string, options?: AffinityClientOptions): McpServer {
  const client = new AffinityClient(apiKey, options);
  const peopleApi = new PeopleApi(client);
  const orgsApi = new OrganizationsApi(client);
  const listsApi = new ListsApi(client);
  const notesApi = new NotesApi(client);
  const intelligenceApi = new IntelligenceApi(client);

  const server = new McpServer({
    name: "affinity-connector",
    version: "0.1.0",
  });

  registerPeopleTools(server, peopleApi);
  registerOrganizationTools(server, orgsApi);
  registerListTools(server, listsApi);
  registerNotesTools(server, notesApi);
  registerIntelligenceTools(server, intelligenceApi, peopleApi, orgsApi, notesApi);

  return server;
}
