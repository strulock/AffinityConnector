import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AffinityClient } from "./affinity/client.js";
import { PeopleApi } from "./affinity/people.js";
import { OrganizationsApi } from "./affinity/organizations.js";
import { registerPeopleTools } from "./tools/people.js";
import { registerOrganizationTools } from "./tools/organizations.js";

export function createServer(apiKey: string): McpServer {
  const client = new AffinityClient(apiKey);
  const peopleApi = new PeopleApi(client);
  const orgsApi = new OrganizationsApi(client);

  const server = new McpServer({
    name: "affinity-connector",
    version: "0.1.0",
  });

  registerPeopleTools(server, peopleApi);
  registerOrganizationTools(server, orgsApi);

  return server;
}
