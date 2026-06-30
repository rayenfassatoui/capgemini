'use client';

import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  IconSend2,
  IconPaperclip,
  IconFile,
  IconX,
  IconPlayerStopFilled,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AgentReferenceChip } from './agent-reference-chip';
import type { AgentReference } from './agent-prompts';

const TEXTAREA_MIN_HEIGHT_PX = 52;
const TEXTAREA_MAX_HEIGHT_PX = 640;
const TEXTAREA_MAX_VIEWPORT_RATIO = 0.72;

interface ChatInputProps {
  input: string;
  isStreaming: boolean;
  attachedFile: File | null;
  reference: AgentReference | null;
  variant?: 'panel' | 'workspace';
  onInputChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttachFile: (file: File) => void;
  onRemoveFile: () => void;
  onRemoveReference: () => void;
}

export function ChatInput({
  input,
  isStreaming,
  attachedFile,
  reference,
  onInputChange,
  variant = 'panel',
  onSend,
  onStop,
  onAttachFile,
  onRemoveFile,
  onRemoveReference,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousInputRef = useRef(input);

  const resizeTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;

    textarea.style.height = 'auto';

    const maxHeight = Math.min(
      TEXTAREA_MAX_HEIGHT_PX,
      Math.max(TEXTAREA_MIN_HEIGHT_PX, window.innerHeight * TEXTAREA_MAX_VIEWPORT_RATIO),
    );
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, TEXTAREA_MIN_HEIGHT_PX),
      maxHeight,
    );

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

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

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onInputChange(e.currentTarget.value);
      resizeTextarea(e.currentTarget);
    },
    [onInputChange, resizeTextarea],
  );


  useEffect(() => {
    const previousInput = previousInputRef.current;
    previousInputRef.current = input;
    if (!input.trim() || previousInput.trim() || isStreaming) return;
    const textarea = inputRef.current;
    if (!textarea || document.activeElement === textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [input, isStreaming]);

  useLayoutEffect(() => {
    resizeTextarea(inputRef.current);
  }, [input, resizeTextarea]);

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
    <div className={cn("relative p-6 pt-0", variant === 'workspace' ? "bg-transparent" : "bg-background")}>
      <div className={cn("mx-auto", variant === 'workspace' ? "max-w-4xl" : "max-w-3xl")}>
        {attachedFile && (
          <div className="flex items-center gap-3 mb-4 rounded-[12px] border border-border bg-card p-3 shadow-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] translate-y-0 opacity-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <IconFile className="size-4 stroke-[1.5] text-primary" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[14px] font-medium text-card-foreground truncate">
                {attachedFile.name}
              </span>
              <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                {Math.round(attachedFile.size / 1024)} KB
              </span>
            </div>
            <button
              type="button"
              onClick={onRemoveFile}
              className="shrink-0 rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-300"
              aria-label="Remove attached file"
            >
              <IconX className="size-4 stroke-[1.5]" />
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

        <form
          onSubmit={handleSubmit}
          className={cn(
            "group relative flex flex-col gap-2 rounded-[1.75rem] border border-border p-2 shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:border-primary/30 focus-within:shadow-[0_8px_32px_rgba(0,0,0,0.06)]",
            variant === 'workspace' ? "bg-card/95" : "bg-card",
          )}
        >
          {reference && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 pb-2 pt-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                References
              </span>
              <AgentReferenceChip
                reference={reference}
                onRemove={onRemoveReference}
              />
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              attachedFile
                ? 'Ask about this document...'
                : reference
                  ? 'Ask about the referenced CV...'
                  : 'Send a message...'
            }
            disabled={isStreaming}
            rows={1}
            className="w-full resize-none bg-transparent px-4 py-3.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 min-h-[52px]"
            style={{ overflowY: 'hidden' }}
          />

          <div className="flex w-full items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
              disabled={isStreaming}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
            >
              <IconPaperclip className="size-5 stroke-[1.5]" />
            </Button>

            <div className="flex items-center justify-center gap-1 shrink-0">
              {input.trim() && !isStreaming && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onInputChange('')}
                  className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear message"
                >
                  <IconX className="size-4 stroke-[1.5]" />
                </Button>
              )}
              {isStreaming ? (
                <Button
                  type="button"
                  onClick={onStop}
                  className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] scale-100 hover:scale-[0.98] active:scale-[0.94] flex items-center justify-center shadow-md"
                  aria-label="Stop generating response"
                >
                  <IconPlayerStopFilled className="size-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[0.98] active:scale-[0.94] disabled:bg-muted disabled:text-muted-foreground flex items-center justify-center"
                  disabled={!input.trim() && !attachedFile && !reference}
                  aria-label="Send message"
                >
                  <IconSend2 className="size-4 stroke-[2px] ml-[2px]" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
