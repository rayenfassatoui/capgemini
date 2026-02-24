'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { uploadCvAction } from '../actions';

// ---------- Types ----------

export type UploadItemStatus = 'queued' | 'uploading' | 'success' | 'error';

export interface DuplicateInfo {
  cvId: string;
  filename: string;
  extractedName: string | null;
  extractedEmail: string | null;
  matchReasons: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface UploadItem {
  id: string;
  filename: string;
  size: number;
  status: UploadItemStatus;
  error?: string;
  retryCount: number;
  file: File;
  duplicates?: DuplicateInfo[];
}

interface UploadContextValue {
  /** All items in the queue (active + completed) */
  items: UploadItem[];
  /** Whether there is at least one item currently uploading */
  isProcessing: boolean;
  /** Add files to the background queue and start processing */
  enqueueFiles: (files: FileList | File[]) => void;
  /** Remove a single item from the queue (only queued/error/success) */
  removeItem: (id: string) => void;
  /** Clear all completed (success + error) items */
  clearCompleted: () => void;
  /** Retry all failed items */
  retryFailed: () => void;
  /** Dismiss the widget (hides it until new files are added) */
  dismiss: () => void;
  /** Whether the widget is visible */
  isWidgetVisible: boolean;
}

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUploadQueue() {
  const ctx = useContext(UploadContext);
  if (!ctx) {
    throw new Error('useUploadQueue must be used within <UploadProvider>');
  }
  return ctx;
}

// ---------- Constants ----------

const MAX_RETRIES = 3;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Invalid type. Only PDF or DOCX.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File exceeds 5 MB limit.';
  }
  return null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Exponential back-off: 2s, 4s, 8s */
function backoffMs(attempt: number): number {
  return Math.min(2000 * Math.pow(2, attempt), 8000);
}

// ---------- Provider ----------

export function UploadProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isWidgetVisible, setIsWidgetVisible] = useState(false);
  const processingRef = useRef(false);
  const itemsRef = useRef(items);

  // Keep ref in sync
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ---------- beforeunload guard ----------
  useEffect(() => {
    const hasActive = items.some(
      (i) => i.status === 'queued' || i.status === 'uploading'
    );
    if (!hasActive) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [items]);

  // ---------- Core processing loop ----------
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Find next queued item
      const current = itemsRef.current.find((i) => i.status === 'queued');
      if (!current) break;

      // Mark uploading
      setItems((prev) =>
        prev.map((i) =>
          i.id === current.id ? { ...i, status: 'uploading' as const } : i
        )
      );

      let succeeded = false;
      let lastError = '';

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Read file to base64
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve((reader.result as string).split(',')[1]);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(current.file);
          });

          const result = await uploadCvAction({
            filename: current.file.name,
            contentType: current.file.type,
            size: current.file.size,
            rawBytes: base64,
          });

          // Capture duplicates from the result
          const duplicates = (result as Record<string, unknown>)?.duplicates as DuplicateInfo[] | undefined;
          if (duplicates && duplicates.length > 0) {
            setItems((prev) =>
              prev.map((i) =>
                i.id === current.id
                  ? { ...i, duplicates }
                  : i
              )
            );

            const highConf = duplicates.filter(
              (d) => d.confidence === 'high'
            );
            const dupNames = duplicates
              .slice(0, 3)
              .map((d) => d.extractedName || d.filename)
              .join(', ');

            if (highConf.length > 0) {
              toast.warning(
                `Duplicate detected: "${current.file.name}" matches ${dupNames}`,
                { duration: 8000 }
              );
            } else {
              toast.info(
                `Possible duplicate: "${current.file.name}" is similar to ${dupNames}`,
                { duration: 6000 }
              );
            }
          }

          succeeded = true;
          break;
        } catch (err) {
          lastError =
            err instanceof Error ? err.message : 'Upload failed';

          // Update retry count in state
          setItems((prev) =>
            prev.map((i) =>
              i.id === current.id
                ? { ...i, retryCount: attempt + 1 }
                : i
            )
          );

          if (attempt < MAX_RETRIES) {
            // Wait with back-off before retrying
            await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          }
        }
      }

      if (succeeded) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === current.id
              ? { ...i, status: 'success' as const, error: undefined }
              : i
          )
        );
        // Refresh data so the table picks up the new CV in real-time
        router.refresh();
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === current.id
              ? {
                  ...i,
                  status: 'error' as const,
                  error: `${lastError} (after ${MAX_RETRIES + 1} attempts)`,
                }
              : i
          )
        );
      }
    }

    processingRef.current = false;
    setIsProcessing(false);

    // Summary toast
    const final = itemsRef.current;
    const successes = final.filter((i) => i.status === 'success').length;
    const errors = final.filter((i) => i.status === 'error').length;
    const queued = final.filter((i) => i.status === 'queued').length;

    if (queued === 0 && successes > 0 && errors === 0) {
      toast.success(
        `All ${successes} resume${successes > 1 ? 's' : ''} processed successfully.`
      );
    } else if (queued === 0 && errors > 0 && successes > 0) {
      toast.warning(`${successes} processed, ${errors} failed.`);
    } else if (queued === 0 && errors > 0 && successes === 0) {
      toast.error(`All ${errors} upload${errors > 1 ? 's' : ''} failed.`);
    }
  }, [router]);

  // ---------- Public API ----------

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: UploadItem[] = Array.from(files).map((file) => {
        const validationError = validateFile(file);
        return {
          id: generateId(),
          filename: file.name,
          size: file.size,
          status: validationError ? ('error' as const) : ('queued' as const),
          error: validationError ?? undefined,
          retryCount: 0,
          file,
        };
      });

      setItems((prev) => [...prev, ...newItems]);
      setIsWidgetVisible(true);

      // Kick off processing if there are valid items
      if (newItems.some((i) => i.status === 'queued')) {
        // Use setTimeout so the state update above is committed first
        setTimeout(() => processQueue(), 0);
      }
    },
    [processQueue]
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) =>
      prev.filter((i) => i.status !== 'success' && i.status !== 'error')
    );
  }, []);

  const retryFailed = useCallback(() => {
    setItems((prev) =>
      prev.map((i) =>
        i.status === 'error'
          ? { ...i, status: 'queued' as const, error: undefined, retryCount: 0 }
          : i
      )
    );
    setTimeout(() => processQueue(), 0);
  }, [processQueue]);

  const dismiss = useCallback(() => {
    // Only dismiss if nothing is actively processing
    if (!processingRef.current) {
      setIsWidgetVisible(false);
      setItems([]);
    } else {
      setIsWidgetVisible(false);
    }
  }, []);

  return (
    <UploadContext.Provider
      value={{
        items,
        isProcessing,
        enqueueFiles,
        removeItem,
        clearCompleted,
        retryFailed,
        dismiss,
        isWidgetVisible,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}
