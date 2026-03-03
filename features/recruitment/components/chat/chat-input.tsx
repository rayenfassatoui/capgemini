'use client';

import { useRef, useCallback } from 'react';
import {
  IconSend2,
  IconPaperclip,
  IconFile,
  IconX,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  input: string;
  isStreaming: boolean;
  attachedFile: File | null;
  onInputChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttachFile: (file: File) => void;
  onRemoveFile: () => void;
}

export function ChatInput({
  input,
  isStreaming,
  attachedFile,
  onInputChange,
  onSend,
  onStop,
  onAttachFile,
  onRemoveFile,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSend(input);
    },
    [input, onSend]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend(input);
      }
    },
    [input, onSend]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return;
      onAttachFile(file);
      e.target.value = '';
    },
    [onAttachFile]
  );

  return (
    <div className="relative border-t border-white/[0.08] p-4 bg-background/20 backdrop-blur-md">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-linear-to-r from-transparent via-primary/30 to-transparent" />
      {isStreaming && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1.5 rounded-full border border-destructive/20 bg-background/80 px-4 py-1.5 text-xs font-medium text-destructive shadow-lg backdrop-blur-md transition-all hover:bg-destructive/10 hover:border-destructive/40 hover:scale-105"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
            </span>
            Stop generating
          </button>
        </div>
      )}

      {attachedFile && (
        <div className="flex items-center gap-3 mb-3 rounded-xl border border-white/10 bg-card/40 backdrop-blur-sm p-3 shadow-sm animate-in fade-in slide-in-from-bottom-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <IconFile className="size-5 text-primary" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium text-foreground truncate">
              {attachedFile.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {Math.round(attachedFile.size / 1024)}KB
            </span>
          </div>
          <button
            type="button"
            onClick={onRemoveFile}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label="Remove attached file"
          >
            <IconX className="size-4" />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFileChange}
      />

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
          disabled={isStreaming}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach a CV file"
        >
          <IconPaperclip className="size-5" />
        </Button>
        <div className="relative flex-1 group">
          <div className="absolute inset-0 -z-10 rounded-xl bg-linear-to-br from-primary/10 via-indigo-500/5 to-purple-500/5 blur-sm transition-opacity opacity-0 group-focus-within:opacity-100" />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              attachedFile
                ? 'Describe what to do with this file...'
                : 'Ask AI to analyze candidates...'
            }
            disabled={isStreaming}
            rows={1}
            className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50 min-h-[44px] scrollbar-hide backdrop-blur-sm transition-colors hover:border-white/15 hover:bg-black/30"
            style={{ maxHeight: '120px' }}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-xl bg-linear-to-br from-primary to-indigo-600 text-white shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-primary/40 disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none"
          disabled={(!input.trim() && !attachedFile) || isStreaming}
          aria-label="Send message"
        >
          <IconSend2 className="size-5" />
        </Button>
      </form>
    </div>
  );
}
