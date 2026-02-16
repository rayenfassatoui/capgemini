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
    <div className="border-t border-border p-3">
      {isStreaming && (
        <div className="flex justify-center mb-2">
          <button
            type="button"
            onClick={onStop}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            Stop generating
          </button>
        </div>
      )}

      {attachedFile && (
        <div className="flex items-center gap-2 mb-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
          <IconFile className="size-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-foreground truncate flex-1">
            {attachedFile.name}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {Math.round(attachedFile.size / 1024)}KB
          </span>
          <button
            type="button"
            onClick={onRemoveFile}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Remove attached file"
          >
            <IconX className="size-3" />
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
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          disabled={isStreaming}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach a CV file"
        >
          <IconPaperclip className="size-4" />
        </Button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            attachedFile
              ? 'Describe what to do with this file...'
              : 'Ask a question or request an action...'
          }
          disabled={isStreaming}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          style={{ maxHeight: '120px' }}
        />
        <Button
          type="submit"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={(!input.trim() && !attachedFile) || isStreaming}
          aria-label="Send message"
        >
          <IconSend2 className="size-4" />
        </Button>
      </form>
    </div>
  );
}
