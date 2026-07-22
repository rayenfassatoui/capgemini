"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHAT_CHART_EVENT_PREFIX,
  extractChatChartsFromContent,
  normalizeRecruitmentAnalyticsChart,
  parseChatChartEvent,
} from "../../chat-chart-events";
import {
  CHAT_RESPONSE_CARD_EVENT_PREFIX,
  extractChatResponseCardsFromContent,
  normalizeRecruitmentResponseCard,
  parseChatResponseCardEvent,
} from "../../chat-card-events";
import {
  CHAT_ARTIFACT_EVENT_PREFIX,
  chatHistoryResponseSchema,
  extractChatArtifactsFromContent,
} from "../../chat-artifact-events";
import type { RecruitmentAnalyticsChart, RecruitmentResponseCard } from "../../types";
import { useTranslation } from "@/components/shared/i18n-provider";
import { localizeAgentToolName } from "../../agent-localization";

import type { AgentReference } from "./agent-prompts";
import type {
  AgentActionConfirmation,
  ChatMessage,
  ChatResponseMetadata,
  ChatView,
  Conversation,
  FileDownload,
  ToolEvent,
} from "./chat-types";
function upsertChart(
  charts: RecruitmentAnalyticsChart[],
  chart: RecruitmentAnalyticsChart,
) {
  const index = charts.findIndex((item) => item.id === chart.id);
  if (index === -1) {
    charts.push(chart);
    return;
  }

  charts[index] = chart;
}
function upsertCard(
  cards: RecruitmentResponseCard[],
  card: RecruitmentResponseCard,
) {
  const index = cards.findIndex((item) => item.id === card.id);
  if (index === -1) {
    cards.push(card);
    return;
  }

  cards[index] = card;
}


function normalizeMetadataCharts(value: unknown): RecruitmentAnalyticsChart[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const charts: RecruitmentAnalyticsChart[] = [];
  for (const item of value) {
    const chart = normalizeRecruitmentAnalyticsChart(item);
    if (chart) {
      upsertChart(charts, chart);
    }
  }

  return charts;
}
function normalizeMetadataCards(value: unknown): RecruitmentResponseCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cards: RecruitmentResponseCard[] = [];
  for (const item of value) {
    const card = normalizeRecruitmentResponseCard(item);
    if (card) {
      upsertCard(cards, card);
    }
  }

  return cards;
}
const MAX_ACTIVE_REFERENCES = 5;


interface UseStatisticsChatControllerOptions {
  enabled: boolean;
  references?: AgentReference[];
}

export interface StatisticsChatController {
  view: ChatView;
  setView: (view: ChatView) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  input: string;
  isStreaming: boolean;
  isLoadingHistory: boolean;
  attachedFile: File | null;
  references: AgentReference[];
  addReference: (reference: AgentReference) => void;
  setInput: (value: string) => void;
  switchConversation: (conversationId: string) => Promise<void>;
  createNewChat: () => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  handleStop: () => void;
  sendMessage: (text: string, confirmation?: { actionId: string; decision: "confirm" | "cancel" }) => Promise<void>;
  attachFile: (file: File) => void;
  removeFile: () => void;
  removeReference: (reference: AgentReference) => void;
  clearReferences: () => void;
  confirmAction: (confirmation: AgentActionConfirmation, decision: "confirm" | "cancel") => Promise<void>;
}

