#!/usr/bin/env node
/**
 * stdio MCP entrypoint — spawn this from an agent (e.g. Claude Code).
 * No auth here: the process is local and started by the user; stdout is the
 * JSON-RPC channel, so NEVER console.log (console.error only).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { initKnex, runMigrations } from '../db/connection.js';

async function main(): Promise<void> {
  initKnex();
  await runMigrations();
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
