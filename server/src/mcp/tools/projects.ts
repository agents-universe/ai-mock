import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { projectCreateSchema, projectUpdateSchema } from '@ai-mock/shared';
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  countApisByProject,
  countEnvsByProject,
} from '../../db/repos/project-repo.js';
import { bus } from '../../db/bus.js';
import { notFound } from '../../util/errors.js';
import { toolHandler } from './helpers.js';

const idArg = { id: z.string().min(1).describe('Project id') };

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    'list_projects',
    {
      description: 'List all mock projects with api/env counts.',
    },
    toolHandler(async () => {
      const projects = await listProjects();
      return Promise.all(
        projects.map(async (p) => ({
          ...p,
          apiCount: await countApisByProject(p.id),
          envCount: await countEnvsByProject(p.id),
        }))
      );
    })
  );

  server.registerTool(
    'create_project',
    {
      description:
        'Create a mock project. slug is unique and appears in mock URLs as /mock/{slug}/{env}/…',
      inputSchema: projectCreateSchema.shape,
    },
    toolHandler(async (args) => createProject(projectCreateSchema.parse(args)))
  );

  server.registerTool(
    'update_project',
    {
      description: 'Update project fields (partial). Invalidates the mock config cache.',
      inputSchema: { ...idArg, ...projectUpdateSchema.shape },
    },
    toolHandler(async ({ id, ...patch }) => {
      const valid = projectUpdateSchema.parse(patch);
      const project = await updateProject(id, valid);
      bus.emitConfigChanged({ projectId: project.id });
      return project;
    })
  );

  server.registerTool(
    'delete_project',
    {
      description:
        'Delete a project (cascades to environments, APIs, branches, logs).',
      inputSchema: idArg,
    },
    toolHandler(async ({ id }) => {
      await deleteProject(id);
      bus.emitConfigChanged({ projectId: id });
      return { deleted: true, id };
    })
  );

  server.registerTool(
    'get_project',
    {
      description: 'Get one project by id with api/env counts.',
      inputSchema: idArg,
    },
    toolHandler(async ({ id }) => {
      const project = await getProjectById(id);
      if (!project) throw notFound('project_not_found', '项目不存在');
      return {
        ...project,
        apiCount: await countApisByProject(project.id),
        envCount: await countEnvsByProject(project.id),
      };
    })
  );
}
