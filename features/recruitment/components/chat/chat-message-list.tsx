"use client";

import { useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Streamdown } from "streamdown";
import { mermaid } from "@streamdown/mermaid";
import { IconLoader2, IconFile, IconDownload } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { CapgeminiIcons } from "@/components/shared/icons";
import type { ChatMessage, ToolEvent } from "./chat-types";
import { SUGGESTIONS, formatToolName } from "./chat-types";
import { ToolInspector } from "./tool-inspector";

interface ChatMessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  onSendSuggestion: (text: string) => void;
}

const STATUS_TEXT_THINKING = "Thinking...";

function AttachmentChip({
  filename,
  size,
}: {
  filename: string;
  size: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-border bg-card px-2.5 py-1.5 mt-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <IconFile className="size-3.5 stroke-[1.5] text-muted-foreground shrink-0" />
      <span className="text-[12px] font-medium text-foreground/90 truncate">
        {filename}
      </span>
      <div className="w-px h-3 bg-border mx-1" />
      <span className="text-[10px] text-muted-foreground tracking-wider">
        {Math.round(size / 1024)}KB
      </span>
    </div>
  );
}

function FileDownloadButton({
  filename,
  base64,
  contentType,
}: {
  filename: string;
  base64: string;
  contentType: string;
}) {
  const handleDownload = () => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="group relative flex w-full max-w-sm items-center justify-between rounded-xl border border-border bg-card p-1.5 mt-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-px hover:border-primary/20"
    >
      <div className="flex items-center gap-3 w-full min-w-0 px-2 pl-3">
        <IconFile className="size-4 stroke-[1.5] text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
        <div className="flex flex-col items-start min-w-0 py-1.5">
          <span className="text-[14px] font-semibold text-card-foreground truncate w-full text-left group-hover:text-primary transition-colors duration-300">
            {filename}
          </span>
        </div>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:bg-primary group-hover:text-primary-foreground mr-0.5">
        <IconDownload className="size-4 stroke-[1.5]" />
      </div>
    </button>
  );
}

