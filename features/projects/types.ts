export interface Project {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  status: ProjectStatus;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectStatus = 'active' | 'archived' | 'draft';

export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
}

export interface ProjectWithOwner extends Project {
  owner: {
    id: string;
    name: string;
    email: string;
  };
}
