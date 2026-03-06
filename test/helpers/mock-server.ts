import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;

/**
 * Creates a lightweight McpServer mock that captures registered tool handlers
 * so tests can invoke them directly and assert on the text output.
 */
export function makeMockServer(): {
  server: McpServer;
  callTool: (name: string, args?: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
} {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      handlers.set(_name, handler);
    },
  } as unknown as McpServer;

  return {
    server,
    callTool: (name, args = {}) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Tool "${name}" was not registered`);
      return handler(args);
    },
  };
}
