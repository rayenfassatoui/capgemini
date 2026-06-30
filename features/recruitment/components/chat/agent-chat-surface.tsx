"use client";

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
    reference,
    setReference,
    setInput,
    switchConversation,
    createNewChat,
    deleteConversation,
    handleStop,
    sendMessage,
    attachFile,
    removeFile,
    removeReference,
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
            reference={reference}
            variant={variant}
            onInputChange={setInput}
            onSend={sendMessage}
            onStop={handleStop}
            onAttachFile={attachFile}
            onRemoveFile={removeFile}
            onSetReference={setReference}
            onRemoveReference={removeReference}
          />
        </>
      )}
    </div>
  );
}
