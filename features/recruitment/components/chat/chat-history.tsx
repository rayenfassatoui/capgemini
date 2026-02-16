'use client';

import {
  IconMessageChatbot,
  IconHistory,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Conversation } from './chat-types';
import { formatRelativeTime } from './chat-types';

interface ChatHistoryProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

export function ChatHistory({
  conversations,
  activeConversationId,
  onSwitch,
  onDelete,
  onNewChat,
}: ChatHistoryProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <IconHistory className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No conversations yet</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
          className="mt-1"
        >
          <IconPlus className="size-3.5 mr-1.5" />
          Start a new chat
        </Button>
      </div>
    );
  }

  return (
    <div className="py-1">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={cn(
            'group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50',
            activeConversationId === conv.id && 'bg-muted/60'
          )}
          onClick={() => onSwitch(conv.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSwitch(conv.id);
          }}
          role="button"
          tabIndex={0}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <IconMessageChatbot className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {conv.title}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {formatRelativeTime(conv.updatedAt)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(conv.id);
            }}
            aria-label="Delete conversation"
          >
            <IconTrash className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
