'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Streamdown } from 'streamdown';
import { mermaid } from '@streamdown/mermaid';
import {
  IconSparkles,
  IconUser,
  IconTool,
  IconCheck,
  IconAlertTriangle,
  IconLoader2,
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
    <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2 py-1">
      {evt.status === 'running' && (
        <IconLoader2 className="size-3 text-muted-foreground animate-spin" />
      )}
      {evt.status === 'success' && (
        <IconCheck className="size-3 text-emerald-500" />
      )}
      {evt.status === 'error' && (
        <IconAlertTriangle className="size-3 text-destructive" />
      )}
      <IconTool className="size-3 text-muted-foreground" />
      <span className="text-[11px] font-medium text-foreground">
        {formatToolName(evt.tool)}
      </span>
      {evt.summary && (
        <span className="text-[10px] text-muted-foreground ml-auto">
          {evt.summary}
        </span>
      )}
    </div>
  );
}

function EmptyState({ onSendSuggestion }: { onSendSuggestion: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <IconSparkles className="size-5 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          What would you like to do?
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          I can read data, create jobs, match CVs, manage candidates, and more
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSendSuggestion(suggestion)}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
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
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 mt-0.5">
          <IconSparkles className="size-3.5 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2',
          msg.role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/50'
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
          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
        ) : msg.content ? (
          <div className="text-sm [&_p]:leading-relaxed [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_ul]:ml-4 [&_ol]:ml-4 [&_li]:text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_pre]:text-xs [&_code]:text-xs">
            <Streamdown
              plugins={{ mermaid }}
              isAnimating={isLast && isStreaming}
            >
              {msg.content}
            </Streamdown>
          </div>
        ) : isLast &&
          isStreaming &&
          (!msg.toolEvents || msg.toolEvents.length === 0) ? (
          <LoadingDots />
        ) : null}
      </div>

      {msg.role === 'user' && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
          <IconUser className="size-3.5 text-muted-foreground" />
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
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
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
