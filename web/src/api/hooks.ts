import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Project,
  Environment,
  MockApi,
  ResponseBranch,
  DatabaseConnectionSettings,
} from '@ai-mock/shared';
import { api } from './client.js';

export type ProjectWithCounts = Project & { apiCount: number; envCount: number };
export type ApiWithBranches = MockApi & { branches: ResponseBranch[] };

// ---- projects ----
export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api.get<ProjectWithCounts[]>('/api/projects') });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.get<ProjectWithCounts>(`/api/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { slug: string; name: string; description?: string }) =>
      api.post<Project>('/api/projects', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<{ slug: string; name: string; description: string }>) =>
      api.patch<Project>(`/api/projects/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// ---- environments ----
export function useEnvironments(projectId: string) {
  return useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => api.get<Environment[]>(`/api/projects/${projectId}/environments`),
    enabled: !!projectId,
  });
}

export function useCreateEnvironment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { slug: string; name: string; variables?: Record<string, string> }) =>
      api.post<Environment>(`/api/projects/${projectId}/environments`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environments', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateEnvironment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<{ slug: string; name: string; variables: Record<string, string> }>) =>
      api.patch<Environment>(`/api/environments/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['environments', projectId] }),
  });
}

export function useDeleteEnvironment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/environments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environments', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

// ---- apis ----
export function useApis(projectId: string) {
  return useQuery({
    queryKey: ['apis', projectId],
    queryFn: () => api.get<MockApi[]>(`/api/projects/${projectId}/apis`),
    enabled: !!projectId,
  });
}

export function useApiDetail(apiId: string) {
  return useQuery({
    queryKey: ['api', apiId],
    queryFn: () => api.get<ApiWithBranches>(`/api/apis/${apiId}`),
    enabled: !!apiId,
  });
}

export function useCreateApi(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; method: string; path: string }) =>
      api.post<MockApi>(`/api/projects/${projectId}/apis`, body),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['apis', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      void created;
    },
  });
}

export function useUpdateApi(apiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<{ name: string; method: string; path: string; enabled: boolean; description: string }>) =>
      api.patch<MockApi>(`/api/apis/${apiId}`, body),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['apis', updated.projectId] });
      qc.invalidateQueries({ queryKey: ['api', apiId] });
    },
  });
}

export function useDeleteApi(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/apis/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apis', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useReorderApis(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post(`/api/apis/${ids[0]}/reorder`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apis', projectId] }),
  });
}

// ---- branches ----
export function useCreateBranch(apiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ResponseBranch>) =>
      api.post<ResponseBranch>(`/api/apis/${apiId}/branches`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api', apiId] }),
  });
}

export function useUpdateBranch(apiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<ResponseBranch>) =>
      api.patch<ResponseBranch>(`/api/branches/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api', apiId] }),
  });
}

export function useDeleteBranch(apiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/branches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api', apiId] }),
  });
}

export function useReorderBranches(apiId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/api/branches/reorder', { apiId, ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api', apiId] }),
  });
}

// ---- preview ----
export interface PreviewResult {
  matched: boolean;
  reason: string;
  apiId: string | null;
  branch: { id: string; name: string; conditionType: string; isDefault: boolean } | null;
  status: number;
  headers: Record<string, string>;
  body: string;
  warnings: string[];
  delayMs: number;
  durationMs: number;
  errorMessage: string | null;
  environments: { id: string; slug: string; name: string }[];
  selectedEnv: string;
}

export function usePreviewMatch() {
  return useMutation({
    mutationFn: (body: {
      apiId: string;
      envId?: string;
      request: {
        method: string;
        path: string;
        query?: Record<string, unknown>;
        headers?: Record<string, string>;
        body?: unknown;
      };
    }) => api.post<PreviewResult>('/api/preview/match', body),
  });
}

// ---- settings ----
export function useDatabaseSettings() {
  return useQuery({
    queryKey: ['settings', 'database'],
    queryFn: () =>
      api.get<{ settings: DatabaseConnectionSettings; source: 'env' | 'file' }>(
        '/api/settings/database'
      ),
  });
}

export function useTestDatabaseConnection() {
  return useMutation({
    mutationFn: (settings: DatabaseConnectionSettings) =>
      api.post<{ ok: boolean; message: string; latencyMs: number }>(
        '/api/settings/database/test',
        settings
      ),
  });
}

export function useSaveDatabaseConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: DatabaseConnectionSettings) =>
      api.put<{ ok: boolean }>('/api/settings/database', settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

// ---- logs ----
export interface MockLogEntry {
  id: string;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
  matched: boolean;
  reason: string;
  createdAt: string;
  apiId: string | null;
  branchId: string | null;
}

export function useLogs(projectId: string) {
  return useQuery({
    queryKey: ['logs', projectId],
    queryFn: () => api.get<MockLogEntry[]>(`/api/projects/${projectId}/logs`),
    enabled: !!projectId,
    refetchInterval: 5000,
  });
}
