'use client';

import { useRef, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  IconChevronRight,
  IconFile,
  IconFileSearch,
  IconLoader2,
  IconPaperclip,
  IconPlayerStopFilled,
  IconSend2,
  IconSparkles,
  IconX,
} from '@tabler/icons-react';
import { listCvReferenceOptionsAction } from '../../actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AgentReferenceChip } from './agent-reference-chip';
import type { AgentReference } from './agent-prompts';
import type { AgentCvReferenceOption } from '../../types';

const TEXTAREA_MIN_HEIGHT_PX = 52;
const TEXTAREA_MAX_HEIGHT_PX = 640;
const TEXTAREA_MAX_VIEWPORT_RATIO = 0.72;

type SlashCommandKind = 'root' | 'cv' | 'analyse';
type RootCommandId = 'cv' | 'analyse' | 'clear';
type CvLoadState = 'idle' | 'loading' | 'ready' | 'error';

interface SlashCommandState {
  kind: SlashCommandKind;
  query: string;
  replaceStart: number;
  replaceEnd: number;
}

interface AnalysisTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

interface RootCommand {
  id: RootCommandId;
  label: string;
  title: string;
  description: string;
}

const ANALYSIS_TEMPLATES: AnalysisTemplate[] = [
  {
    id: 'cv-strengths',
    title: 'CV strengths and risks',
    description: 'Short recruiter read with caveats and next action.',
    prompt: 'Summarize this CV: strengths, risks, missing evidence, and best-fit job types. Then propose the next TA action.',
  },
  {
    id: 'missing-evidence',
    title: 'Missing evidence',
    description: 'Find gaps before screening or matching.',
    prompt: 'List the missing evidence for this CV. Separate extraction gaps, recruiter follow-up questions, and risk checks.',
  },
  {
    id: 'job-fit',
    title: 'Best-fit job types',
    description: 'Map the CV to realistic role families.',
    prompt: 'Identify the best-fit job types for this CV and explain the evidence, risks, and seniority assumptions.',
  },
  {
    id: 'interview-plan',
    title: 'Interview questions',
    description: 'Generate a targeted first-round screening plan.',
    prompt: 'Generate a targeted first-round interview plan for this CV with technical questions, behavioral checks, red flags, and scoring guidance.',
  },
  {
    id: 'manager-summary',
    title: 'Hiring manager summary',
    description: 'Convert the CV into a concise manager brief.',
    prompt: 'Write a hiring-manager summary for this CV. Keep it concise, evidence-based, and explicit about missing proof.',
  },
];

const ROOT_COMMANDS: RootCommand[] = [
  {
    id: 'cv',
    label: '/cv',
    title: 'Reference CV',
    description: 'Attach a CV as clean context.',
  },
  {
    id: 'analyse',
    label: '/analyse',
    title: 'Analysis templates',
    description: 'Pick the type of agent answer.',
  },
  {
    id: 'clear',
    label: '/clear',
    title: 'Clear reference',
    description: 'Remove the current reference chip.',
  },
];

function getSlashCommandState(value: string, caretIndex: number): SlashCommandState | null {
  const beforeCaret = value.slice(0, caretIndex);
  const match = /(^|\s)\/([a-z]*)(?:\s+([^/\n]*))?$/i.exec(beforeCaret);

  if (!match) return null;

  const commandName = match[2].toLowerCase();
  const query = (match[3] ?? '').trimStart();
  const replaceStart = match.index + match[1].length;

  if (commandName === 'cv') {
    return { kind: 'cv', query, replaceStart, replaceEnd: caretIndex };
  }

  if (commandName === 'analyse' || commandName === 'analyze') {
    return { kind: 'analyse', query, replaceStart, replaceEnd: caretIndex };
  }

  return {
    kind: 'root',
    query: commandName,
    replaceStart,
    replaceEnd: caretIndex,
  };
}

