'use client';

import { useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Streamdown } from 'streamdown';
import { mermaid } from '@streamdown/mermaid';
import {
  IconCheck,
  IconAlertTriangle,
  IconLoader2,
  IconFile,
  IconDownload,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { CapgeminiIcons } from '@/components/shared/icons';
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
        'group flex items-center justify-between overflow-hidden rounded-[8px] border px-3 py-2 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
        evt.status === 'running' && 'border-border bg-muted/50 opacity-80',
        evt.status === 'success' && 'border-emerald-500/20 bg-emerald-500/5',
        evt.status === 'error' && 'border-destructive/30 bg-destructive/10'
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-background">
          {evt.status === 'running' && (
             <IconLoader2 className="size-3.5 stroke-[2] text-muted-foreground animate-spin" />
          )}
          {evt.status === 'success' && (
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}>
               <IconCheck className="size-3.5 stroke-[2.5] text-emerald-500" />
            </motion.div>
          )}
          {evt.status === 'error' && (
            <IconAlertTriangle className="size-3.5 stroke-[2] text-destructive" />
          )}
        </div>
        <span className="text-[12px] font-semibold text-foreground/90">
          {formatToolName(evt.tool)}
        </span>
      </div>
      {evt.summary && (
        <span className="text-[11px] font-medium text-muted-foreground tracking-wide opacity-0 -translate-x-2 transition-all duration-500 group-hover:opacity-100 group-hover:translate-x-0 line-clamp-1 max-w-[200px] text-right">
          {evt.summary}
        </span>
      )}
    </div>
  );
}

function AttachmentChip({ filename, size }: { filename: string; size: number }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-border bg-card px-2.5 py-1.5 mt-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <IconFile className="size-3.5 stroke-[1.5] text-muted-foreground shrink-0" />
      <span className="text-[12px] font-medium text-foreground/90 truncate">{filename}</span>
      <div className="w-[1px] h-3 bg-border mx-1" />
      <span className="text-[10px] text-muted-foreground tracking-wider">
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
      className="group relative flex w-full max-w-sm items-center justify-between rounded-[12px] border border-border bg-card p-1.5 mt-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-[1px] hover:border-primary/20"
    >
      <div className="flex items-center gap-3 w-full min-w-0 px-2 pl-3">
         <IconFile className="size-4 stroke-[1.5] text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
        <div className="flex flex-col items-start min-w-0 py-1.5">
          <span className="text-[14px] font-semibold text-card-foreground truncate w-full text-left group-hover:text-primary transition-colors duration-300">{filename}</span>
        </div>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:bg-primary group-hover:text-primary-foreground mr-0.5">
        <IconDownload className="size-4 stroke-[1.5]" />
      </div>
    </button>
  );
}

