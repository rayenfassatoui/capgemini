'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Streamdown } from 'streamdown';
import { mermaid } from '@streamdown/mermaid';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconMessageChatbot,
  IconX,
  IconSend2,
  IconSparkles,
  IconUser,
  IconTrash,
  IconPlus,
  IconHistory,
  IconArrowLeft,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

const SUGGESTIONS = [
  'What are the top CV skills?',
  'Summarize the pipeline health',
  'Which skills have the biggest gap?',
  'How many interviews this week?',
];

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function StatisticsChat() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && view === 'chat' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, view]);

  // Load conversation list on first open
  useEffect(() => {
    if (!open || conversationsLoaded) return;

    async function loadConversations() {
      try {
        const res = await fetch('/api/chat/statistics');
        if (!res.ok) return;
        const data = (await res.json()) as { conversations: Conversation[] };
        setConversations(data.conversations ?? []);

        // Auto-select the most recent conversation and load its messages
        if (data.conversations?.length > 0) {
          const latest = data.conversations[0];
          setActiveConversationId(latest.id);
          await loadConversationMessages(latest.id);
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

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/chat/statistics?conversationId=${conversationId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: Array<{ id: string; role: string; content: string }>;
      };
      setMessages(
        (data.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
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
      setView('chat');
      await loadConversationMessages(conversationId);
    },
    [isStreaming, loadConversationMessages]
  );

  const createNewChat = useCallback(async () => {
    if (isStreaming) return;
    try {
      const res = await fetch('/api/chat/statistics', { method: 'PUT' });
      if (!res.ok) return;
      const conversation = (await res.json()) as Conversation;
      setConversations((prev) => [conversation, ...prev]);
      setActiveConversationId(conversation.id);
      setMessages([]);
      setView('chat');
    } catch {
      // Silently fail
    }
  }, [isStreaming]);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (isStreaming) return;
      try {
        await fetch(`/api/chat/statistics?conversationId=${conversationId}`, {
          method: 'DELETE',
        });
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));

        // If deleting the active conversation, switch to the next one or clear
        if (activeConversationId === conversationId) {
          const remaining = conversations.filter((c) => c.id !== conversationId);
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
            await loadConversationMessages(remaining[0].id);
          } else {
            setActiveConversationId(null);
            setMessages([]);
          }
        }
      } catch {
        // Silently fail
      }
    },
    [isStreaming, activeConversationId, conversations, loadConversationMessages]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      // If no active conversation, create one first
      let convId = activeConversationId;
      if (!convId) {
        try {
          const res = await fetch('/api/chat/statistics', { method: 'PUT' });
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
        role: 'user',
        content: trimmed,
      };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput('');
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await fetch('/api/chat/statistics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: convId, messages: history }),
          signal: controller.signal,
        });

        if (!response.ok) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content: `Sorry, I couldn't process that request. ${response.status === 401 ? 'Please sign in again.' : response.status === 403 ? 'Access denied.' : 'Please try again.'}`,
                  }
                : m
            )
          );
          setIsStreaming(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response stream');
        }

        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });
          const content = accumulated;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content } : m
            )
          );
        }

        accumulated += decoder.decode();
        if (accumulated) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: accumulated } : m
            )
          );
        }

        // Update conversation title in the list (first user msg becomes title)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  title:
                    c.title === 'New Chat' || c.title === 'Analytics Chat'
                      ? trimmed.length > 40
                        ? trimmed.slice(0, 40) + '...'
                        : trimmed
                      : c.title,
                  updatedAt: new Date().toISOString(),
                }
              : c
          )
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content:
                    'An error occurred while generating the response. Please try again.',
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, messages, activeConversationId]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return (
    <>
      {/* Floating toggle button */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={() => setOpen(true)}
              className="h-12 w-12 rounded-full shadow-lg"
              aria-label="Open AI analytics assistant"
            >
              <IconMessageChatbot className="size-5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed bottom-6 right-6 z-50 flex w-[420px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            style={{ height: 'min(600px, calc(100vh - 3rem))' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2.5">
                {view === 'history' ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setView('chat')}
                    aria-label="Back to chat"
                  >
                    <IconArrowLeft className="size-4" />
                  </Button>
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                    <IconSparkles className="size-4 text-primary" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground leading-none">
                    {view === 'history' ? 'Chat History' : 'Analytics Assistant'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {view === 'history'
                      ? `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`
                      : 'Ask about your recruitment data'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {view === 'chat' && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={createNewChat}
                      disabled={isStreaming}
                      aria-label="New conversation"
                    >
                      <IconPlus className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setView('history')}
                      disabled={isStreaming}
                      aria-label="Chat history"
                    >
                      <IconHistory className="size-4" />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setOpen(false)}
                  aria-label="Close chat"
                >
                  <IconX className="size-4" />
                </Button>
              </div>
            </div>

            {/* History view */}
            {view === 'history' && (
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <IconHistory className="size-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No conversations yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={createNewChat}
                      className="mt-1"
                    >
                      <IconPlus className="size-3.5 mr-1.5" />
                      Start a new chat
                    </Button>
                  </div>
                ) : (
                  <div className="py-1">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={cn(
                          'group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50',
                          activeConversationId === conv.id && 'bg-muted/60'
                        )}
                        onClick={() => switchConversation(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') switchConversation(conv.id);
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
                            deleteConversation(conv.id);
                          }}
                          aria-label="Delete conversation"
                        >
                          <IconTrash className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chat view */}
            {view === 'chat' && (
              <>
                {/* Messages area */}
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
                >
                  {isLoadingHistory ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <IconSparkles className="size-5 text-muted-foreground" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">
                          What would you like to know?
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Ask questions about CVs, jobs, pipeline, interviews, or
                          skill gaps
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                        {SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => sendMessage(suggestion)}
                            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isLast =
                        idx === messages.length - 1 &&
                        msg.role === 'assistant';

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            'flex gap-2.5',
                            msg.role === 'user'
                              ? 'justify-end'
                              : 'justify-start'
                          )}
                        >
                          {msg.role === 'assistant' && (
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 mt-0.5">
                              <IconSparkles className="size-3.5 text-primary" />
                            </div>
                          )}

                          <div
                            className={cn(
                              'max-w-[85%] rounded-lg px-3 py-2',
                              msg.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/50'
                            )}
                          >
                            {msg.role === 'user' ? (
                              <p className="text-sm whitespace-pre-wrap">
                                {msg.content}
                              </p>
                            ) : msg.content ? (
                              <div className="text-sm [&_p]:leading-relaxed [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_ul]:ml-4 [&_ol]:ml-4 [&_li]:text-sm [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium [&_pre]:text-xs [&_code]:text-xs">
                                <Streamdown
                                  plugins={{ mermaid }}
                                  isAnimating={isLast && isStreaming}
                                >
                                  {msg.content}
                                </Streamdown>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 py-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
                              </div>
                            )}
                          </div>

                          {msg.role === 'user' && (
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted mt-0.5">
                              <IconUser className="size-3.5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Input area */}
                <div className="border-t border-border p-3">
                  {isStreaming && (
                    <div className="flex justify-center mb-2">
                      <button
                        type="button"
                        onClick={handleStop}
                        className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                      >
                        Stop generating
                      </button>
                    </div>
                  )}
                  <form
                    onSubmit={handleSubmit}
                    className="flex items-end gap-2"
                  >
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about your data..."
                      disabled={isStreaming}
                      rows={1}
                      className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                      style={{ maxHeight: '120px' }}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      disabled={!input.trim() || isStreaming}
                      aria-label="Send message"
                    >
                      <IconSend2 className="size-4" />
                    </Button>
                  </form>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
