---
description: DBOS durable workflows and background processing patterns
triggers:
  - "features/**/workflows/**"
  - "features/**/queues/**"
  - keywords: ["dbos", "workflow", "durable", "background", "queue", "retry"]
priority: 8
version: 1.0.0
last_updated: 2026-02-03
---

# DBOS Background Processing Patterns

## Overview

DBOS is a library for building reliable programs with durable execution. It makes applications resilient to any failure by checkpointing workflow state to a database, enabling automatic recovery from interruptions.

## When to Use

- Long-running background jobs
- Multi-step workflows requiring reliability
- Distributed task processing
- Event processing with exactly-once guarantees
- Scheduled recurring tasks
- Complex business processes spanning multiple services

---

## Core Concepts

### 1. Workflows

Workflows are the fundamental unit in DBOS. They orchestrate multiple steps and automatically recover from failures.

```typescript
// features/projects/workflows/project-setup-workflow.ts
import { DBOS } from '@dbos-inc/dbos-sdk';

export async function setupNewProject(projectId: string, userId: string) {
  // Step 1: Initialize project structure
  await DBOS.runStep(
    async () => {
      await initializeProjectStructure(projectId);
      DBOS.logger.info(`Initialized structure for project ${projectId}`);
    },
    { name: 'initialize-structure' }
  );

  // Step 2: Set up permissions
  await DBOS.runStep(
    async () => {
      await setupProjectPermissions(projectId, userId);
      DBOS.logger.info(`Set up permissions for project ${projectId}`);
    },
    { name: 'setup-permissions' }
  );

  // Step 3: Send notification
  await DBOS.runStep(
    async () => {
      await sendProjectCreatedNotification(userId, projectId);
      DBOS.logger.info(`Sent notification for project ${projectId}`);
    },
    { name: 'send-notification' }
  );

  return { projectId, status: 'completed' };
}

// Register as workflow
export const setupProjectWorkflow = DBOS.registerWorkflow(setupNewProject);
```

**Key Features**:
- Each step is checkpointed
- If the workflow crashes, it resumes from the last completed step
- Steps never re-execute on recovery

---

### 2. Steps

Steps are the building blocks of workflows. They represent individual operations that should be atomic and idempotent.

```typescript
// features/projects/workflows/steps.ts

// ✅ GOOD: Idempotent step
async function initializeProjectStructure(projectId: string) {
  const existing = await db.query.projectStructures.findFirst({
    where: (structures, { eq }) => eq(structures.projectId, projectId),
  });

  if (existing) {
    DBOS.logger.info(`Structure already exists for ${projectId}`);
    return existing;
  }

  const [structure] = await db
    .insert(projectStructures)
    .values({
      projectId,
      folders: ['docs', 'src', 'tests'],
      createdAt: new Date(),
    })
    .returning();

  return structure;
}

// ❌ BAD: Non-idempotent step
async function badInitialization(projectId: string) {
  // This will fail on retry if structure already exists
  await db.insert(projectStructures).values({
    projectId,
    folders: ['docs', 'src', 'tests'],
  });
}
```

---

### 3. Queues

DBOS queues enable parallel execution of workflows with controlled concurrency.

```typescript
// features/documents/workflows/document-processing-queue.ts
import { DBOS, WorkflowQueue } from '@dbos-inc/dbos-sdk';

// Create queue with concurrency limit
const documentQueue = new WorkflowQueue('document-processing', {
  concurrency: 5, // Process 5 documents simultaneously
});

async function processDocument(documentId: string) {
  // Step 1: Download document
  const content = await DBOS.runStep(
    async () => {
      const doc = await downloadDocument(documentId);
      DBOS.logger.info(`Downloaded document ${documentId}`);
      return doc;
    },
    { name: 'download-document' }
  );

  // Step 2: Extract text
  const text = await DBOS.runStep(
    async () => {
      const extracted = await extractText(content);
      DBOS.logger.info(`Extracted text from document ${documentId}`);
      return extracted;
    },
    { name: 'extract-text' }
  );

  // Step 3: Index for search
  await DBOS.runStep(
    async () => {
      await indexDocument(documentId, text);
      DBOS.logger.info(`Indexed document ${documentId}`);
    },
    { name: 'index-document' }
  );

  return { documentId, status: 'processed' };
}

export const processDocumentWorkflow = DBOS.registerWorkflow(processDocument);

// Enqueue multiple documents
export async function processBatch(documentIds: string[]) {
  const handles = [];

  for (const docId of documentIds) {
    const handle = await DBOS.startWorkflow(
      processDocumentWorkflow,
      { queueName: documentQueue.name }
    )(docId);
    
    handles.push(handle);
  }

  // Wait for all to complete
  const results = await Promise.all(
    handles.map((h) => h.getResult())
  );

  return results;
}
```

