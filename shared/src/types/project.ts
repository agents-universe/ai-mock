export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreateInput {
  slug: string;
  name: string;
  description?: string | null;
}

export type ProjectUpdateInput = Partial<ProjectCreateInput>;
