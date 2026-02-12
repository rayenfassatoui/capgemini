'use client';

import { useState } from 'react';
import {
  IconCheck,
  IconAlertTriangle,
  IconLoader2,
  IconX,
  IconChevronUp,
  IconChevronDown,
  IconFileText,
  IconRefresh,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { useUploadQueue, type UploadItemStatus } from './upload-provider';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function StatusIcon({ status }: { status: UploadItemStatus }) {
  switch (status) {
    case 'queued':
      return <IconFileText className="h-3.5 w-3.5 text-muted-foreground" />;
    case 'uploading':
      return <IconLoader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    case 'success':
      return <IconCheck className="h-3.5 w-3.5 text-emerald-600" />;
    case 'error':
      return <IconAlertTriangle className="h-3.5 w-3.5 text-destructive" />;
  }
}

export function UploadProgressWidget() {
  const {
    items,
    isProcessing,
    removeItem,
    clearCompleted,
    retryFailed,
    dismiss,
    isWidgetVisible,
  } = useUploadQueue();

  const [expanded, setExpanded] = useState(true);

  if (!isWidgetVisible || items.length === 0) return null;

  const total = items.length;
  const completed = items.filter(
    (i) => i.status === 'success' || i.status === 'error'
  ).length;
  const successes = items.filter((i) => i.status === 'success').length;
  const errors = items.filter((i) => i.status === 'error').length;
  const uploading = items.filter((i) => i.status === 'uploading').length;
  const queued = items.filter((i) => i.status === 'queued').length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = queued === 0 && uploading === 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950">
      {/* Header bar */}
      <button
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-900"
        onClick={() => setExpanded((p) => !p)}
      >
        {isProcessing ? (
          <IconLoader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        ) : allDone && errors === 0 ? (
          <IconCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : allDone && errors > 0 ? (
          <IconAlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        ) : (
          <IconFileText className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <span className="flex-1 text-xs font-medium text-gray-900 dark:text-white truncate">
          {isProcessing
            ? `Processing resumes (${completed}/${total})`
            : allDone && errors === 0
              ? `${successes} resume${successes !== 1 ? 's' : ''} processed`
              : allDone && errors > 0
                ? `${successes} done, ${errors} failed`
                : 'Upload queue'}
        </span>

        {/* Progress % */}
        {isProcessing && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {progressPercent}%
          </span>
        )}

        {expanded ? (
          <IconChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <IconChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Mini progress bar */}
      {isProcessing && (
        <div className="h-0.5 w-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Expanded file list */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          <div className="max-h-52 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-1.5 text-xs"
              >
                <StatusIcon status={item.status} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-gray-900 dark:text-gray-100">
                    {item.filename}
                  </span>
                  {item.error && (
                    <span className="truncate text-[10px] text-destructive">
                      {item.error}
                    </span>
                  )}
                  {item.status === 'uploading' && (
                    <span className="text-[10px] text-muted-foreground">
                      Extracting with AI{item.retryCount > 0 ? ` (retry ${item.retryCount})` : ''}...
                    </span>
                  )}
                  {item.status === 'queued' && (
                    <span className="text-[10px] text-muted-foreground">Waiting...</span>
                  )}
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {formatFileSize(item.size)}
                </span>
                {(item.status === 'success' || item.status === 'error') &&
                  !isProcessing && (
                    <button
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.filename}`}
                    >
                      <IconX className="h-3 w-3" />
                    </button>
                  )}
              </div>
            ))}
          </div>

          {/* Footer actions */}
          {allDone && (
            <div className="flex items-center justify-end gap-1 border-t border-gray-100 px-2 py-1.5 dark:border-gray-800">
              {errors > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={retryFailed}
                >
                  <IconRefresh className="h-3 w-3" />
                  Retry failed
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={() => {
                  clearCompleted();
                  dismiss();
                }}
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