---

### 4. Communication Between Workflows

Workflows can send messages to each other for coordination.

```typescript
// features/orders/workflows/order-workflow.ts
import { DBOS } from '@dbos-inc/dbos-sdk';

async function processPayment(orderId: string) {
  // Wait for inventory check signal
  const inventoryAvailable = await DBOS.recv<boolean>('inventory-checked', 30000); // 30s timeout

  if (!inventoryAvailable) {
    throw new Error('Inventory check timeout');
  }

  if (!inventoryAvailable) {
    DBOS.logger.info(`Insufficient inventory for order ${orderId}`);
    return { status: 'cancelled' };
  }

  // Process payment
  await DBOS.runStep(
    async () => {
      await chargeCustomer(orderId);
      DBOS.logger.info(`Payment processed for order ${orderId}`);
    },
    { name: 'charge-customer' }
  );

  return { status: 'completed' };
}

async function checkInventory(orderId: string, paymentWorkflowId: string) {
  const available = await DBOS.runStep(
    async () => {
      const order = await getOrder(orderId);
      return await checkInventoryAvailability(order.items);
    },
    { name: 'check-inventory' }
  );

  // Send result to payment workflow
  await DBOS.send(paymentWorkflowId, available, 'inventory-checked');

  return { available };
}

export const processPaymentWorkflow = DBOS.registerWorkflow(processPayment);
export const checkInventoryWorkflow = DBOS.registerWorkflow(checkInventory);
```

---

### 5. Scheduled Workflows

Run workflows on a schedule with exactly-once execution guarantees.

```typescript
// features/reports/workflows/scheduled-reports.ts
import { DBOS } from '@dbos-inc/dbos-sdk';

async function generateDailyReport() {
  const date = new Date();

  // Step 1: Gather data
  const data = await DBOS.runStep(
    async () => {
      const projects = await getProjectsCreatedToday();
      const users = await getNewUsersToday();
      return { projects, users, date };
    },
    { name: 'gather-data' }
  );

  // Step 2: Generate report
  const report = await DBOS.runStep(
    async () => {
      return await createReport(data);
    },
    { name: 'create-report' }
  );

  // Step 3: Distribute report
  await DBOS.runStep(
    async () => {
      await emailReport(report);
      await storeReport(report);
      DBOS.logger.info('Daily report generated and distributed');
    },
    { name: 'distribute-report' }
  );

  return { reportId: report.id };
}

export const dailyReportWorkflow = DBOS.registerWorkflow(generateDailyReport);

// Schedule to run daily at 9 AM
DBOS.scheduleWorkflow(dailyReportWorkflow, {
  crontab: '0 9 * * *', // Every day at 9:00 AM
});
```

---

## Integration with Next.js

### 1. Setup DBOS in Next.js

```typescript
// lib/dbos.ts
import { DBOS } from '@dbos-inc/dbos-sdk';

let dbosInitialized = false;

export async function initDBOS() {
  if (dbosInitialized) return;

  DBOS.setConfig({
    name: 'capgemini-project',
    systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL || process.env.DATABASE_URL,
  });

  await DBOS.launch();
  dbosInitialized = true;
}

export async function shutdownDBOS() {
  await DBOS.shutdown();
  dbosInitialized = false;
}
```

### 2. Middleware for DBOS Initialization

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initDBOS } from '@/lib/dbos';