function EmptyState({
  onSendSuggestion,
}: {
  onSendSuggestion: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10 py-16 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 1, ease: [0.32, 0.72, 0, 1] }}
        className="relative"
      >
        <div className="absolute -inset-10 rounded-full bg-primary/5 blur-3xl animate-pulse-slow" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-card border border-border shadow-xl">
          <div className="absolute inset-0 rounded-3xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] pointer-events-none" />
          <CapgeminiIcons className="h-8 w-8" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.32, 0.72, 0, 1] }}
        className="text-center space-y-3 max-w-100"
      >
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-foreground font-serif">
          Recruitment Intelligence
        </h1>
        <p className="text-[15px] font-medium text-muted-foreground leading-[1.6]">
          Ask for CV matching, pipeline analysis, job requirement review, or
          interview kits. The agent keeps history and can process PDF or DOCX
          files when you need document-level reasoning.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {["CV-aware", "Role-aware", "Tool trace", "Reports"].map((label) => (
            <span
              key={label}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      </motion.div>

      <div className="flex flex-col gap-2.5 w-full max-w-120 mt-4">
        {SUGGESTIONS.map((suggestion, i) => (
          <motion.button
            key={suggestion}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.4 + i * 0.05,
              ease: [0.32, 0.72, 0, 1],
            }}
            type="button"
            onClick={() => onSendSuggestion(suggestion)}
            className="group flex w-full items-center justify-between rounded-xl border border-border bg-card/50 px-4 py-3.5 text-left transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-card hover:shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:border-primary/20 hover:-translate-y-0.5"
          >
            <span className="text-[14px] font-medium text-foreground/90">
              {suggestion}
            </span>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-muted transition-all group-hover:bg-primary group-hover:text-primary-foreground text-muted-foreground">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14"></path>
                <path d="m12 5 7 7-7 7"></path>
              </svg>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function LoadingIndication() {
  return (
    <div className="flex items-center gap-1.5 py-4 px-2">
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        className="h-1.5 w-1.5 rounded-full bg-primary"
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
        transition={{
          duration: 1.5,
          delay: 0.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="h-1.5 w-1.5 rounded-full bg-primary"
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
        transition={{
          duration: 1.5,
          delay: 0.4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="h-1.5 w-1.5 rounded-full bg-primary"
      />
    </div>
  );
}

function AssistantWorkingIndicator({
  toolEvents,
}: {
  toolEvents?: ToolEvent[];
}) {
  const runningTool = toolEvents?.find((evt) => evt.status === "running");
  const statusText = runningTool
    ? `Working on ${formatToolName(runningTool.tool)}`
    : STATUS_TEXT_THINKING;

  return (
    <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-border/70 bg-muted/30 px-3 py-2">
      <IconLoader2 className="size-3.5 animate-spin text-muted-foreground" />
      <motion.span
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="relative text-[12px] font-medium tracking-wide text-muted-foreground"
      >
        {statusText}
      </motion.span>
      <div className="ml-1 flex items-center gap-1">
        <motion.div
          animate={{ y: [0, -2, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
        />
        <motion.div
          animate={{ y: [0, -2, 0], opacity: [0.35, 1, 0.35] }}
          transition={{
            duration: 1,
            delay: 0.15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
        />
        <motion.div
          animate={{ y: [0, -2, 0], opacity: [0.35, 1, 0.35] }}
          transition={{
            duration: 1,
            delay: 0.3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
        />
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  isLast,
  isStreaming,
}: {
  msg: ChatMessage;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const isUser = msg.role === "user";
  const hasToolEvents = (msg.toolEvents?.length ?? 0) > 0;
  const hasRunningTool =
    hasToolEvents &&
    msg.toolEvents!.some(
      (event) => event.status === "running" || event.status === "queued",
    );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "group flex w-full gap-4 pb-4",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/10 shadow-sm mt-1">
          <CapgeminiIcons className="h-4 w-4" />
        </div>
      )}

      <div
        className={cn(
          "flex flex-col max-w-[85%] lg:max-w-[75%]",
          isUser ? "items-end" : "items-start",
        )}
      >
        {msg.role === "assistant" &&
          hasToolEvents && (
            <div className="mb-4 w-full max-w-2xl">
              <ToolInspector
                events={msg.toolEvents}
                isLoading={isLast && isStreaming && hasRunningTool}
              />
            </div>
          )}

        {!isUser && msg.content && (
          <div className="pl-1 pb-1">
            <span className="text-[12px] font-semibold text-muted-foreground tracking-wide uppercase">
              Agent
            </span>
          </div>
        )}

        <div
          className={cn(
            "text-[15px] leading-[1.65]",
            isUser
              ? "rounded-[18px] rounded-tr-lg bg-primary text-primary-foreground px-5 py-3.5 shadow-md"
              : "text-foreground/90",
          )}
        >
          {isUser ? (
            <div className="flex flex-col gap-2">
              <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {msg.attachments.map((att) => (
                    <AttachmentChip
                      key={att.filename}
                      filename={att.filename}
                      size={att.size}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : msg.content ? (
            <div className="space-y-4 font-sans">
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-foreground/90
                [&_p]:leading-[1.7] [&_p]:mb-4
                [&_strong]:font-bold [&_strong]:text-foreground
                [&_h1]:text-xl [&_h1]:font-serif [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h1]:mb-4 [&_h1]:mt-8
                [&_h2]:text-lg [&_h2]:font-serif [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2]:mb-3 [&_h2]:mt-6
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-6
                [&_code]:bg-muted [&_code]:text-foreground [&_code]:font-mono [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded px-0
                [&_pre]:bg-zinc-950 dark:[&_pre]:bg-zinc-900 [&_pre]:text-zinc-50 [&_pre]:border [&_pre]:border-border [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:shadow-sm
                [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:mb-6
                [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground
                [&_td]:border-b [&_td]:border-border/50 [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-muted-foreground
                [&_ul]:pl-5 [&_ul]:mb-5 [&_ul]:space-y-1.5 [&_li]:pl-1 [&_li::marker]:text-muted-foreground
                [&_ol]:pl-5 [&_ol]:mb-5 [&_ol]:space-y-1.5"
              >
                <Streamdown
                  plugins={{ mermaid }}
                  isAnimating={isLast && isStreaming}
                >
                  {msg.content}
                </Streamdown>
              </div>
              {msg.fileDownloads && msg.fileDownloads.length > 0 && (
                <div className="flex flex-col gap-3 pt-2">
                  {msg.fileDownloads.map((fd) => (
                    <FileDownloadButton
                      key={fd.filename}
                      filename={fd.filename}
                      base64={fd.base64}
                      contentType={fd.contentType}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : isLast &&
            isStreaming &&
            !hasToolEvents ? (
            <LoadingIndication />
          ) : null}
        </div>
        {!isUser && isLast && isStreaming && hasToolEvents && (
          <AssistantWorkingIndicator toolEvents={msg.toolEvents} />
        )}
      </div>
    </motion.div>
  );
}

export function ChatMessageList({
  messages,
  isStreaming,
  isLoadingHistory,
  onSendSuggestion,
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  if (isLoadingHistory) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide bg-background"
    >
      <div className="mx-auto max-w-3xl flex flex-col gap-6">
        {messages.length === 0 ? (
          <EmptyState onSendSuggestion={onSendSuggestion} />
        ) : (
          messages.map((msg, index) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isLast={index === messages.length - 1}
              isStreaming={isStreaming}
            />
          ))
        )}
      </div>
    </div>
  );
}
