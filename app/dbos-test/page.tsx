import type { Metadata } from 'next';
import {
  SimpleTaskForm,
  MultiStepTaskForm,
  ErrorHandlingTaskForm,
  ParallelTasksForm,
} from '@/features/dbos-test/components/task-forms';

export const metadata: Metadata = {
  title: 'DBOS Background Tasks Test',
  description: 'Test page for DBOS durable workflows and background processing',
};

export default function DBOSTestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="mx-auto max-w-7xl px-6 py-24">
        {/* Header */}
        <div className="mb-16 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
            DBOS Background Tasks
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            Test durable workflows, error handling, and parallel task processing
          </p>
        </div>

        {/* Info Banner */}
        <div className="mb-12 rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900 dark:bg-blue-950">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
            What is DBOS?
          </h3>
          <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
            DBOS provides durable execution for your workflows. Each step is checkpointed,
            so if your application crashes or restarts, workflows automatically resume from
            their last completed step—no data loss, no duplicate work.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-blue-700 dark:text-blue-300">
            <li>✓ Automatic failure recovery</li>
            <li>✓ Exactly-once execution guarantees</li>
            <li>✓ Built-in queues for parallelism</li>
            <li>✓ Step-by-step checkpointing</li>
          </ul>
        </div>

        {/* Task Forms Grid */}
        <div className="grid gap-8 md:grid-cols-2">
          <SimpleTaskForm />
          <MultiStepTaskForm />
          <ErrorHandlingTaskForm />
          <ParallelTasksForm />
        </div>

        {/* Documentation Section */}
        <div className="mt-16 rounded-xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-gray-950">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            How It Works
          </h2>

          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                1. Simple Task
              </h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Executes a single background task with specified duration. Demonstrates
                basic workflow execution with automatic recovery.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                2. Multi-Step Workflow
              </h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Runs a workflow with three distinct steps: Initialize → Process → Finalize.
                Each step is checkpointed independently. If the workflow is interrupted,
                it resumes from the last completed step.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                3. Error Handling & Recovery
              </h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Tests automatic retry logic and fallback mechanisms. When a step fails,
                DBOS automatically retries it. If all retries are exhausted, a fallback
                step executes to handle the failure gracefully.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                4. Parallel Task Processing
              </h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Demonstrates concurrent workflow execution using DBOS queues. Multiple
                tasks run in parallel with controlled concurrency limits. The queue
                automatically manages task distribution and completion tracking.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Note:</strong> This page uses a mock DBOS implementation for
              demonstration purposes. In production, you would install the actual DBOS
              SDK with <code className="rounded bg-gray-200 px-2 py-1 dark:bg-gray-800">
                bun add @dbos-inc/dbos-sdk
              </code> and configure it with a PostgreSQL database.
            </p>
          </div>

          <div className="mt-6">
            <a
              href="https://docs.dbos.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              → Read DBOS Documentation
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
