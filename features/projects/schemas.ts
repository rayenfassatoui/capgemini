import { z } from 'zod';

export const projectStatusSchema = z.enum(['active', 'archived', 'draft']);

export const createProjectSchema = z.object({
  name: z
    .string()
    .min(3, 'Project name must be at least 3 characters')
    .max(100, 'Project name must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  status: projectStatusSchema.default('draft'),
});

export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(3, 'Project name must be at least 3 characters')
    .max(100, 'Project name must be less than 100 characters')
    .optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  status: projectStatusSchema.optional(),
});

export const projectIdSchema = z.string().uuid('Invalid project ID');

export type CreateProjectSchema = z.infer<typeof createProjectSchema>;
export type UpdateProjectSchema = z.infer<typeof updateProjectSchema>;
