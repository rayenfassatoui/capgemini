"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconMessageChatbot } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

import type {
  ChatView,
  ChatMessage,
  Conversation,
  ToolEvent,
  FileDownload,
  ChatResponseMetadata,
} from "./chat/chat-types";
import { ChatHeader } from "./chat/chat-header";
import { ChatHistory } from "./chat/chat-history";
import { ChatMessageList } from "./chat/chat-message-list";
import { ChatInput } from "./chat/chat-input";

export function StatisticsChat() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ChatView>("chat");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load conversation list on first open
  useEffect(() => {
    if (!open || conversationsLoaded) return;

    async function loadConversations() {
      try {
        const res = await fetch("/api/chat/statistics");
        if (!res.ok) return;
        const data = (await res.json()) as { conversations: Conversation[] };
        setConversations(data.conversations ?? []);

        if (data.conversations?.length > 0) {
          const latest = data.conversations[0];
          setActiveConversationId(latest.id);
          await loadMessages(latest.id);
        }
      } catch {
        // Silently fail
      } finally {
        setConversationsLoaded(true);
      }
    }

    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationsLoaded]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/chat/statistics?conversationId=${conversationId}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: Array<{ id: string; role: string; content: string }>;
      };
      setMessages(
        (data.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      );
    } catch {
      setMessages([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const switchConversation = useCallback(
    async (conversationId: string) => {
      if (isStreaming) return;
      setActiveConversationId(conversationId);
      setView("chat");
      await loadMessages(conversationId);
    },
    [isStreaming, loadMessages],
  );

  const createNewChat = useCallback(async () => {
    if (isStreaming) return;
    try {
      const res = await fetch("/api/chat/statistics", { method: "PUT" });
      if (!res.ok) return;
      const conversation = (await res.json()) as Conversation;
      setConversations((prev) => [conversation, ...prev]);
      setActiveConversationId(conversation.id);
      setMessages([]);
      setView("chat");
    } catch {
      // Silently fail
    }
  }, [isStreaming]);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (isStreaming) return;
      try {
        await fetch(`/api/chat/statistics?conversationId=${conversationId}`, {
          method: "DELETE",
        });
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));

        if (activeConversationId === conversationId) {
          const remaining = conversations.filter(
            (c) => c.id !== conversationId,
          );
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
            await loadMessages(remaining[0].id);
          } else {
            setActiveConversationId(null);
            setMessages([]);
          }
        }
      } catch {
        // Silently fail
      }
    },
    [isStreaming, activeConversationId, conversations, loadMessages],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed =
        text.trim() ||
        (attachedFile ? `Upload and process ${attachedFile.name}` : "");
      if (!trimmed || isStreaming) return;

      // Auto-create conversation if none active
      let convId = activeConversationId;
      if (!convId) {
        try {
          const res = await fetch("/api/chat/statistics", { method: "PUT" });
          if (!res.ok) return;
          const conversation = (await res.json()) as Conversation;
          setConversations((prev) => [conversation, ...prev]);
          setActiveConversationId(conversation.id);
          convId = conversation.id;
        } catch {
          return;
        }
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        attachments: attachedFile
          ? [
              {
                filename: attachedFile.name,
                size: attachedFile.size,
                contentType: attachedFile.type || "application/octet-stream",
              },
            ]
          : undefined,
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsStreaming(true);

      // Read attached file to base64
      let attachments:
        | Array<{
            filename: string;
            contentType: string;
            size: number;
            rawBytes: string;
          }>
        | undefined;
      if (attachedFile) {
        const fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(attachedFile);
        });
        attachments = [
          {
            filename: attachedFile.name,
            contentType: attachedFile.type || "application/octet-stream",
            size: attachedFile.size,
            rawBytes: fileData,
          },
        ];
        setAttachedFile(null);
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await fetch("/api/chat/statistics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: convId,
            messages: history,
            ...(attachments ? { attachments } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content: `Sorry, I couldn't process that request. ${response.status === 401 ? "Please sign in again." : response.status === 403 ? "Access denied." : "Please try again."}`,
                  }
                : m,
            ),
          );
          setIsStreaming(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response stream");
        }

        const decoder = new TextDecoder();
        let accumulated = "";
        let textContent = "";
        let metadataAccum: ChatResponseMetadata | undefined;
        const toolEventsAccum: ToolEvent[] = [];
        const fileDownloadsAccum: FileDownload[] = [];

        const mergeToolEvent = (evt: ToolEvent) => {
          const idx = toolEventsAccum.findIndex(
            (existing) => existing.id === evt.id,
          );
          if (idx === -1) {
            toolEventsAccum.push(evt);
            return;
          }

          toolEventsAccum[idx] = {
            ...toolEventsAccum[idx],
            ...evt,
            input: evt.input ?? toolEventsAccum[idx].input,
            output: evt.output ?? toolEventsAccum[idx].output,
            retry: evt.retry ?? toolEventsAccum[idx].retry,
            startedAt: evt.startedAt ?? toolEventsAccum[idx].startedAt,
            endedAt: evt.endedAt ?? toolEventsAccum[idx].endedAt,
            durationMs: evt.durationMs ?? toolEventsAccum[idx].durationMs,
          };
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });

          const lines = accumulated.split("\n");
          accumulated = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("@@TOOL_START@@")) {
              try {
                const payload = JSON.parse(
                  line.slice("@@TOOL_START@@".length),
                ) as {
                  id?: string;
                  tool: string;
                  args?: Record<string, unknown>;
                  input?: ToolEvent["input"];
                  status?: ToolEvent["status"];
                  summary?: string;
                  purpose?: string;
                  startedAt?: string;
                  retry?: ToolEvent["retry"];
                };
                const evt: ToolEvent = {
                  id: payload.id ?? crypto.randomUUID(),
                  tool: payload.tool,
                  status: payload.status ?? "running",
                  summary: payload.summary,
                  purpose: payload.purpose,
                  startedAt: payload.startedAt ?? new Date().toISOString(),
                  input:
                    payload.input ??
                    (payload.args as ToolEvent["input"] | undefined),
                  retry: payload.retry,
                };
                mergeToolEvent(evt);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, toolEvents: [...toolEventsAccum] }
                      : m,
                  ),
                );
              } catch {
                // malformed tool start
              }
            } else if (line.startsWith("@@TOOL_END@@")) {
              try {
                const payload = JSON.parse(
                  line.slice("@@TOOL_END@@".length),
                ) as {
                  id?: string;
                  tool: string;
                  success: boolean;
                  status?: ToolEvent["status"];
                  summary: string;
                  purpose?: string;
                  startedAt?: string;
                  endedAt?: string;
                  durationMs?: number;
                  input?: ToolEvent["input"];
                  output?: ToolEvent["output"];
                  error?: string;
                  retry?: ToolEvent["retry"];
                };
                const idx = toolEventsAccum.findIndex((e) =>
                  payload.id
                    ? e.id === payload.id
                    : e.tool === payload.tool && e.status === "running",
                );
                const endedAt = payload.endedAt ?? new Date().toISOString();
                const startedAt =
                  payload.startedAt ??
                  (idx !== -1 ? toolEventsAccum[idx].startedAt : undefined);
                const computedDuration =
                  typeof payload.durationMs === "number"
                    ? payload.durationMs
                    : startedAt
                      ? Math.max(
                          0,
                          new Date(endedAt).getTime() -
                            new Date(startedAt).getTime(),
                        )
                      : undefined;

                mergeToolEvent({
                  id: payload.id ?? crypto.randomUUID(),
                  tool: payload.tool,
                  status:
                    payload.status ?? (payload.success ? "success" : "error"),
                  summary: payload.summary,
                  purpose:
                    payload.purpose ??
                    (idx !== -1 ? toolEventsAccum[idx].purpose : undefined),
                  startedAt,
                  endedAt,
                  durationMs: computedDuration,
                  input:
                    payload.input ??
                    (idx !== -1 ? toolEventsAccum[idx].input : undefined),
                  output: payload.output,
                  error: payload.error,
                  retry:
                    payload.retry ??
                    (idx !== -1 ? toolEventsAccum[idx].retry : undefined),
                });
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, toolEvents: [...toolEventsAccum] }
                      : m,
                  ),
                );
              } catch {
                // malformed tool end
              }
            } else if (line.startsWith("@@FILE@@")) {
              try {
                const payload = JSON.parse(
                  line.slice("@@FILE@@".length),
                ) as FileDownload;
                fileDownloadsAccum.push(payload);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, fileDownloads: [...fileDownloadsAccum] }
                      : m,
                  ),
                );
              } catch {
                // malformed file event
              }
            } else if (line.startsWith("@@META@@")) {
              try {
                metadataAccum = {
                  ...metadataAccum,
                  ...(JSON.parse(
                    line.slice("@@META@@".length),
                  ) as ChatResponseMetadata),
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, metadata: metadataAccum }
                      : m,
                  ),
                );
              } catch {
                // malformed metadata event
              }
            } else {
              textContent += line + "\n";
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: textContent } : m,
                ),
              );
            }
          }
        }

        if (
          accumulated &&
          !accumulated.startsWith("@@TOOL_") &&
          !accumulated.startsWith("@@FILE@@") &&
          !accumulated.startsWith("@@META@@")
        ) {
          textContent += accumulated;
        }

        if (textContent || fileDownloadsAccum.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content: textContent,
                    toolEvents:
                      toolEventsAccum.length > 0
                        ? [...toolEventsAccum]
                        : undefined,
                    fileDownloads:
                      fileDownloadsAccum.length > 0
                        ? [...fileDownloadsAccum]
                        : undefined,
                    metadata: metadataAccum,
                  }
                : m,
            ),
          );
        }

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  title:
                    c.title === "New Chat" || c.title === "Analytics Chat"
                      ? trimmed.length > 40
                        ? trimmed.slice(0, 40) + "..."
                        : trimmed
                      : c.title,
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content:
                    "An error occurred while generating the response. Please try again.",
                }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, messages, activeConversationId, attachedFile],
  );

  return (
    <>
      {/* Floating toggle button */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className="relative group">
              <div className="absolute -inset-0.5 rounded-full bg-linear-to-r from-primary via-indigo-500 to-purple-600 opacity-75 blur-sm transition duration-500 group-hover:opacity-100 group-hover:blur-md animate-pulse-slow" />
              <Button
                onClick={() => setOpen(true)}
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-primary to-indigo-600 text-white shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-primary/25 border border-white/10"
                aria-label="Open AI analytics assistant"
              >
                <IconMessageChatbot className="size-7" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-50 flex w-105 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-white/8 backdrop-blur-xl bg-card/70 shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1 ring-primary/10"
            style={{ height: "min(600px, calc(100vh - 3rem))" }}
          >
            <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-primary/5 to-transparent pointer-events-none" />
            <ChatHeader
              view={view}
              conversations={conversations}
              isStreaming={isStreaming}
              onSetView={setView}
              onNewChat={createNewChat}
              onClose={() => setOpen(false)}
            />

            {view === "history" && (
              <div className="flex-1 overflow-y-auto">
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
                  onAttachFile={setAttachedFile}
                  onRemoveFile={() => setAttachedFile(null)}
                />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
