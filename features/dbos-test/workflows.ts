import { DBOS, WorkflowQueue } from './mock-dbos';
import type { TestTaskInput } from './types';

// Create a queue for background tasks
const taskQueue = new WorkflowQueue('test-task-queue', {
  concurrency: 3,
});

// Simple workflow: Single task
async function simpleTaskWorkflow(taskName: string, duration: number) {
  DBOS.logger.info(`Starting simple task: ${taskName}`);

  await DBOS.runStep(
    async () => {
      DBOS.logger.info(`Executing ${taskName}...`);
      await DBOS.sleep(duration * 1000);
      DBOS.logger.info(`${taskName} completed!`);
    },
    { name: 'execute-task' }
  );

  return {
    taskName,
    completedAt: new Date().toISOString(),
    status: 'success',
  };
}

// Multi-step workflow
async function multiStepWorkflow(taskName: string) {
  DBOS.logger.info(`Starting multi-step workflow: ${taskName}`);

  // Step 1: Initialize
  const initResult = await DBOS.runStep(
    async () => {
      DBOS.logger.info(`Step 1: Initializing ${taskName}`);
      await DBOS.sleep(2000);
      return { initialized: true, timestamp: Date.now() };
    },
    { name: 'initialize' }
  );

  // Step 2: Process
  const processResult = await DBOS.runStep(
    async () => {
      DBOS.logger.info(`Step 2: Processing ${taskName}`);
      await DBOS.sleep(3000);
      return { processed: true, dataSize: 1024 };
    },
    { name: 'process' }
  );

  // Step 3: Finalize
  await DBOS.runStep(
    async () => {
      DBOS.logger.info(`Step 3: Finalizing ${taskName}`);
      await DBOS.sleep(1000);
    },
    { name: 'finalize' }
  );

  return {
    taskName,
    steps: ['initialize', 'process', 'finalize'],
    initResult,
    processResult,
    completedAt: new Date().toISOString(),
  };
}

// Workflow with error handling
async function errorHandlingWorkflow(taskName: string, shouldFail: boolean) {
  DBOS.logger.info(`Starting error handling workflow: ${taskName}`);

  try {
    await DBOS.runStep(
      async () => {
        DBOS.logger.info(`Attempting risky operation for ${taskName}`);
        await DBOS.sleep(2000);

        if (shouldFail) {
          throw new Error('Simulated failure!');
        }

        DBOS.logger.info(`Risky operation succeeded`);
      },
      { name: 'risky-operation', maxRetries: 3, retryDelayMs: 1000 }
    );

    return {
      taskName,
      status: 'success',
      message: 'Task completed without errors',
    };
  } catch (error) {
    DBOS.logger.error(`Task ${taskName} failed after retries`);

    // Fallback step
    await DBOS.runStep(
      async () => {
        DBOS.logger.info(`Executing fallback for ${taskName}`);
        await DBOS.sleep(1000);
      },
      { name: 'fallback' }
    );

    return {
      taskName,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      fallbackExecuted: true,
    };
  }
}

// Parallel task processing
async function parallelTasksWorkflow(taskCount: number) {
  DBOS.logger.info(`Starting parallel tasks workflow: ${taskCount} tasks`);

  const taskWorkflow = DBOS.registerWorkflow(simpleTaskWorkflow);
  const startWorkflow = await DBOS.startWorkflow(taskWorkflow, {
    queueName: taskQueue.name,
  });

  const handles = [];

  // Enqueue all tasks
  for (let i = 0; i < taskCount; i++) {
    const handle = startWorkflow(`Task ${i + 1}`, 3);
    handles.push(handle);
  }

  DBOS.logger.info(`Enqueued ${taskCount} tasks`);

  // Wait for all to complete
  const results = await Promise.all(
    handles.map(async (handle) => {
      try {
        return await handle.getResult();
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    })
  );

  return {
    totalTasks: taskCount,
    completedTasks: results.filter((r) => !('error' in r)).length,
    failedTasks: results.filter((r) => 'error' in r).length,
    results,
  };
}

// Register workflows
export const simpleTask = DBOS.registerWorkflow(simpleTaskWorkflow);
export const multiStepTask = DBOS.registerWorkflow(multiStepWorkflow);
export const errorHandlingTask = DBOS.registerWorkflow(errorHandlingWorkflow);
export const parallelTasks = DBOS.registerWorkflow(parallelTasksWorkflow);

// Export workflow executor functions
export async function executeSimpleTask(input: TestTaskInput) {
  return await simpleTask(input.taskName, input.duration);
}

export async function executeMultiStepTask(taskName: string) {
  return await multiStepTask(taskName);
}

export async function executeErrorHandlingTask(input: TestTaskInput) {
  return await errorHandlingTask(input.taskName, input.shouldFail);
}

export async function executeParallelTasks(count: number) {
  return await parallelTasks(count);
}
