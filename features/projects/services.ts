import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import {
  createProjectSchema,
  updateProjectSchema,
  projectIdSchema,
  type CreateProjectSchema,
  type UpdateProjectSchema,
} from './schemas';
import type { Project, ProjectWithOwner } from './types';

export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createProject(
  data: unknown,
  userId: string
): Promise<Project> {
  const validated = createProjectSchema.parse(data);
  
  const slug = generateSlug(validated.name);
  
  const [project] = await db
    .insert(projects)
    .values({
      ...validated,
      slug,
      ownerId: userId,
    })
    .returning();
  
  return project;
}

export async function getProjectById(id: string): Promise<Project> {
  const validated = projectIdSchema.parse(id);
  
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, validated),
  });
  
  if (!project) {
    throw new NotFoundError('Project');
  }
  
  return project;
}

export async function getProjectByIdWithOwner(id: string): Promise<ProjectWithOwner> {
  const validated = projectIdSchema.parse(id);
  
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, validated),
    with: {
      owner: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
  
  if (!project) {
    throw new NotFoundError('Project');
  }
  
  return project as ProjectWithOwner;
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  const userProjects = await db.query.projects.findMany({
    where: eq(projects.ownerId, userId),
    orderBy: [desc(projects.createdAt)],
  });
  
  return userProjects;
}

export async function updateProject(
  id: string,
  data: unknown,
  userId: string
): Promise<Project> {
  const validatedId = projectIdSchema.parse(id);
  const validatedData = updateProjectSchema.parse(data);
  
  const existingProject = await getProjectById(validatedId);
  
  if (existingProject.ownerId !== userId) {
    throw new UnauthorizedError('You do not have permission to update this project');
  }
  
  const updateData: Partial<Project> = { ...validatedData };
  
  if (validatedData.name) {
    updateData.slug = generateSlug(validatedData.name);
  }
  
  const [updatedProject] = await db
    .update(projects)
    .set(updateData)
    .where(eq(projects.id, validatedId))
    .returning();
  
  return updatedProject;
}

export async function deleteProject(id: string, userId: string): Promise<void> {
  const validatedId = projectIdSchema.parse(id);
  
  const existingProject = await getProjectById(validatedId);
  
  if (existingProject.ownerId !== userId) {
    throw new UnauthorizedError('You do not have permission to delete this project');
  }
  
  await db.delete(projects).where(eq(projects.id, validatedId));
}

export async function archiveProject(id: string, userId: string): Promise<Project> {
  return updateProject(id, { status: 'archived' }, userId);
}

export async function activateProject(id: string, userId: string): Promise<Project> {
  return updateProject(id, { status: 'active' }, userId);
}
