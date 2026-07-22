'use client';

import {
  IconArrowLeft,
  IconArrowsMaximize,
  IconHistory,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { CapgeminiIcons } from '@/components/shared/icons';
import { useTranslation } from "@/components/shared/i18n-provider";
import { cn } from '@/lib/utils';
import type { ChatView, Conversation } from './chat-types';

interface ChatHeaderProps {
  view: ChatView;
  conversations: Conversation[];
  isStreaming: boolean;
  variant?: 'panel' | 'workspace';
  contextLabel?: string;
  onSetView: (view: ChatView) => void;
  onNewChat: () => void;
  onClose?: () => void;
  onExpand?: () => void;
}

export function ChatHeader({
  view,
  conversations,
  isStreaming,
  variant = 'panel',
  contextLabel,
  onSetView,
  onNewChat,
  onClose,
  onExpand,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2.5 sm:px-5 sm:py-4 md:px-6',
        variant === 'workspace' ? 'bg-transparent' : 'bg-background',
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        {view === 'history' ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-full transition-transform duration-300 hover:bg-muted active:scale-[0.96]"
            onClick={() => onSetView('chat')}
            aria-label={t("agent.backToChat")}
            data-agent-history-back
          >
            <IconArrowLeft className="size-4 stroke-[1.5] text-foreground" />
          </Button>
        ) : (
          <div className="flex size-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10">
            <CapgeminiIcons className="size-5" />
          </div>
        )}
        <div className="min-w-0 flex flex-col">
          <h2 className="truncate text-base font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {view === 'history' ? t("agent.chatHistory") : t("agent.intelligenceAgent")}
          </h2>
          <p className="truncate text-[12px] font-medium tracking-[0.01em] text-muted-foreground">
            {view === 'history'
              ? `${conversations.length} ${t(conversations.length === 1 ? "agent.conversation" : "agent.conversations")}`
              : (contextLabel ?? t("agent.defaultContext"))}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {view === 'chat' && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 rounded-full transition-transform duration-300 hover:bg-muted active:scale-[0.96]"
              onClick={onNewChat}
              disabled={isStreaming}
              aria-label={t("agent.newConversation")}
            >
              <IconPlus className="size-4 stroke-[1.5] text-foreground" />
            </Button>
            {onExpand && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden size-11 rounded-full transition-transform duration-300 hover:bg-muted active:scale-[0.96] sm:inline-flex"
                onClick={onExpand}
                disabled={isStreaming}
                aria-label={t("agent.openWorkspace")}
              >
                <IconArrowsMaximize className="size-4 stroke-[1.5] text-foreground" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-11 rounded-full transition-transform duration-300 hover:bg-muted active:scale-[0.96]"
              onClick={() => onSetView('history')}
              disabled={isStreaming}
              aria-label={t("agent.chatHistory")}
              data-agent-history-trigger
            >
              <IconHistory className="size-4 stroke-[1.5] text-foreground" />
            </Button>
          </>
        )}
        {onClose && (
          <>
            <div className="mx-1 h-4 w-px bg-border sm:mx-2" />
            <Button
              variant="ghost"
              size="icon"
              className="size-11 rounded-full transition-transform duration-300 hover:bg-muted active:scale-[0.96]"
              onClick={onClose}
              aria-label={t("agent.closeChat")}
            >
              <IconX className="size-4 stroke-[1.5] text-foreground" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
