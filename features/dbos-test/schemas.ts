import { z } from 'zod';

export const testTaskSchema = z.object({
  taskName: z.string().min(1, 'Task name is required'),
  duration: z.number().min(1).max(30),
  shouldFail: z.boolean().default(false),
});
