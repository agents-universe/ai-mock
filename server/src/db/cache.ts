import type { MockApi, Environment, ResponseBranch, Project } from '@ai-mock/shared';
import { CACHE_TTL_MS } from '@ai-mock/shared';
import { bus } from './bus.js';
import { listApisForMock } from './repos/api-repo.js';
import { listBranchesForEvaluation } from './repos/branch-repo.js';
import { getProjectBySlugOrId } from './repos/project-repo.js';
import { getEnvironmentBySlugOrId } from './repos/environment-repo.js';
import { compileApiPaths, matchApi, type CompiledMatcher } from '../mock/path-match.js';

export interface ProjectConfig {
  project: Project;
  environments: Environment[];
  matchers: CompiledMatcher[];
  branchesByApi: Map<string, ResponseBranch[]>;
  loadedAt: number;
}

const cache = new Map<string, ProjectConfig>();

// generation counter: bumped on every invalidation so an in-flight load that
// started before a CRUD write can't resurrect stale data into the cache
let generation = 0;

async function loadProject(key: string): Promise<ProjectConfig | null> {
  const project = await getProjectBySlugOrId(key);
  if (!project) return null;
  const apis = await listApisForMock(project.id);
  const matchers = compileApiPaths(apis);
  const branchesByApi = new Map<string, ResponseBranch[]>();
  for (const api of apis) {
    branchesByApi.set(api.id, await listBranchesForEvaluation(api.id));
  }
  const { listEnvironments } = await import('./repos/environment-repo.js');
  const environments = await listEnvironments(project.id);
  return {
    project,
    environments,
    matchers,
    branchesByApi,
    loadedAt: Date.now(),
  };
}

export async function getProjectConfig(key: string): Promise<ProjectConfig | null> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;

  let gen = generation;
  let loaded = await loadProject(key);
  if (loaded && gen !== generation) {
    // an invalidation raced this load — reload once to pick up the write
    gen = generation;
    loaded = await loadProject(key);
    if (loaded && gen !== generation) {
      // writes keep landing; return fresh-ish data but never cache it
      return loaded;
    }
  }
  if (loaded) {
    cache.set(key, loaded);
    // also cache under id and slug for lookups from either side
    cache.set(loaded.project.id, loaded);
    cache.set(loaded.project.slug, loaded);
  }
  return loaded;
}

export function invalidateProject(projectId: string): void {
  generation++;
  for (const [key, value] of cache) {
    if (value.project.id === projectId) cache.delete(key);
  }
}

export function invalidateAll(): void {
  generation++;
  cache.clear();
}

bus.onConfigChanged((e) => invalidateProject(e.projectId));

export function matchApiFromConfig(
  config: ProjectConfig,
  method: string,
  path: string
): { api: MockApi; params: Record<string, string> } | null {
  return matchApi(config.matchers, method, path);
}

export function getEnvironmentFromConfig(
  config: ProjectConfig,
  key: string
): Environment | null {
  return config.environments.find((e) => e.slug === key || e.id === key) ?? null;
}
