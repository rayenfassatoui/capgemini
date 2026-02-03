// Mock DBOS implementation for testing (until DBOS is fully integrated)
// This simulates DBOS behavior for demonstration purposes

type StepConfig = {
  name: string;
  maxRetries?: number;
  retryDelayMs?: number;
};

type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

interface MockWorkflowHandle {
  workflowId: string;
  getResult: () => Promise<any>;
  getStatus: () => Promise<{ status: WorkflowStatus; output?: any; error?: string }>;
}

class MockDBOS {
  private workflows: Map<string, any> = new Map();
  private workflowStatuses: Map<string, { status: WorkflowStatus; output?: any; error?: string }> = new Map();

  logger = {
    info: (message: string, meta?: any) => console.log(`[INFO] ${message}`, meta || ''),
    error: (message: string, meta?: any) => console.error(`[ERROR] ${message}`, meta || ''),
    warn: (message: string, meta?: any) => console.warn(`[WARN] ${message}`, meta || ''),
    debug: (message: string, meta?: any) => console.debug(`[DEBUG] ${message}`, meta || ''),
  };

  async runStep<T>(fn: () => Promise<T>, config: StepConfig): Promise<T> {
    this.logger.info(`Executing step: ${config.name}`);
    
    try {
      const result = await fn();
      this.logger.info(`Step completed: ${config.name}`);
      return result;
    } catch (error) {
      this.logger.error(`Step failed: ${config.name}`, error);
      throw error;
    }
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  registerWorkflow<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return fn;
  }

  async startWorkflow<T>(
    workflow: (...args: any[]) => Promise<T>,
    options?: { queueName?: string }
  ): Promise<(...args: any[]) => MockWorkflowHandle> {
    return (...args: any[]) => {
      const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      this.workflowStatuses.set(workflowId, { status: 'pending' });

      // Execute workflow asynchronously
      (async () => {
        try {
          this.workflowStatuses.set(workflowId, { status: 'running' });
          const result = await workflow(...args);
          this.workflowStatuses.set(workflowId, { status: 'completed', output: result });
        } catch (error) {
          this.workflowStatuses.set(workflowId, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })();

      return {
        workflowId,
        getResult: async () => {
          // Wait for completion
          while (true) {
            const status = this.workflowStatuses.get(workflowId);
            if (status?.status === 'completed') return status.output;
            if (status?.status === 'failed') throw new Error(status.error);
            await this.sleep(100);
          }
        },
        getStatus: async () => {
          return this.workflowStatuses.get(workflowId) || { status: 'pending' };
        },
      };
    };
  }

  async getWorkflowStatus(workflowId: string) {
    return this.workflowStatuses.get(workflowId) || { status: 'pending' as WorkflowStatus };
  }

  setConfig(config: any) {
    this.logger.info('DBOS Config set', config);
  }

  async launch() {
    this.logger.info('DBOS Mock launched');
  }

  async shutdown() {
    this.logger.info('DBOS Mock shutdown');
  }
}

// Export mock DBOS instance
export const DBOS = new MockDBOS();

// Mock WorkflowQueue
export class WorkflowQueue {
  name: string;
  concurrency: number;

  constructor(name: string, options?: { concurrency?: number }) {
    this.name = name;
    this.concurrency = options?.concurrency || 10;
    console.log(`Created queue: ${name} with concurrency: ${this.concurrency}`);
  }
}
