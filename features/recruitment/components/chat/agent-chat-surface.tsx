"use client";
import { useCallback, useEffect, useRef } from "react";
import { MotionConfig } from "framer-motion";

import { cn } from "@/lib/utils";
import { ChatHeader } from "./chat-header";
import { ChatHistory } from "./chat-history";
import { ChatInput } from "./chat-input";
import { ChatMessageList } from "./chat-message-list";
import type { StatisticsChatController } from "./use-statistics-chat-controller";
interface AgentChatSurfaceProps {
  controller: StatisticsChatController;
  className?: string;
  variant?: "panel" | "workspace";
  contextLabel?: string;
  onClose?: () => void;
  onExpand?: () => void;
}


export function AgentChatSurface({
  controller,
  className,
  variant = "panel",
  contextLabel,
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
    references,
    addReference,
    setInput,
    switchConversation,
    createNewChat,
    deleteConversation,
    handleStop,
    sendMessage,
    attachFile,
    removeFile,
    removeReference,
    clearReferences,
    confirmAction,
  } = controller;

  const surfaceRef = useRef<HTMLDivElement>(null);
  const previousViewRef = useRef(view);
  const handleSetView = useCallback(
    (nextView: "chat" | "history") => {
      setView(nextView);
    },
    [setView],
  );

  useEffect(() => {
    if (previousViewRef.current === view) return;
    previousViewRef.current = view;

    const frame = window.requestAnimationFrame(() => {
      const selector =
        view === "history"
          ? "[data-agent-history-back]"
          : "[data-agent-history-trigger]";
      surfaceRef.current?.querySelector<HTMLElement>(selector)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  useEffect(() => {
    if (view !== "history") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleSetView("chat");
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSetView, view]);

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={surfaceRef}
        data-agent-chat-surface
        className={cn(
          "flex h-full flex-col overflow-hidden motion-reduce:scroll-auto motion-reduce:[&_*]:!animate-none motion-reduce:[&_*]:!transition-none",
          className,
        )}
      >
      <ChatHeader
        view={view}
        conversations={conversations}
        isStreaming={isStreaming}
        variant={variant}
        contextLabel={contextLabel}
        onSetView={handleSetView}
        onNewChat={createNewChat}
        onClose={onClose}
        onExpand={onExpand}
      />


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
            key={activeConversationId ?? "new-conversation"}
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
            references={references}
            variant={variant}
            onInputChange={setInput}
            onSend={sendMessage}
            onStop={handleStop}
            onAttachFile={attachFile}
            onRemoveFile={removeFile}
            onAddReference={addReference}
            onRemoveReference={removeReference}
            onClearReferences={clearReferences}
          />
        </>
      )}
      </div>
    </MotionConfig>
  );
}