export function useStatisticsChatController({
  enabled,
  references,
}: UseStatisticsChatControllerOptions): StatisticsChatController {
  const { locale, t } = useTranslation();
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
  const [activeReferences, setActiveReferences] = useState<AgentReference[]>(
    references ?? [],
  );
  const abortRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef<{
    assistantMessageId: string;
    retryPrompt: string;
  } | null>(null);

  const loadMessages = useCallback(async (conversationId: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/chat/statistics?conversationId=${conversationId}`,
      );
      if (!res.ok) return;

      const parsedResponse = chatHistoryResponseSchema.safeParse(await res.json());
      if (!parsedResponse.success) {
        setMessages([]);
        return;
      }

      const actionStatuses = new Map(
        (parsedResponse.data.agentActions ?? []).map((action) => [
          action.id,
          action.status,
        ]),
      );

      const hydratedMessages = parsedResponse.data.messages.map((message) => {
        const parsedArtifacts = extractChatArtifactsFromContent(message.content);
        const parsedCards = extractChatResponseCardsFromContent(
          parsedArtifacts.content,
        );
        const parsedCharts = extractChatChartsFromContent(parsedCards.content);
        const confirmations = parsedArtifacts.artifacts.confirmations?.map(
          (confirmation) => {
            const persistedStatus = actionStatuses.get(confirmation.id);
            const status =
              persistedStatus === "pending"
                ? "pending"
                : persistedStatus === "confirmed" ||
                    persistedStatus === "executed"
                  ? "confirmed"
                  : persistedStatus
                    ? "cancelled"
                    : confirmation.status;

            return {
              ...confirmation,
              status,
            } satisfies AgentActionConfirmation;
          },
        );
        const metadata = parsedArtifacts.artifacts.metadata;

        return {
          id: message.id,
          role: message.role,
          content: parsedCharts.content,
          toolEvents: parsedArtifacts.artifacts.toolEvents,
          attachments: parsedArtifacts.artifacts.attachments,
          references: parsedArtifacts.artifacts.references,
          fileDownloads: parsedArtifacts.artifacts.fileDownloads,
          confirmations,
          charts:
            parsedCharts.charts.length > 0
              ? parsedCharts.charts
              : normalizeMetadataCharts(metadata?.charts),
          cards:
            parsedCards.cards.length > 0
              ? parsedCards.cards
              : normalizeMetadataCards(metadata?.cards),
          metadata,
        } satisfies ChatMessage;
      });

      const seenConfirmationIds = new Set<string>();
      setMessages(
        hydratedMessages.map((message) => ({
          ...message,
          confirmations: message.confirmations?.filter((confirmation) => {
            if (seenConfirmationIds.has(confirmation.id)) return false;
            seenConfirmationIds.add(confirmation.id);
            return true;
          }),
        })),
      );
    } catch {
      setMessages([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    setActiveReferences(references ?? []);
  }, [references]);

  const addReference = useCallback((nextReference: AgentReference) => {
    setActiveReferences((currentReferences) => {
      if (
        currentReferences.some(
          (currentReference) =>
            currentReference.type === nextReference.type &&
            currentReference.id === nextReference.id,
        )
      ) {
        return currentReferences;
      }

      return [...currentReferences, nextReference].slice(0, MAX_ACTIVE_REFERENCES);
    });
  }, []);

  const removeReference = useCallback((referenceToRemove: AgentReference) => {
    setActiveReferences((currentReferences) =>
      currentReferences.filter(
        (currentReference) =>
          currentReference.type !== referenceToRemove.type ||
          currentReference.id !== referenceToRemove.id,
      ),
    );
  }, []);

  const clearReferences = useCallback(() => {
    setActiveReferences([]);
  }, []);

  useEffect(() => {
    if (!enabled || conversationsLoaded) return;

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
        setConversations([]);
      } finally {
        setConversationsLoaded(true);
      }
    }

    void loadConversations();
  }, [enabled, conversationsLoaded, loadMessages]);

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
      // Conversation creation failure leaves the current chat untouched.
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
          const remaining = conversations.filter((c) => c.id !== conversationId);
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
            await loadMessages(remaining[0].id);
          } else {
            setActiveConversationId(null);
            setMessages([]);
          }
        }
      } catch {
        // Deletion failure keeps local state unchanged.
      }
    },
    [isStreaming, activeConversationId, conversations, loadMessages],
  );

  const handleStop = useCallback(() => {
    const activeRequest = activeRequestRef.current;
    const controller = abortRef.current;
    controller?.abort();
    if (abortRef.current === controller) {
      abortRef.current = null;
    }
    if (activeRequestRef.current === activeRequest) {
      activeRequestRef.current = null;
    }

    if (activeRequest) {
      const endedAt = new Date().toISOString();
      setMessages((previousMessages) =>
        previousMessages.map((message) =>
          message.id === activeRequest.assistantMessageId
            ? {
                ...message,
                content: message.content || t("agent.stoppedFallback"),
                toolEvents: message.toolEvents?.map((event) =>
                  event.status === "queued" || event.status === "running"
                    ? {
                        ...event,
                        status: "error",
                        summary: t("agent.stoppedByUser"),
                        error: t("agent.generationStoppedByUser"),
                        endedAt,
                      }
                    : event,
                ),
                deliveryStatus: "stopped",
                retryPrompt: activeRequest.retryPrompt,
              }
            : message,
        ),
      );
    }
    setIsStreaming(false);
  }, [t]);

  const sendMessage = useCallback(
    async (text: string, confirmationRequest?: { actionId: string; decision: "confirm" | "cancel" }) => {
      const trimmed =
        text.trim() ||
        (attachedFile
          ? `Upload and process ${attachedFile.name}`
          : activeReferences.length === 1
            ? `Review referenced CV: ${activeReferences[0].title}`
            : activeReferences.length > 1
              ? `Review referenced CVs: ${activeReferences.map((item) => item.title).join(", ")}`
              : "");
      if (!trimmed || isStreaming) return;

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
        references: activeReferences.length > 0 ? activeReferences : undefined,
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      activeRequestRef.current = {
        assistantMessageId: assistantMsg.id,
        retryPrompt: trimmed,
      };

      try {

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
      if (controller.signal.aborted) return;

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
            locale,
            ...(attachments ? { attachments } : {}),
            ...(confirmationRequest ? { confirmation: confirmationRequest } : {}),
            ...(activeReferences.length > 0 ? { references: activeReferences } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content: `${t("agent.requestProblem")} ${t(response.status === 401 ? "agent.signInAgain" : response.status === 403 ? "agent.accessDenied" : "agent.tryAgain")}`,
                    deliveryStatus: "error",
                    retryPrompt: confirmationRequest ? undefined : trimmed,
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
        const chartsAccum: RecruitmentAnalyticsChart[] = [];
        const cardsAccum: RecruitmentResponseCard[] = [];
        const confirmationsAccum: AgentActionConfirmation[] = [];

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
                // Ignore malformed tool events from partial chunks.
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
                // Ignore malformed tool events from partial chunks.
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
                // Ignore malformed file events from partial chunks.
              }
            } else if (line.startsWith("@@CONFIRMATION@@")) {
              try {
                const payload = JSON.parse(
                  line.slice("@@CONFIRMATION@@".length),
                ) as {
                  id: string;
                  toolName: string;
                  summary: string;
                  args: AgentActionConfirmation["args"];
                  expiresAt: string;
                };
                confirmationsAccum.push({
                  id: payload.id,
                  toolName: payload.toolName,
                  summary: payload.summary,
                  args: payload.args,
                  expiresAt: payload.expiresAt,
                  status: "pending",
                });
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, confirmations: [...confirmationsAccum] }
                      : m,
                  ),
                );
              } catch {
                // Ignore malformed confirmation events from partial chunks.
              }
            } else if (line.startsWith("@@META@@")) {
              try {
                const parsedMetadata = JSON.parse(
                  line.slice("@@META@@".length),
                ) as ChatResponseMetadata;
                metadataAccum = {
                  ...metadataAccum,
                  ...parsedMetadata,
                };

                for (const chart of normalizeMetadataCharts(
                  parsedMetadata.charts,
                )) {
                  upsertChart(chartsAccum, chart);
                }
                for (const card of normalizeMetadataCards(
                  parsedMetadata.cards,
                )) {
                  upsertCard(cardsAccum, card);
                }


                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          metadata: metadataAccum,
                          charts:
                            chartsAccum.length > 0
                              ? [...chartsAccum]
                              : m.charts,
                          cards:
                            cardsAccum.length > 0
                              ? [...cardsAccum]
                              : m.cards,
                        }
                      : m,
                  ),
                );
              } catch {
                // Ignore malformed metadata events from partial chunks.
              }
            } else if (line.startsWith(CHAT_CHART_EVENT_PREFIX)) {
              const chart = parseChatChartEvent(line);
              if (chart) {
                upsertChart(chartsAccum, chart);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, charts: [...chartsAccum] }
                      : m,
                  ),
                );
              }
            } else if (line.startsWith(CHAT_RESPONSE_CARD_EVENT_PREFIX)) {
              const card = parseChatResponseCardEvent(line);
              if (card) {
                upsertCard(cardsAccum, card);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, cards: [...cardsAccum] }
                      : m,
                  ),
                );
              }
            } else if (line.startsWith(CHAT_ARTIFACT_EVENT_PREFIX)) {
              // Persisted history metadata is emitted after the live events above.
              // Ignore it during this stream to avoid rendering or duplicating it.
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

        if (accumulated) {
          if (accumulated.startsWith(CHAT_CHART_EVENT_PREFIX)) {
            const chart = parseChatChartEvent(accumulated);
            if (chart) {
              upsertChart(chartsAccum, chart);
            }
          } else if (accumulated.startsWith(CHAT_RESPONSE_CARD_EVENT_PREFIX)) {
            const card = parseChatResponseCardEvent(accumulated);
            if (card) {
              upsertCard(cardsAccum, card);
            }
          } else if (
            !accumulated.startsWith("@@TOOL_") &&
            !accumulated.startsWith("@@FILE@@") &&
            !accumulated.startsWith("@@META@@") &&
            !accumulated.startsWith("@@CONFIRMATION@@") &&
            !accumulated.startsWith(CHAT_ARTIFACT_EVENT_PREFIX) &&
            !accumulated.startsWith(CHAT_RESPONSE_CARD_EVENT_PREFIX)
          ) {
            textContent += accumulated;
          }
        }

        if (
          textContent ||
          fileDownloadsAccum.length > 0 ||
          chartsAccum.length > 0 ||
          cardsAccum.length > 0 ||
          confirmationsAccum.length > 0
        ) {
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
                    confirmations:
                      confirmationsAccum.length > 0
                        ? [...confirmationsAccum]
                        : undefined,
                    charts:
                      chartsAccum.length > 0 ? [...chartsAccum] : undefined,
                    cards:
                      cardsAccum.length > 0 ? [...cardsAccum] : undefined,
                    deliveryStatus: "complete",
                  }
                : m,
            ),
          );
        }
        if (confirmationRequest) {
          setMessages((previousMessages) =>
            previousMessages.map((message) => ({
              ...message,
              confirmations: message.confirmations?.map((item) =>
                item.id === confirmationRequest.actionId
                  ? {
                      ...item,
                      status:
                        confirmationRequest.decision === "confirm"
                          ? "confirmed"
                          : "cancelled",
                    }
                  : item,
              ),
            })),
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
                  content: t("agent.generationError"),
                  deliveryStatus: "error",
                  retryPrompt: confirmationRequest ? undefined : trimmed,
                }
              : m,
          ),
        );
      } finally {
        if (abortRef.current === controller) {
          setIsStreaming(false);
          abortRef.current = null;
          activeRequestRef.current = null;
        }
      }
    },
    [isStreaming, messages, activeConversationId, attachedFile, activeReferences, locale, t],
  );

  const confirmAction = useCallback(
    async (
      confirmation: AgentActionConfirmation,
      decision: "confirm" | "cancel",
    ) => {
      if (isStreaming || confirmation.status !== "pending") return;

      const verb =
        locale === "fr"
          ? decision === "confirm"
            ? "Confirmer"
            : "Annuler"
          : decision === "confirm"
            ? "Confirm"
            : "Cancel";
      const actionName = localizeAgentToolName(
        confirmation.toolName,
        locale,
      );
      await sendMessage(
        locale === "fr"
          ? `${verb} l'action : ${actionName}`
          : `${verb} action: ${actionName}`,
        {
          actionId: confirmation.id,
          decision,
        },
      );
    },
    [isStreaming, locale, sendMessage],
  );

  return {
    view,
    setView,
    conversations,
    activeConversationId,
    messages,
    input,
    isStreaming,
    isLoadingHistory,
    attachedFile,
    references: activeReferences,
    setInput,
    switchConversation,
    createNewChat,
    deleteConversation,
    handleStop,
    sendMessage,
    attachFile: setAttachedFile,
    removeFile: () => setAttachedFile(null),
    confirmAction,
    addReference,
    removeReference,
    clearReferences,
  };
}
