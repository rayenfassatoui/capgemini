"use client";

import Link from "next/link";
import { IconExternalLink, IconFileText, IconSparkles } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChatHeader } from "./chat-header";
import { ChatHistory } from "./chat-history";
import { ChatInput } from "./chat-input";
import { ChatMessageList } from "./chat-message-list";
import type { AgentReference } from "./agent-prompts";
import type { StatisticsChatController } from "./use-statistics-chat-controller";
interface AgentChatSurfaceProps {
  controller: StatisticsChatController;
  className?: string;
  variant?: "panel" | "workspace";
  contextLabel?: string;
  reference?: AgentReference | null;
  onClose?: () => void;
  onExpand?: () => void;
}

function AgentReferenceBar({ reference }: { reference: AgentReference }) {
  return (
    <Card
      size="sm"
      className="mx-3 mt-3 border-primary/20 bg-primary/5 py-3 shadow-none ring-primary/10 md:mx-6"
      aria-label="Active agent reference"
    >
      <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-background text-primary ring-1 ring-primary/15">
            <IconFileText className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <IconSparkles className="size-3.5" />
              Active reference
            </p>
            <h2 className="mt-1 truncate text-sm font-semibold text-foreground">
              {reference.title}
            </h2>
            {reference.subtitle && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {reference.subtitle}
              </p>
            )}
            {reference.facts && reference.facts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reference.facts.map((fact) => (
                  <Badge
                    key={`${fact.label}-${fact.value}`}
                    variant="outline"
                    className="max-w-full rounded-full bg-background/70 text-[11px]"
                  >
                    <span className="text-muted-foreground">{fact.label}</span>
                    <span className="mx-1 text-muted-foreground/50">·</span>
                    <span className="truncate">{fact.value}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        {reference.href && (
          <Link href={reference.href} className="shrink-0">
            <Button variant="outline" size="sm" className="w-full rounded-full sm:w-auto">
              Open CV
              <IconExternalLink data-icon="inline-end" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentChatSurface({
  controller,
  className,
  variant = "panel",
  contextLabel,
  reference,
  onClose,
  onExpand,
}: AgentChatSurfaceProps) {
  const {
    view,
    setView,
    conversations,
    activeConversationId,
    messages,
    input,
    isStreaming,
    isLoadingHistory,
    attachedFile,
    setInput,
    switchConversation,
    createNewChat,
    deleteConversation,
    handleStop,
    sendMessage,
    attachFile,
    removeFile,
    confirmAction,
  } = controller;

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <ChatHeader
        view={view}
        conversations={conversations}
        isStreaming={isStreaming}
        variant={variant}
        contextLabel={contextLabel}
        onSetView={setView}
        onNewChat={createNewChat}
        onClose={onClose}
        onExpand={onExpand}
      />

      {view === "chat" && reference && (
        <AgentReferenceBar reference={reference} />
      )}

      {view === "history" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatHistory
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSwitch={switchConversation}
            onDelete={deleteConversation}
            onNewChat={createNewChat}
          />
        </div>
      )}

      {view === "chat" && (
        <>
          <ChatMessageList
            messages={messages}
            isStreaming={isStreaming}
            isLoadingHistory={isLoadingHistory}
            variant={variant}
            onSendSuggestion={sendMessage}
            onConfirmAction={confirmAction}
          />
          <ChatInput
            input={input}
            isStreaming={isStreaming}
            attachedFile={attachedFile}
            variant={variant}
            onInputChange={setInput}
            onSend={sendMessage}
            onStop={handleStop}
            onAttachFile={attachFile}
            onRemoveFile={removeFile}
          />
        </>
      )}
    </div>
  );
}
