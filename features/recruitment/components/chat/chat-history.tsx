'use client';

import {
  IconMessageChatbot,
  IconHistory,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useTranslation } from "@/components/shared/i18n-provider";
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
  const { locale, t } = useTranslation();
  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-12">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <IconHistory className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          {t("agent.noConversations")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
          className="mt-1 min-h-11 px-4"
        >
          <IconPlus className="mr-1.5 size-3.5" />
          {t("agent.newConversation")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 px-2 py-2">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={cn(
            "group flex min-h-11 items-center gap-1 rounded-xl border transition-colors",
            activeConversationId === conv.id
              ? "border-primary/20 bg-primary/10 shadow-sm"
              : "border-transparent hover:border-border hover:bg-muted/40",
          )}
        >
          <button
            type="button"
            onClick={() => onSwitch(conv.id)}
            aria-current={activeConversationId === conv.id ? "true" : undefined}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                activeConversationId === conv.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary",
              )}
            >
              <IconMessageChatbot className="size-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {conv.title}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {formatRelativeTime(conv.updatedAt, locale)}
              </span>
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="mr-1 size-11 shrink-0 rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
            onClick={() => onDelete(conv.id)}
            aria-label={`${t("agent.deleteConversation")} ${conv.title}`}
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
