import type { HttpMethod } from '../constants.js';

export interface MockApi {
  id: string;
  projectId: string;
  name: string;
  method: HttpMethod;
  path: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  branchCount?: number;
}

export interface MockApiCreateInput {
  name: string;
  method: HttpMethod;
  path: string;
  description?: string | null;
  enabled?: boolean;
}

export type MockApiUpdateInput = Partial<MockApiCreateInput>;