function EmptyState({ onSendSuggestion }: { onSendSuggestion: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10 py-16 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
        className="relative"
      >
        <div className="absolute -inset-10 rounded-full bg-primary/5 blur-3xl animate-pulse-slow" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-card border border-border shadow-xl">
           <div className="absolute inset-0 rounded-[1.5rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] pointer-events-none" />
          <CapgeminiIcons className="h-8 w-8" />
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.32, 0.72, 0, 1] }}
        className="text-center space-y-3 max-w-[400px]"
      >
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-foreground font-serif">
          Recruitment Intelligence
        </h1>
        <p className="text-[15px] font-medium text-muted-foreground leading-[1.6]">
          A high-end analysis engine. Submit a query or upload a CV to begin evaluation.
        </p>
      </motion.div>

      <div className="flex flex-col gap-2.5 w-full max-w-[480px] mt-4">
        {SUGGESTIONS.map((suggestion, i) => (
          <motion.button
            key={suggestion}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 + (i * 0.05), ease: [0.32, 0.72, 0, 1] }}
            type="button"
            onClick={() => onSendSuggestion(suggestion)}
            className="group flex w-full items-center justify-between rounded-[12px] border border-border bg-card/50 px-4 py-3.5 text-left transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-card hover:shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:border-primary/20 hover:-translate-y-0.5"
          >
            <span className="text-[14px] font-medium text-foreground/90">
              {suggestion}
            </span>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-muted transition-all group-hover:bg-primary group-hover:text-primary-foreground text-muted-foreground">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function LoadingIndication() {
  return (
    <div className="flex items-center gap-1.5 py-4 px-2">
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        className="h-1.5 w-1.5 rounded-full bg-primary" 
      />
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.5, delay: 0.2, repeat: Infinity, ease: 'easeInOut' }}
        className="h-1.5 w-1.5 rounded-full bg-primary" 
      />
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.5, delay: 0.4, repeat: Infinity, ease: 'easeInOut' }}
        className="h-1.5 w-1.5 rounded-full bg-primary" 
      />
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
  const isUser = msg.role === 'user';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        'group flex w-full gap-4 pb-4',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/10 shadow-sm mt-1">
          <CapgeminiIcons className="h-4 w-4" />
        </div>
      )}

      <div
        className={cn(
          'flex flex-col max-w-[85%] lg:max-w-[75%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {msg.role === 'assistant' &&
          msg.toolEvents &&
          msg.toolEvents.length > 0 && (
            <div className="mb-4 space-y-2 w-full max-w-sm">
              <AnimatePresence mode="popLayout">
                {msg.toolEvents.map((evt) => (
                  <motion.div 
                    key={evt.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                  >
                    <ToolEventChip evt={evt} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

        {!isUser && msg.content && (
          <div className="pl-1 pb-1">
             <span className="text-[12px] font-semibold text-muted-foreground tracking-wide uppercase">Agent</span>
          </div>
        )}

        <div
          className={cn(
            'text-[15px] leading-[1.65]',
            isUser
              ? 'rounded-[18px] rounded-tr-[4px] bg-primary text-primary-foreground px-5 py-3.5 shadow-md'
              : 'text-foreground/90'
          )}
        >
          {isUser ? (
            <div className="flex flex-col gap-2">
              <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
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
            <div className="space-y-4 font-sans">
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90
                [&_p]:leading-[1.7] [&_p]:mb-4
                [&_strong]:font-bold [&_strong]:text-foreground
                [&_h1]:text-xl [&_h1]:font-serif [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h1]:mb-4 [&_h1]:mt-8
                [&_h2]:text-lg [&_h2]:font-serif [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2]:mb-3 [&_h2]:mt-6
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-6
                [&_code]:bg-muted [&_code]:text-foreground [&_code]:font-mono [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded px-0
                [&_pre]:bg-zinc-950 dark:[&_pre]:bg-zinc-900 [&_pre]:text-zinc-50 [&_pre]:border [&_pre]:border-border [&_pre]:rounded-[12px] [&_pre]:p-4 [&_pre]:shadow-sm
                [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:mb-6
                [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground
                [&_td]:border-b [&_td]:border-border/50 [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-muted-foreground
                [&_ul]:pl-5 [&_ul]:mb-5 [&_ul]:space-y-1.5 [&_li]:pl-1 [&_li::marker]:text-muted-foreground
                [&_ol]:pl-5 [&_ol]:mb-5 [&_ol]:space-y-1.5"
              >
                <Streamdown
                  plugins={{ mermaid }}
                  isAnimating={isLast && isStreaming}
                >
                  {msg.content}
                </Streamdown>
              </div>
              {msg.fileDownloads && msg.fileDownloads.length > 0 && (
                <div className="flex flex-col gap-3 pt-2">
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
            <LoadingIndication />
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export function ChatMessageList({
  messages,
  isStreaming,
  isLoadingHistory,
  onSendSuggestion,
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  if (isLoadingHistory) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide bg-background"
    >
      <div className="mx-auto max-w-3xl flex flex-col gap-6">
        {messages.length === 0 ? (
          <EmptyState onSendSuggestion={onSendSuggestion} />
        ) : (
          messages.map((msg, index) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isLast={index === messages.length - 1}
              isStreaming={isStreaming}
            />
          ))
        )}
      </div>
    </div>
  );
}
