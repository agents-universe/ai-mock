import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { previewRequestSchema, logQuerySchema, type LogQueryInput } from '@ai-mock/shared';
import { listLogs } from '../../db/repos/log-repo.js';
import { toLogQuery } from '../../routes/logs.js';
import { runPreview } from '../../services/preview-service.js';
import { toolHandler } from './helpers.js';

export function registerTestingTools(server: McpServer): void {
  server.registerTool(
    'simulate_request',
    {
      description:
        'Dry-run the mock match pipeline: which branch would a request hit, with what status/body. ' +
        'Does not write a log entry. Use it to verify conditions before hitting /mock for real.',
      inputSchema: previewRequestSchema.shape,
    },
    toolHandler(async (args) => runPreview(previewRequestSchema.parse(args)))
  );

  server.registerTool(
    'get_logs',
    {
      description:
        'Query mock request logs of a project (newest first) to assert what happened: ' +
        'filter by method/path/matched/status/branch/api/environment and time range (from/to, ISO). ' +
        'Use matched=true + branchId to assert a request hit a specific branch.',
      inputSchema: {
        projectId: z.string().min(1).describe('Project id'),
        ...logQuerySchema.shape,
      },
    },
    toolHandler(async (args) => {
      const { projectId, ...filters } = args as LogQueryInput & { projectId: string };
      return listLogs(projectId, toLogQuery(filters));
    })
  );
}
