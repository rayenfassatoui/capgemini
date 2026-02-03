'use server';

import { revalidatePath } from 'next/cache';
import {
  executeSimpleTask,
  executeMultiStepTask,
  executeErrorHandlingTask,
  executeParallelTasks,
} from './workflows';
import { testTaskSchema } from './schemas';
import type { TestTaskInput } from './types';

export async function runSimpleTaskAction(data: TestTaskInput) {
  try {
    const validated = testTaskSchema.parse(data);
    const result = await executeSimpleTask(validated);

    revalidatePath('/dbos-test');

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run task',
    };
  }
}

export async function runMultiStepTaskAction(taskName: string) {
  try {
    const result = await executeMultiStepTask(taskName);

    revalidatePath('/dbos-test');

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run multi-step task',
    };
  }
}

export async function runErrorHandlingTaskAction(data: TestTaskInput) {
  try {
    const validated = testTaskSchema.parse(data);
    const result = await executeErrorHandlingTask(validated);

    revalidatePath('/dbos-test');

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run error handling task',
    };
  }
}

export async function runParallelTasksAction(count: number) {
  try {
    if (count < 1 || count > 10) {
      throw new Error('Task count must be between 1 and 10');
    }

    const result = await executeParallelTasks(count);

    revalidatePath('/dbos-test');

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run parallel tasks',
    };
  }
}
