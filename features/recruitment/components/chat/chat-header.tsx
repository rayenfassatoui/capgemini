'use client';

import {
  IconSparkles,
  IconX,
  IconPlus,
  IconHistory,
  IconArrowLeft,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import type { ChatView, Conversation } from './chat-types';

interface ChatHeaderProps {
  view: ChatView;
  conversations: Conversation[];
  isStreaming: boolean;
  onSetView: (view: ChatView) => void;
  onNewChat: () => void;
  onClose: () => void;
}

export function ChatHeader({
  view,
  conversations,
  isStreaming,
  onSetView,
  onNewChat,
  onClose,
}: ChatHeaderProps) {
  return (
    <>
      <div className="relative flex items-center justify-between border-b border-border/50 bg-background/40 backdrop-blur-md px-4 py-3 shrink-0">
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-linear-to-r from-primary via-indigo-500 to-cyan-500 opacity-80" />
        <div className="flex items-center gap-3">
          {view === 'history' ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onSetView('chat')}
              aria-label="Back to chat"
            >
              <IconArrowLeft className="size-4" />
            </Button>
          ) : (
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-primary/20 to-indigo-500/20 shadow-inner">
              <IconSparkles className="size-4.5 text-primary animate-pulse-slow" />
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-foreground leading-none tracking-tight">
              {view === 'history' ? 'Chat History' : 'Recruitment Agent'}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground/80 mt-1">
              {view === 'history'
                ? `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`
                : 'AI-powered recruitment intelligence'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {view === 'chat' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onNewChat}
                disabled={isStreaming}
                aria-label="New conversation"
              >
                <IconPlus className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => onSetView('history')}
                disabled={isStreaming}
                aria-label="Chat history"
              >
                <IconHistory className="size-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            aria-label="Close chat"
          >
            <IconX className="size-4" />
          </Button>
        </div>
      </div>
      <div className="h-4 bg-linear-to-b from-background/40 to-transparent shrink-0 pointer-events-none -mb-4 z-10" />
    </>
  );
}