export async function middleware(request: NextRequest) {
  // Initialize DBOS on first request
  await initDBOS();
  
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

### 3. API Route with Workflow

```typescript
// app/api/projects/setup/route.ts
import { NextResponse } from 'next/server';
import { setupProjectWorkflow } from '@/features/projects/workflows/project-setup-workflow';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = await request.json();

  try {
    // Start durable workflow
    const result = await setupProjectWorkflow(projectId, user.id);
    
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: 'Workflow failed' },
      { status: 500 }
    );
  }
}
```

---

## Feature-Driven Architecture Integration

### Service Layer Pattern

```typescript
// features/projects/services.ts
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { setupProjectWorkflow } from './workflows/project-setup-workflow';

export async function createProject(data: CreateProjectInput, userId: string) {
  // 1. Create project record
  const [project] = await db
    .insert(projects)
    .values({
      ...data,
      ownerId: userId,
    })
    .returning();

  // 2. Start background workflow for setup
  await setupProjectWorkflow(project.id, userId);

  return project;
}
```

### Action Layer Pattern

```typescript
// features/projects/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createProject } from './services';
import { getCurrentUser } from '@/lib/auth';

export async function createProjectAction(formData: FormData) {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const project = await createProject({
      name: formData.get('name') as string,
      description: formData.get('description') as string,
    }, user.id);

    revalidatePath('/projects');
    
    return { success: true, project };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create project' 
    };
  }
}
```

---

## Error Handling & Retry Logic

### Automatic Retries

```typescript
// features/integrations/workflows/sync-workflow.ts
import { DBOS } from '@dbos-inc/dbos-sdk';

async function syncWithExternalAPI(projectId: string) {
  // DBOS automatically retries failed steps
  await DBOS.runStep(
    async () => {
      try {
        const response = await fetch('https://external-api.com/sync', {
          method: 'POST',
          body: JSON.stringify({ projectId }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        DBOS.logger.error(`Sync failed for ${projectId}:`, error);
        throw error; // DBOS will retry
      }
    },
    { 
      name: 'sync-external-api',
      maxRetries: 5,
      retryDelayMs: 1000,
    }
  );
}

export const syncWorkflow = DBOS.registerWorkflow(syncWithExternalAPI);
```

### Custom Error Handling

```typescript
async function processWithFallback(itemId: string) {
  try {
    await DBOS.runStep(
      async () => {
        await primaryProcessor(itemId);
      },
      { name: 'primary-processing' }
    );
  } catch (error) {
    DBOS.logger.warn(`Primary processor failed, using fallback`);
    
    // Use fallback method
    await DBOS.runStep(
      async () => {
        await fallbackProcessor(itemId);
      },
      { name: 'fallback-processing' }
    );
  }
}
```

---

## Monitoring & Observability

### Workflow Status Tracking

```typescript
// features/workflows/services.ts
import { DBOS } from '@dbos-inc/dbos-sdk';

export async function getWorkflowStatus(workflowId: string) {
  const status = await DBOS.getWorkflowStatus(workflowId);
  
  return {
    id: workflowId,
    status: status.status, // 'pending', 'running', 'completed', 'failed'
    output: status.output,
    error: status.error,
  };
}

export async function listActiveWorkflows() {
  const workflows = await DBOS.getActiveWorkflows();
  
  return workflows.map((wf) => ({
    id: wf.workflowId,
    name: wf.workflowName,
    startedAt: wf.startedAt,
  }));
}
```

### Logging Best Practices

```typescript
async function processItem(itemId: string) {
  DBOS.logger.info(`Starting processing for item ${itemId}`);

  await DBOS.runStep(
    async () => {
      DBOS.logger.debug(`Step 1: Fetching item ${itemId}`);
      const item = await fetchItem(itemId);
      
      DBOS.logger.info(`Item ${itemId} fetched successfully`, {
        metadata: { size: item.size, type: item.type },
      });
      
      return item;
    },
    { name: 'fetch-item' }
  );

  DBOS.logger.info(`Completed processing for item ${itemId}`);
}
```

---

## Best Practices

### 1. Step Design

✅ **DO**:
- Make steps idempotent
- Keep steps focused and atomic
- Use descriptive step names
- Handle expected errors within steps

❌ **DON'T**:
- Put non-deterministic code in workflows (use steps instead)
- Make steps dependent on external state changes
- Create overly large steps

### 2. Workflow Composition

```typescript
// ✅ GOOD: Compose workflows from reusable steps
async function onboardUser(userId: string) {
  await DBOS.runStep(
    () => createUserProfile(userId),
    { name: 'create-profile' }
  );

  await DBOS.runStep(
    () => sendWelcomeEmail(userId),
    { name: 'send-welcome' }
  );

  await DBOS.runStep(
    () => setupDefaultSettings(userId),
    { name: 'setup-settings' }
  );
}

export const onboardUserWorkflow = DBOS.registerWorkflow(onboardUser);
```

### 3. Queue Configuration

```typescript
// ✅ GOOD: Configure queues based on resource requirements
const heavyQueue = new WorkflowQueue('heavy-processing', {
  concurrency: 2, // Limit concurrent heavy jobs
});

const lightQueue = new WorkflowQueue('light-processing', {
  concurrency: 50, // Allow many concurrent light jobs
});
```

---

## Checklist

Before deploying DBOS workflows:

- [ ] DBOS system database configured (`DBOS_SYSTEM_DATABASE_URL`)
- [ ] All workflow steps are idempotent
- [ ] Error handling implemented
- [ ] Logging added for observability
- [ ] Queue concurrency tuned appropriately
- [ ] Retry logic configured for external calls
- [ ] Workflow status monitoring in place
- [ ] Scheduled workflows tested
- [ ] Integration with Feature-Driven Architecture verified

---

## References

- [DBOS Documentation](https://docs.dbos.dev/)
- [DBOS TypeScript Guide](https://docs.dbos.dev/typescript/programming-guide)
- [Workflow Tutorial](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial)
- [Queue Tutorial](https://docs.dbos.dev/typescript/tutorials/queue-tutorial)

---

**Last Updated**: 2026-02-03  
**Version**: 1.0.0
