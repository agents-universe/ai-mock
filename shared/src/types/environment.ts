export interface Environment {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  variables: Record<string, string>;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentCreateInput {
  slug: string;
  name: string;
  variables?: Record<string, string>;
  sortOrder?: number;
}

export type EnvironmentUpdateInput = Partial<EnvironmentCreateInput>;
