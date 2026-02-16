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
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-2.5">
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
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <IconSparkles className="size-4 text-primary" />
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">
            {view === 'history' ? 'Chat History' : 'Recruitment Agent'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {view === 'history'
              ? `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`
              : 'Ask questions or take actions'}
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
  );
}