function optionMatchesQuery(option: AgentCvReferenceOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    option.title,
    option.subtitle,
    option.filename,
    option.email ?? '',
    option.phone ?? '',
    ...option.skills,
    ...option.languages,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function buildCvAgentReference(option: AgentCvReferenceOption): AgentReference {
  const facts: AgentReference['facts'] = [
    ...(option.email ? [{ label: 'Email', value: option.email }] : []),
    ...(option.phone ? [{ label: 'Phone', value: option.phone }] : []),
    ...(option.skills.length > 0
      ? [{ label: 'Skills', value: option.skills.slice(0, 5).join(', ') }]
      : []),
    ...(option.languages.length > 0
      ? [{ label: 'Languages', value: option.languages.slice(0, 4).join(', ') }]
      : []),
  ];

  return {
    type: 'cv',
    id: option.id,
    title: option.title,
    subtitle: option.subtitle,
    href: `/ta/cv-pool?reviewCvId=${option.id}`,
    ...(facts.length > 0 ? { facts } : {}),
  };
}

interface ChatInputProps {
  input: string;
  isStreaming: boolean;
  attachedFile: File | null;
  reference: AgentReference | null;
  variant?: 'panel' | 'workspace';
  onInputChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttachFile: (file: File) => void;
  onRemoveFile: () => void;
  onSetReference: (reference: AgentReference) => void;
  onRemoveReference: () => void;
}

export function ChatInput({
  input,
  isStreaming,
  attachedFile,
  reference,
  onInputChange,
  variant = 'panel',
  onSend,
  onStop,
  onAttachFile,
  onRemoveFile,
  onSetReference,
  onRemoveReference,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousInputRef = useRef(input);
  const [caretIndex, setCaretIndex] = useState(input.length);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [cvOptions, setCvOptions] = useState<AgentCvReferenceOption[]>([]);
  const [cvLoadState, setCvLoadState] = useState<CvLoadState>('idle');

  const boundedCaretIndex = Math.min(caretIndex, input.length);
  const commandState = useMemo(
    () => getSlashCommandState(input, boundedCaretIndex),
    [boundedCaretIndex, input],
  );

  const rootOptions = useMemo(() => {
    if (commandState?.kind !== 'root') return [];

    const query = commandState.query.toLowerCase();
    return ROOT_COMMANDS.filter((command) => {
      if (command.id === 'clear' && !reference) return false;
      if (!query) return true;

      return (
        command.id.includes(query) ||
        command.label.includes(query) ||
        command.title.toLowerCase().includes(query)
      );
    });
  }, [commandState, reference]);

  const visibleCvOptions = useMemo(() => {
    if (commandState?.kind !== 'cv') return [];
    return cvOptions
      .filter((option) => optionMatchesQuery(option, commandState.query))
      .slice(0, 8);
  }, [commandState, cvOptions]);

  const visibleAnalysisTemplates = useMemo(() => {
    if (commandState?.kind !== 'analyse') return [];

    const query = commandState.query.toLowerCase();
    return ANALYSIS_TEMPLATES.filter((template) => {
      if (!query) return true;

      return (
        template.title.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query)
      );
    });
  }, [commandState]);

  const commandOptionCount =
    commandState?.kind === 'root'
      ? rootOptions.length
      : commandState?.kind === 'cv'
        ? visibleCvOptions.length
        : commandState?.kind === 'analyse'
          ? visibleAnalysisTemplates.length
          : 0;
  const safeActiveCommandIndex =
    commandOptionCount === 0
      ? 0
      : Math.min(activeCommandIndex, commandOptionCount - 1);

  const resizeTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;

    textarea.style.height = 'auto';

    const maxHeight = Math.min(
      TEXTAREA_MAX_HEIGHT_PX,
      Math.max(TEXTAREA_MIN_HEIGHT_PX, window.innerHeight * TEXTAREA_MAX_VIEWPORT_RATIO),
    );
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, TEXTAREA_MIN_HEIGHT_PX),
      maxHeight,
    );

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  const loadCvOptions = useCallback(() => {
    if (cvLoadState === 'loading' || cvLoadState === 'ready') return;

    setCvLoadState('loading');
    listCvReferenceOptionsAction()
      .then((options) => {
        setCvOptions(options);
        setCvLoadState('ready');
      })
      .catch(() => {
        setCvOptions([]);
        setCvLoadState('error');
      });
  }, [cvLoadState]);

  const replaceCommandSegment = useCallback(
    (replacement: string) => {
      if (!commandState) return;

      const before = input.slice(0, commandState.replaceStart);
      const after = input.slice(commandState.replaceEnd);
      const beforeSpacer = replacement && before && !/\s$/.test(before) ? ' ' : '';
      const afterSpacer = replacement && after && !/^\s/.test(after) ? ' ' : '';
      const nextValue = `${before}${beforeSpacer}${replacement}${afterSpacer}${after}`;
      const nextCaretIndex = before.length + beforeSpacer.length + replacement.length;

      onInputChange(nextValue);
      setCaretIndex(nextCaretIndex);

      window.requestAnimationFrame(() => {
        const textarea = inputRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(nextCaretIndex, nextCaretIndex);
        resizeTextarea(textarea);
      });
    },
    [commandState, input, onInputChange, resizeTextarea],
  );

  const handleRootCommandSelect = useCallback(
    (command: RootCommand) => {
      if (command.id === 'cv') {
        replaceCommandSegment('/cv ');
        loadCvOptions();
        return;
      }

      if (command.id === 'analyse') {
        replaceCommandSegment('/analyse ');
        return;
      }

      onRemoveReference();
      replaceCommandSegment('');
    },
    [loadCvOptions, onRemoveReference, replaceCommandSegment],
  );

  const handleCvOptionSelect = useCallback(
    (option: AgentCvReferenceOption) => {
      onSetReference(buildCvAgentReference(option));
      replaceCommandSegment('');
    },
    [onSetReference, replaceCommandSegment],
  );

  const handleTemplateSelect = useCallback(
    (template: AnalysisTemplate) => {
      replaceCommandSegment(template.prompt);
    },
    [replaceCommandSegment],
  );

  const selectActiveCommandOption = useCallback(() => {
    if (!commandState || commandOptionCount === 0) return false;

    if (commandState.kind === 'root') {
      const command = rootOptions[safeActiveCommandIndex];
      if (!command) return false;
      handleRootCommandSelect(command);
      return true;
    }

    if (commandState.kind === 'cv') {
      const option = visibleCvOptions[safeActiveCommandIndex];
      if (!option) return false;
      handleCvOptionSelect(option);
      return true;
    }

    const template = visibleAnalysisTemplates[safeActiveCommandIndex];
    if (!template) return false;
    handleTemplateSelect(template);
    return true;
  }, [
    safeActiveCommandIndex,
    commandOptionCount,
    commandState,
    handleCvOptionSelect,
    handleRootCommandSelect,
    handleTemplateSelect,
    rootOptions,
    visibleAnalysisTemplates,
    visibleCvOptions,
  ]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (commandState) {
        selectActiveCommandOption();
        return;
      }
      onSend(input);
    },
    [commandState, input, onSend, selectActiveCommandOption],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (commandState) {
        if (e.key === 'ArrowDown' && commandOptionCount > 0) {
          e.preventDefault();
          setActiveCommandIndex((current) => (current + 1) % commandOptionCount);
          return;
        }

        if (e.key === 'ArrowUp' && commandOptionCount > 0) {
          e.preventDefault();
          setActiveCommandIndex((current) =>
            current === 0 ? commandOptionCount - 1 : current - 1,
          );
          return;
        }

        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          if (commandOptionCount > 0) {
            selectActiveCommandOption();
          }
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          replaceCommandSegment('');
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend(input);
      }
    },
    [
      commandOptionCount,
      commandState,
      input,
      onSend,
      replaceCommandSegment,
      selectActiveCommandOption,
    ],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextCaretIndex = e.currentTarget.selectionStart ?? e.currentTarget.value.length;
      const nextCommandState = getSlashCommandState(e.currentTarget.value, nextCaretIndex);

      onInputChange(e.currentTarget.value);
      setCaretIndex(nextCaretIndex);
      setActiveCommandIndex(0);
      if (nextCommandState?.kind === 'cv') {
        loadCvOptions();
      }
      resizeTextarea(e.currentTarget);
    },
    [loadCvOptions, onInputChange, resizeTextarea],
  );

  const handleCaretChange = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    setCaretIndex(textarea.selectionStart ?? textarea.value.length);
  }, []);


  useEffect(() => {
    const previousInput = previousInputRef.current;
    previousInputRef.current = input;
    if (!input.trim() || previousInput.trim() || isStreaming) return;
    const textarea = inputRef.current;
    if (!textarea || document.activeElement === textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [input, isStreaming]);

  useLayoutEffect(() => {
    resizeTextarea(inputRef.current);
  }, [input, resizeTextarea]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return;
      onAttachFile(file);
      e.target.value = '';
    },
    [onAttachFile],
  );

  return (
    <div className={cn("relative p-6 pt-0", variant === 'workspace' ? "bg-transparent" : "bg-background")}>
      <div className={cn("mx-auto", variant === 'workspace' ? "max-w-4xl" : "max-w-3xl")}>
        {attachedFile && (
          <div className="flex items-center gap-3 mb-4 rounded-[12px] border border-border bg-card p-3 shadow-sm transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] translate-y-0 opacity-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <IconFile className="size-4 stroke-[1.5] text-primary" />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[14px] font-medium text-card-foreground truncate">
                {attachedFile.name}
              </span>
              <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                {Math.round(attachedFile.size / 1024)} KB
              </span>
            </div>
            <button
              type="button"
              onClick={onRemoveFile}
              className="shrink-0 rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-300"
              aria-label="Remove attached file"
            >
              <IconX className="size-4 stroke-[1.5]" />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleFileChange}
        />

        {commandState && (
          <div
            role="listbox"
            aria-label="Agent slash commands"
            className="mb-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-foreground/5 ring-1 ring-foreground/5"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {commandState.kind === 'analyse' ? (
                    <IconSparkles className="size-4" />
                  ) : (
                    <IconFileSearch className="size-4" />
                  )}
                </span>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {commandState.kind === 'cv'
                      ? 'Reference a CV'
                      : commandState.kind === 'analyse'
                        ? 'Choose analysis type'
                        : 'Agent commands'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    ↑↓ navigate · Enter select · Esc close
                  </p>
                </div>
              </div>
              <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                /
              </span>
            </div>

            {commandState.kind === 'root' && (
              <div className="max-h-72 overflow-y-auto p-1.5">
                {rootOptions.length > 0 ? (
                  rootOptions.map((command, index) => (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={index === safeActiveCommandIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveCommandIndex(index)}
                      onClick={() => handleRootCommandSelect(command)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                        index === safeActiveCommandIndex
                          ? 'bg-primary/10 text-foreground'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
                        {command.id === 'cv' ? (
                          <IconFileSearch className="size-4" />
                        ) : command.id === 'analyse' ? (
                          <IconSparkles className="size-4" />
                        ) : (
                          <IconX className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {command.label}
                          </span>
                          <span className="text-sm font-medium">{command.title}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {command.description}
                        </span>
                      </span>
                      <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No command matches this shortcut.
                  </p>
                )}
              </div>
            )}

            {commandState.kind === 'cv' && (
              <div className="max-h-80 overflow-y-auto p-1.5">
                {cvLoadState === 'loading' && (
                  <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <IconLoader2 className="size-4 animate-spin" />
                    Loading CV references...
                  </div>
                )}

                {cvLoadState === 'error' && (
                  <p className="px-3 py-6 text-center text-sm text-destructive">
                    Could not load CV references.
                  </p>
                )}

                {cvLoadState === 'ready' && visibleCvOptions.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No CV matches this search.
                  </p>
                )}

                {visibleCvOptions.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={index === safeActiveCommandIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveCommandIndex(index)}
                    onClick={() => handleCvOptionSelect(option)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                      index === safeActiveCommandIndex
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
                      <IconFileSearch className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {option.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {option.subtitle}
                      </span>
                      {option.skills.length > 0 && (
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                          {option.skills.slice(0, 5).join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {commandState.kind === 'analyse' && (
              <div className="max-h-80 overflow-y-auto p-1.5">
                {visibleAnalysisTemplates.length > 0 ? (
                  visibleAnalysisTemplates.map((template, index) => (
                    <button
                      key={template.id}
                      type="button"
                      role="option"
                      aria-selected={index === safeActiveCommandIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveCommandIndex(index)}
                      onClick={() => handleTemplateSelect(template)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                        index === safeActiveCommandIndex
                          ? 'bg-primary/10 text-foreground'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
                        <IconSparkles className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {template.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {template.description}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No analysis template matches this search.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={cn(
            "group relative flex flex-col gap-2 rounded-[1.75rem] border border-border p-2 shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:border-primary/30 focus-within:shadow-[0_8px_32px_rgba(0,0,0,0.06)]",
            variant === 'workspace' ? "bg-card/95" : "bg-card",
          )}
        >
          {reference && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 pb-2 pt-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                References
              </span>
              <AgentReferenceChip
                reference={reference}
                onRemove={onRemoveReference}
              />
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onSelect={handleCaretChange}
            onClick={handleCaretChange}
            onKeyUp={handleCaretChange}
            placeholder={
              attachedFile
                ? 'Ask about this document...'
                : reference
                  ? 'Ask about the referenced CV...'
                  : 'Send a message...'
            }
            disabled={isStreaming}
            rows={1}
            className="w-full resize-none bg-transparent px-4 py-3.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 min-h-[52px]"
            style={{ overflowY: 'hidden' }}
          />

          <div className="flex w-full items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
              disabled={isStreaming}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach file"
            >
              <IconPaperclip className="size-5 stroke-[1.5]" />
            </Button>

            <div className="flex items-center justify-center gap-1 shrink-0">
              {input.trim() && !isStreaming && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onInputChange('')}
                  className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear message"
                >
                  <IconX className="size-4 stroke-[1.5]" />
                </Button>
              )}
              {isStreaming ? (
                <Button
                  type="button"
                  onClick={onStop}
                  className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] scale-100 hover:scale-[0.98] active:scale-[0.94] flex items-center justify-center shadow-md"
                  aria-label="Stop generating response"
                >
                  <IconPlayerStopFilled className="size-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[0.98] active:scale-[0.94] disabled:bg-muted disabled:text-muted-foreground flex items-center justify-center"
                  disabled={!input.trim() && !attachedFile && !reference}
                  aria-label="Send message"
                >
                  <IconSend2 className="size-4 stroke-[2px] ml-[2px]" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
