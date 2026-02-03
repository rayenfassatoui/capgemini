'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectWithOwner } from './types';
import type { UpdateProjectSchema } from './schemas';
import { updateProjectAction, deleteProjectAction } from './actions';

const QUERY_KEYS = {
  all: ['projects'] as const,
  lists: () => [...QUERY_KEYS.all, 'list'] as const,
  list: (filters: string) => [...QUERY_KEYS.lists(), { filters }] as const,
  details: () => [...QUERY_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...QUERY_KEYS.details(), id] as const,
};

async function fetchProject(id: string): Promise<ProjectWithOwner> {
  const response = await fetch(`/api/projects/${id}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch project');
  }
  
  return response.json();
}

async function fetchUserProjects(): Promise<Project[]> {
  const response = await fetch('/api/projects');
  
  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }
  
  return response.json();
}

export function useProject(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.detail(id),
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: QUERY_KEYS.lists(),
    queryFn: fetchUserProjects,
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: UpdateProjectSchema) => updateProjectAction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.detail(id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => deleteProjectAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists() });
    },
  });
}
