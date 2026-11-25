import type { ApiCreateBody, MockApi } from '@ai-mock/shared';
import { createApi } from '../db/repos/api-repo.js';
import { createBranch } from '../db/repos/branch-repo.js';
import { bus } from '../db/bus.js';
import { badRequest } from '../util/errors.js';
import { isCompilablePath } from '../mock/path-match.js';

// the zod char-blacklist can't cover every path-to-regexp throw (e.g.
// `/api/:`, `/api/[a]`); reject at write time so a bad path never creates
// an API that silently 404s forever
export function assertCompilablePath(path: string): void {
  if (!isCompilablePath(path)) {
    throw badRequest(
      'invalid_path',
      `无法编译的路径（检查 :参数 / * 通配的写法）: ${path}`
    );
  }
}

/** Create an API together with its default always-200 branch, then invalidate cache. */
export async function createApiWithDefaultBranch(
  projectId: string,
  body: ApiCreateBody
): Promise<MockApi> {
  assertCompilablePath(body.path);
  const api = await createApi(projectId, body);
  // every API starts with a default always-200 branch
  await createBranch(api.id, {
    name: '默认响应',
    conditionType: 'always',
    isDefault: true,
    statusCode: 200,
    bodyType: 'static',
    staticBody: '{}',
  });
  bus.emitConfigChanged({ projectId });
  return api;
}
