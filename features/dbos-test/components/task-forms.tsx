'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconLoader, IconCheck, IconX, IconClock } from '@tabler/icons-react';
import {
  runSimpleTaskAction,
  runMultiStepTaskAction,
  runErrorHandlingTaskAction,
  runParallelTasksAction,
} from '../actions';

export function SimpleTaskForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const response = await runSimpleTaskAction({
        taskName: formData.get('taskName') as string,
        duration: Number(formData.get('duration')),
        shouldFail: false,
      });

      if (response.success) {
        setResult(response.result);
      } else {
        setError(response.error || 'Unknown error');
      }
    });
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold">Simple Task</h2>
      <p className="mt-2 text-gray-600">Run a single-step background task</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="taskName">Task Name</Label>
          <Input
            id="taskName"
            name="taskName"
            placeholder="My Background Task"
            required
            disabled={isPending}
          />
        </div>

        <div>
          <Label htmlFor="duration">Duration (seconds)</Label>
          <Input
            id="duration"
            name="duration"
            type="number"
            min="1"
            max="30"
            defaultValue="5"
            required
            disabled={isPending}
          />
        </div>

        <Button type="submit" disabled={isPending} className="w-full rounded-full">
          {isPending ? (
            <>
              <IconLoader className="mr-2 h-4 w-4 animate-spin" />
              Running Task...
            </>
          ) : (
            'Run Simple Task'
          )}
        </Button>
      </form>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-600">
          <IconX className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg bg-green-50 p-4">
          <div className="flex items-center gap-2 text-green-600">
            <IconCheck className="h-5 w-5" />
            <span className="font-semibold">Task Completed!</span>
          </div>
          <pre className="mt-2 overflow-auto text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}

export function MultiStepTaskForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const response = await runMultiStepTaskAction(
        formData.get('taskName') as string
      );

      if (response.success) {
        setResult(response.result);
      } else {
        setError(response.error || 'Unknown error');
      }
    });
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold">Multi-Step Workflow</h2>
      <p className="mt-2 text-gray-600">
        Run a workflow with multiple checkpointed steps
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="multiTaskName">Task Name</Label>
          <Input
            id="multiTaskName"
            name="taskName"
            placeholder="Multi-Step Workflow"
            required
            disabled={isPending}
          />
        </div>

        <Button type="submit" disabled={isPending} className="w-full rounded-full">
          {isPending ? (
            <>
              <IconLoader className="mr-2 h-4 w-4 animate-spin" />
              Processing Steps...
            </>
          ) : (
            'Run Multi-Step Workflow'
          )}
        </Button>
      </form>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-600">
          <IconX className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg bg-green-50 p-4">
          <div className="flex items-center gap-2 text-green-600">
            <IconCheck className="h-5 w-5" />
            <span className="font-semibold">Workflow Completed!</span>
          </div>
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <IconClock className="h-4 w-4" />
              <span>Steps executed: {result.steps?.join(' → ')}</span>
            </div>
            <pre className="overflow-auto text-sm">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
}

export function ErrorHandlingTaskForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (shouldFail: boolean) => {
    setError(null);
    setResult(null);

    startTransition(async () => {
      const response = await runErrorHandlingTaskAction({
        taskName: 'Error Handling Test',
        duration: 3,
        shouldFail,
      });

      if (response.success) {
        setResult(response.result);
      } else {
        setError(response.error || 'Unknown error');
      }
    });
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold">Error Handling & Recovery</h2>
      <p className="mt-2 text-gray-600">
        Test automatic retries and fallback mechanisms
      </p>

      <div className="mt-6 flex gap-4">
        <Button
          onClick={() => handleSubmit(false)}
          disabled={isPending}
          className="flex-1 rounded-full"
        >
          {isPending ? (
            <IconLoader className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <IconCheck className="mr-2 h-4 w-4" />
          )}
          Run Successfully
        </Button>

        <Button
          onClick={() => handleSubmit(true)}
          disabled={isPending}
          variant="outline"
          className="flex-1 rounded-full"
        >
          {isPending ? (
            <IconLoader className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <IconX className="mr-2 h-4 w-4" />
          )}
          Trigger Failure
        </Button>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-600">
          <IconX className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div
          className={`mt-4 rounded-lg p-4 ${
            result.status === 'success'
              ? 'bg-green-50 text-green-600'
              : 'bg-yellow-50 text-yellow-600'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {result.status === 'success' ? (
              <IconCheck className="h-5 w-5" />
            ) : (
              <IconX className="h-5 w-5" />
            )}
            <span>{result.message}</span>
          </div>
          {result.fallbackExecuted && (
            <p className="mt-2 text-sm">✓ Fallback mechanism executed successfully</p>
          )}
          <pre className="mt-2 overflow-auto text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}

export function ParallelTasksForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const response = await runParallelTasksAction(
        Number(formData.get('taskCount'))
      );

      if (response.success) {
        setResult(response.result);
      } else {
        setError(response.error || 'Unknown error');
      }
    });
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold">Parallel Task Processing</h2>
      <p className="mt-2 text-gray-600">
        Run multiple tasks concurrently with queue management
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="taskCount">Number of Tasks (1-10)</Label>
          <Input
            id="taskCount"
            name="taskCount"
            type="number"
            min="1"
            max="10"
            defaultValue="5"
            required
            disabled={isPending}
          />
        </div>

        <Button type="submit" disabled={isPending} className="w-full rounded-full">
          {isPending ? (
            <>
              <IconLoader className="mr-2 h-4 w-4 animate-spin" />
              Processing Tasks...
            </>
          ) : (
            'Run Parallel Tasks'
          )}
        </Button>
      </form>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-600">
          <IconX className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg bg-green-50 p-4">
          <div className="flex items-center gap-2 text-green-600">
            <IconCheck className="h-5 w-5" />
            <span className="font-semibold">Parallel Tasks Completed!</span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total Tasks:</span>
              <span className="font-semibold">{result.totalTasks}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Completed:</span>
              <span className="font-semibold">{result.completedTasks}</span>
            </div>
            {result.failedTasks > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Failed:</span>
                <span className="font-semibold">{result.failedTasks}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
