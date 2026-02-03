import { z } from 'zod';

export interface WorkflowStatus {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

export interface WorkflowHandle {
  workflowId: string;
  getResult: () => Promise<any>;
  getStatus: () => Promise<WorkflowStatus>;
}

export const testTaskSchema = z.object({
  taskName: z.string().min(1, 'Task name is required'),
  duration: z.number().min(1).max(30),
  shouldFail: z.boolean().default(false),
});

export type TestTaskInput = z.infer<typeof testTaskSchema>;
