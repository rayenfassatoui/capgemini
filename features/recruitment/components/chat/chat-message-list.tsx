'use client';

import { useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Streamdown } from 'streamdown';
import { mermaid } from '@streamdown/mermaid';
import {
  IconSparkles,
  IconUser,
  IconTool,
  IconCheck,
  IconAlertTriangle,
  IconLoader2,
  IconFile,
  IconDownload,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import type { ChatMessage, ToolEvent } from './chat-types';
import { SUGGESTIONS, formatToolName } from './chat-types';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  onSendSuggestion: (text: string) => void;
}

function ToolEventChip({ evt }: { evt: ToolEvent }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors duration-300',
        evt.status === 'running' && 'border-primary/30 bg-primary/5',
        evt.status === 'success' && 'border-emerald-500/20 bg-emerald-500/5',
        evt.status === 'error' && 'border-destructive/30 bg-destructive/5'
      )}
    >
      {evt.status === 'running' && (
        <IconLoader2 className="size-3.5 text-primary animate-spin" />
      )}
      {evt.status === 'success' && (
        <IconCheck className="size-3.5 text-emerald-500 animate-in zoom-in duration-300" />
      )}
      {evt.status === 'error' && (
        <IconAlertTriangle className="size-3.5 text-destructive animate-pulse" />
      )}
      <IconTool className="size-3.5 text-muted-foreground/70" />
      <span className="text-xs font-semibold text-foreground/90">
        {formatToolName(evt.tool)}
      </span>
      {evt.summary && (
        <span className="text-[10px] font-medium text-muted-foreground ml-auto pl-2 border-l border-border/50">
          {evt.summary}
        </span>
      )}
    </div>
  );
}

function AttachmentChip({ filename, size }: { filename: string; size: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-primary-foreground/20 bg-primary-foreground/10 px-2 py-1 mt-1.5">
      <IconFile className="size-3 shrink-0" />
      <span className="text-[11px] font-medium truncate">{filename}</span>
      <span className="text-[10px] opacity-70 shrink-0">
        {Math.round(size / 1024)}KB
      </span>
    </div>
  );
}

function FileDownloadButton({
  filename,
  base64,
  contentType,
}: {
  filename: string;
  base64: string;
  contentType: string;
}) {
  const handleDownload = () => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="group relative flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card/40 p-3 mt-3 transition-all hover:bg-card/80 hover:border-primary/20 hover:shadow-md"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 transition-colors group-hover:bg-emerald-500/20">
        <IconDownload className="size-4.5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex flex-col items-start min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-medium text-foreground truncate w-full text-left group-hover:text-primary transition-colors">{filename}</span>
        <span className="text-[10px] text-muted-foreground group-hover:text-muted-foreground/80">Click to download file</span>
      </div>
    </button>
  );
}

function EmptyState({ onSendSuggestion }: { onSendSuggestion: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-12 px-6">
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" as const }}
        className="relative"
      >
        <div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl animate-pulse-slow" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-background to-muted border border-white/10 shadow-xl">
          <IconSparkles className="size-7 text-primary" />
        </div>
      </motion.div>

      <div className="text-center space-y-2 max-w-[280px]">
        <p className="text-lg font-bold bg-clip-text text-transparent bg-linear-to-r from-primary via-indigo-400 to-cyan-400">
          Recruitment Intelligence
        </p>
        <p className="text-xs font-medium text-muted-foreground leading-relaxed">
          I can analyze candidates, generate job descriptions, and provide hiring insights.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-[340px]">
        {SUGGESTIONS.map((suggestion, i) => (
          <motion.button
            key={suggestion}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            type="button"
            onClick={() => onSendSuggestion(suggestion)}
            className="rounded-full border border-border/60 bg-background/50 backdrop-blur-sm px-3.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary hover:border-primary/20 hover:scale-105 hover:shadow-sm"
          >
            {suggestion}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2 px-1">
      <span className="h-2 w-2 rounded-full bg-primary/60 animate-pulse" />
      <span className="h-2 w-2 rounded-full bg-primary/40 animate-pulse [animation-delay:150ms]" />
      <span className="h-2 w-2 rounded-full bg-primary/20 animate-pulse [animation-delay:300ms]" />
    </div>
  );
}

function MessageBubble({
  msg,
  isLast,
  isStreaming,
}: {
  msg: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-2.5',
        msg.role === 'user' ? 'justify-end' : 'justify-start'
      )}
    >
      {msg.role === 'assistant' && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary/10 to-indigo-500/10 shadow-inner mt-0.5 border border-primary/5">
          <IconSparkles className="size-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm text-sm',
          msg.role === 'user'
            ? 'bg-linear-to-r from-primary to-indigo-600 text-white rounded-br-sm'
            : 'bg-linear-to-br from-muted/40 to-muted/10 border border-white/5 backdrop-blur-sm rounded-bl-sm border-l-2 border-l-primary/30'
        )}
      >
        {msg.role === 'assistant' &&
          msg.toolEvents &&
          msg.toolEvents.length > 0 && (
            <div className="mb-2 space-y-1">
              {msg.toolEvents.map((evt) => (
                <ToolEventChip key={evt.id} evt={evt} />
              ))}
            </div>
          )}

        {msg.role === 'user' ? (
          <div>
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            {msg.attachments && msg.attachments.length > 0 && (
              <div>
                {msg.attachments.map((att) => (
                  <AttachmentChip
                    key={att.filename}
                    filename={att.filename}
                    size={att.size}
                  />
                ))}
              </div>
            )}
          </div>
        ) : msg.content ? (
          <div className="space-y-3">
            <div className="prose prose-invert prose-sm max-w-none [&_p]:leading-relaxed [&_p]:text-foreground/90 [&_strong]:text-foreground [&_h1]:text-base [&_h2]:text-sm [&_code]:bg-muted/50 [&_code]:rounded-sm [&_code]:px-1 [&_code]:py-0.5 [&_pre]:bg-muted/80 [&_pre]:border [&_pre]:border-white/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_ul]:ml-4 [&_ol]:ml-4 [&_li]:text-sm [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_pre]:text-xs [&_code]:text-xs">
              <Streamdown
                plugins={{ mermaid }}
                isAnimating={isLast && isStreaming}
              >
                {msg.content}
              </Streamdown>
            </div>
            {msg.fileDownloads && msg.fileDownloads.length > 0 && (
              <div>
                {msg.fileDownloads.map((fd) => (
                  <FileDownloadButton
                    key={fd.filename}
                    filename={fd.filename}
                    base64={fd.base64}
                    contentType={fd.contentType}
                  />
                ))}
              </div>
            )}
          </div>
        ) : isLast &&
          isStreaming &&
          (!msg.toolEvents || msg.toolEvents.length === 0) ? (
          <LoadingDots />
        ) : null}
      </div>

      {msg.role === 'user' && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/50 mt-0.5 border border-white/5">
          <IconUser className="size-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export function ChatMessageList({
  messages,
  isStreaming,
  isLoadingHistory,
  onSendSuggestion,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent"
    >
      {isLoadingHistory ? (
        <div className="flex items-center justify-center h-full">
          <LoadingDots />
        </div>
      ) : messages.length === 0 ? (
        <EmptyState onSendSuggestion={onSendSuggestion} />
      ) : (
        messages.map((msg, idx) => {
          const isLast =
            idx === messages.length - 1 && msg.role === 'assistant';
          return (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isLast={isLast}
              isStreaming={isStreaming}
            />
          );
        })
      )}
    </div>
  );
}
