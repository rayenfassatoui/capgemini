'use client';

import {
  IconX,
  IconPlus,
  IconHistory,
  IconArrowLeft,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { CapgeminiIcons } from '@/components/shared/icons';
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
    <div className="flex items-center justify-between border-b border-border bg-background px-6 py-5 shrink-0 z-20">
      <div className="flex items-center gap-4">
        {view === 'history' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-muted transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
            onClick={() => onSetView('chat')}
            aria-label="Back to chat"
          >
            <IconArrowLeft className="size-4 stroke-[1.5] text-foreground" />
          </Button>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <CapgeminiIcons className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-col">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground leading-tight">
            {view === 'history' ? 'Chat History' : 'Intelligence Agent'}
          </h2>
          <p className="text-[12px] font-medium text-muted-foreground tracking-[0.01em]">
            {view === 'history'
              ? `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
              : 'HR & Recruitment Analysis'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {view === 'chat' && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-muted transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
              onClick={onNewChat}
              disabled={isStreaming}
              aria-label="New conversation"
            >
              <IconPlus className="size-4 stroke-[1.5] text-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-muted transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
              onClick={() => onSetView('history')}
              disabled={isStreaming}
              aria-label="Chat history"
            >
              <IconHistory className="size-4 stroke-[1.5] text-foreground" />
            </Button>
          </>
        )}
        <div className="w-[1px] h-4 bg-border mx-2" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-muted transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
          onClick={onClose}
          aria-label="Close chat"
        >
          <IconX className="size-4 stroke-[1.5] text-foreground" />
        </Button>
      </div>
    </div>
  );
}
