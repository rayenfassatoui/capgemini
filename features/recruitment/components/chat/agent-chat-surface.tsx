"use client";

import { ChatHeader } from "./chat-header";
import { ChatHistory } from "./chat-history";
import { ChatInput } from "./chat-input";
import { ChatMessageList } from "./chat-message-list";
import type { StatisticsChatController } from "./use-statistics-chat-controller";
import { cn } from "@/lib/utils";

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
    setInput,
    switchConversation,
    createNewChat,
    deleteConversation,
    handleStop,
    sendMessage,
    attachFile,
    removeFile,
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
            onSendSuggestion={sendMessage}
          />
          <ChatInput
            input={input}
            isStreaming={isStreaming}
            attachedFile={attachedFile}
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
