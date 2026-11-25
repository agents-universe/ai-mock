import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './tools/projects.js';
import { registerEnvironmentTools } from './tools/environments.js';
import { registerApiTools } from './tools/apis.js';
import { registerBranchTools } from './tools/branches.js';
import { registerTestingTools } from './tools/testing.js';

/**
 * Single tool registry shared by both transports (streamable HTTP + stdio).
 * A fresh McpServer per connection keeps the HTTP path stateless.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'ai-mock', version: '0.1.0' });
  registerProjectTools(server);
  registerEnvironmentTools(server);
  registerApiTools(server);
  registerBranchTools(server);
  registerTestingTools(server);
  return server;
}
