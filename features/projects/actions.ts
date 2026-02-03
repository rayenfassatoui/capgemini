'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import {
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  activateProject,
} from './services';
import type { CreateProjectSchema, UpdateProjectSchema } from './schemas';

type ActionResult<T = void> = 
  | { success: true; data: T }
  | { success: false; error: string };

export async function createProjectAction(
  data: CreateProjectSchema
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    
    const project = await createProject(data, user.id);
    
    revalidatePath('/projects');
    redirect(`/projects/${project.id}`);
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to create project' };
  }
}

export async function updateProjectAction(
  id: string,
  data: UpdateProjectSchema
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    
    await updateProject(id, data, user.id);
    
    revalidatePath('/projects');
    revalidatePath(`/projects/${id}`);
    
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to update project' };
  }
}

export async function deleteProjectAction(id: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    
    await deleteProject(id, user.id);
    
    revalidatePath('/projects');
    redirect('/projects');
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to delete project' };
  }
}

export async function archiveProjectAction(id: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    
    await archiveProject(id, user.id);
    
    revalidatePath('/projects');
    revalidatePath(`/projects/${id}`);
    
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to archive project' };
  }
}

export async function activateProjectAction(id: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    
    await activateProject(id, user.id);
    
    revalidatePath('/projects');
    revalidatePath(`/projects/${id}`);
    
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to activate project' };
  }
}
