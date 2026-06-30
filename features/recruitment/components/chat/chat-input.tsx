'use client';

import { useRef, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  IconBriefcase,
  IconCalendarEvent,
  IconChartBar,
  IconChevronRight,
  IconFile,
  IconFileSearch,
  IconLoader2,
  IconMail,
  IconPaperclip,
  IconPlayerStopFilled,
  IconRoute,
  IconSearch,
  IconSend2,
  IconSparkles,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { listCvReferenceOptionsAction, listJobCommandOptionsAction } from '../../actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AgentReferenceChip } from './agent-reference-chip';
import type { AgentReference } from './agent-prompts';
import type { AgentCvReferenceOption, AgentJobCommandOption } from '../../types';

const TEXTAREA_MIN_HEIGHT_PX = 52;
const TEXTAREA_MAX_HEIGHT_PX = 640;
const TEXTAREA_MAX_VIEWPORT_RATIO = 0.72;

type RootCommandId =
  | 'cv'
  | 'search'
  | 'job'
  | 'match'
  | 'compare'
  | 'candidate'
  | 'interview'
  | 'email'
  | 'pipeline'
  | 'stats'
  | 'duplicates'
  | 'note'
  | 'analyse'
  | 'clear'
  | 'help';
type SlashCommandKind = 'root' | RootCommandId;
type OptionLoadState = 'idle' | 'loading' | 'ready' | 'error';
type PromptBuilder = (query: string, referenceCount: number) => string;

const MAX_COMPOSER_REFERENCES = 5;

interface SlashCommandState {
  kind: SlashCommandKind;
  query: string;
  replaceStart: number;
  replaceEnd: number;
}

interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string | PromptBuilder;
  aliases?: string[];
  alwaysVisible?: boolean;
}

interface RootCommand {
  id: RootCommandId;
  label: string;
  title: string;
  description: string;
  aliases?: string[];
}

const ANALYSIS_TEMPLATES: PromptTemplate[] = [
  {
    id: 'cv-strengths',
    title: 'CV strengths and risks',
    description: 'Short recruiter read with caveats and next action.',
    prompt: 'Summarize this CV: strengths, risks, missing evidence, and best-fit job types. Then propose the next TA action.',
    aliases: ['summary', 'risk', 'strength'],
  },
  {
    id: 'missing-evidence',
    title: 'Missing evidence',
    description: 'Find gaps before screening or matching.',
    prompt: 'List the missing evidence for this CV. Separate extraction gaps, recruiter follow-up questions, and risk checks.',
    aliases: ['gaps', 'proof', 'questions'],
  },
  {
    id: 'job-fit',
    title: 'Best-fit job types',
    description: 'Map the CV to realistic role families.',
    prompt: 'Identify the best-fit job types for this CV and explain the evidence, risks, and seniority assumptions.',
    aliases: ['fit', 'role', 'seniority'],
  },
  {
    id: 'interview-plan',
    title: 'Interview questions',
    description: 'Generate a targeted first-round screening plan.',
    prompt: 'Generate a targeted first-round interview plan for this CV with technical questions, behavioral checks, red flags, and scoring guidance.',
    aliases: ['questions', 'screening', 'interview'],
  },
  {
    id: 'manager-summary',
    title: 'Hiring manager summary',
    description: 'Convert the CV into a concise manager brief.',
    prompt: 'Write a hiring-manager summary for this CV. Keep it concise, evidence-based, and explicit about missing proof.',
    aliases: ['manager', 'brief'],
  },
];

const STATIC_COMMAND_TEMPLATES: Record<
  Exclude<RootCommandId, 'cv' | 'search' | 'job' | 'match' | 'clear'>,
  PromptTemplate[]
> = {
  analyse: ANALYSIS_TEMPLATES,
  compare: [
    {
      id: 'compare-references',
      title: 'Compare referenced CVs',
      description: 'Rank the CV chips currently attached to the composer.',
      prompt: (_query, referenceCount) =>
        referenceCount >= 2
          ? 'Compare the referenced CVs. Rank them, explain strengths, gaps, risks, and the safest next TA action.'
          : 'Compare candidates for a selected job. First ask me which candidates or job to use if the data is ambiguous.',
      aliases: ['rank', 'versus', 'vs'],
      alwaysVisible: true,
    },
    {
      id: 'compare-job-candidates',
      title: 'Compare candidates for a job',
      description: 'Use pipeline candidates assigned to one job.',
      prompt: 'Compare candidates for a job. Fetch the job and candidate data first, then give a ranked decision table and recommendation.',
      aliases: ['job', 'candidate'],
    },
  ],
  candidate: [
    {
      id: 'candidate-query',
      title: 'Review candidate',
      description: 'Find a candidate by name/email and summarize next action.',
      prompt: (query) =>
        `Review candidate "${query || 'candidate name or email'}". Fetch their profile, job, stage, screening, interviews, risks, and next action.`,
      aliases: ['profile', 'stage', 'review'],
      alwaysVisible: true,
    },
    {
      id: 'candidate-notes',
      title: 'Candidate notes',
      description: 'Show notes and context for one candidate.',
      prompt: (query) =>
        `Show candidate notes for "${query || 'candidate name or email'}" and summarize the most important follow-up.`,
      aliases: ['notes', 'follow-up'],
    },
  ],
  interview: [
    {
      id: 'today-interviews',
      title: "Today's interviews",
      description: 'Show the calendar workload for today.',
      prompt: "Show today's interviews, group them by time, and flag anything that needs preparation.",
      aliases: ['today', 'calendar'],
    },
    {
      id: 'interview-questions',
      title: 'Generate questions',
      description: 'Prepare stage-specific interview questions.',
      prompt: (query) =>
        `Generate interview questions for "${query || 'the selected candidate'}". Ask for the missing candidate, job, or stage only if you cannot resolve them from current data.`,
      aliases: ['questions', 'guide'],
    },
    {
      id: 'follow-up',
      title: 'Follow-up questions',
      description: 'Probe gaps after an interview report.',
      prompt: (query) =>
        `Generate follow-up interview questions for "${query || 'the candidate'}" based on their latest interview report and unresolved risks.`,
      aliases: ['followup', 'risks'],
    },
    {
      id: 'schedule-interview',
      title: 'Schedule interview',
      description: 'Start a guarded scheduling request.',
      prompt: (query) =>
        `Schedule an interview for "${query || 'candidate'}". Confirm candidate, job, stage, date, time, and meet link before sending invites.`,
      aliases: ['schedule', 'invite'],
    },
  ],
  email: [
    {
      id: 'interview-invite',
      title: 'Interview invite',
      description: 'Draft or send an interview invitation.',
      prompt: (query) =>
        `Prepare an interview invite email for "${query || 'candidate'}". Confirm date, time, stage, interviewer, and meet link before sending.`,
      aliases: ['invite', 'mail'],
    },
    {
      id: 'rejection-email',
      title: 'Rejection email',
      description: 'Generate a respectful rejection email.',
      prompt: (query) =>
        `Prepare a rejection email for "${query || 'candidate'}". Use candidate and job data, keep it respectful, and ask for confirmation before sending.`,
      aliases: ['reject', 'decline'],
    },
    {
      id: 'offer-email',
      title: 'Offer email',
      description: 'Draft an offer-style message.',
      prompt: (query) =>
        `Prepare an offer email for "${query || 'candidate'}". Include the role context and onboarding document checklist, and ask for confirmation before sending.`,
      aliases: ['offer', 'accept'],
    },
  ],
  pipeline: [
    {
      id: 'ta-screening',
      title: 'TA screening queue',
      description: 'Show candidates waiting for TA screening.',
      prompt: 'Show candidates in TA screening. Prioritize who needs attention first and explain why.',
      aliases: ['ta', 'screening'],
    },
    {
      id: 'manager-stage',
      title: 'Manager stage',
      description: 'Show manager interview and decision workload.',
      prompt: 'Show candidates in manager interview and manager accepted stages. Summarize bottlenecks and next actions.',
      aliases: ['manager'],
    },
    {
      id: 'hr-stage',
      title: 'HR stage',
      description: 'Show HR interview, accepted, and rejected stages.',
      prompt: 'Show candidates in HR interview and HR accepted stages. Summarize readiness for final decision.',
      aliases: ['hr'],
    },
    {
      id: 'hired',
      title: 'Hired and onboarding',
      description: 'Review hired candidates and onboarding status.',
      prompt: 'Show hired candidates and onboarding status. Highlight blockers and missing tasks.',
      aliases: ['onboarding', 'hired'],
    },
  ],
  stats: [
    {
      id: 'dashboard-overview',
      title: 'Dashboard overview',
      description: 'Pipeline, jobs, interviews, and bottlenecks.',
      prompt: 'Give me a dashboard overview. Fetch pipeline stats, jobs stats, and smart insights, then summarize the most important actions.',
      aliases: ['dashboard', 'overview'],
    },
    {
      id: 'cv-pool-stats',
      title: 'CV pool stats',
      description: 'Pool size, top skills, languages, and trend.',
      prompt: 'Show CV pool statistics. Include total CVs, top skills, language distribution, upload trend, and the next sourcing action.',
      aliases: ['cv', 'skills', 'languages'],
    },
    {
      id: 'job-stats',
      title: 'Job stats',
      description: 'Open jobs, seniority mix, and demand.',
      prompt: 'Show job statistics. Include jobs by status, seniority, business unit, and top skills demand.',
      aliases: ['jobs', 'demand'],
    },
  ],
  duplicates: [
    {
      id: 'scan-duplicates',
      title: 'Scan duplicate CVs',
      description: 'Find likely duplicate profiles in the pool.',
      prompt: 'Scan the CV pool for duplicates. Group likely duplicates, explain match reasons, and ask before deleting anything.',
      aliases: ['duplicate', 'cleanup'],
      alwaysVisible: true,
    },
  ],
  note: [
    {
      id: 'candidate-note',
      title: 'Add candidate note',
      description: 'Turn the text after /note into a guarded note request.',
      prompt: (query) =>
        `Add a candidate note: "${query || 'note text'}". Ask which candidate this belongs to if it is not clear, then confirm before saving.`,
      aliases: ['comment', 'follow-up'],
      alwaysVisible: true,
    },
  ],
  help: [
    {
      id: 'slash-help',
      title: 'Show slash command help',
      description: 'Explain available shortcuts and examples.',
      prompt: 'Show the available slash commands, what each one does, and one short example for each.',
      aliases: ['commands', 'shortcuts'],
      alwaysVisible: true,
    },
  ],
};

const ROOT_COMMANDS: RootCommand[] = [
  { id: 'cv', label: '/cv', title: 'Reference CV', description: 'Attach up to 5 CVs as clean context.', aliases: ['resume'] },
  { id: 'search', label: '/search', title: 'Search CV pool', description: 'Find profiles by skill, role, language, or experience.', aliases: ['find', 'rag'] },
  { id: 'job', label: '/job', title: 'Review job', description: 'Pick a job and ask for a grounded read.', aliases: ['role', 'vacancy'] },
  { id: 'match', label: '/match', title: 'Match job', description: 'Rank CVs against a selected job.', aliases: ['fit', 'rank'] },
  { id: 'compare', label: '/compare', title: 'Compare', description: 'Compare referenced CVs or candidates.', aliases: ['vs', 'rank'] },
  { id: 'candidate', label: '/candidate', title: 'Candidate', description: 'Review a pipeline candidate by name/email.', aliases: ['profile'] },
  { id: 'interview', label: '/interview', title: 'Interview', description: 'Questions, follow-ups, schedule, or today view.', aliases: ['calendar'] },
  { id: 'email', label: '/email', title: 'Email', description: 'Draft invites, offers, or rejection emails.', aliases: ['mail'] },
  { id: 'pipeline', label: '/pipeline', title: 'Pipeline', description: 'Inspect candidates by stage.', aliases: ['stage'] },
  { id: 'stats', label: '/stats', title: 'Stats', description: 'Dashboard, CV pool, and job analytics.', aliases: ['dashboard', 'analytics'] },
  { id: 'duplicates', label: '/duplicates', title: 'Duplicates', description: 'Find duplicate CVs before cleanup.', aliases: ['cleanup'] },
  { id: 'note', label: '/note', title: 'Note', description: 'Prepare a candidate note request.', aliases: ['comment'] },
  { id: 'analyse', label: '/analyse', title: 'Analysis templates', description: 'Pick the type of agent answer.', aliases: ['analyze'] },
  { id: 'clear', label: '/clear', title: 'Clear references', description: 'Remove all current reference chips.' },
  { id: 'help', label: '/help', title: 'Help', description: 'Show commands and examples.', aliases: ['commands'] },
];

const COMMAND_ALIASES: Record<string, RootCommandId> = ROOT_COMMANDS.reduce(
  (aliases, command) => {
    aliases[command.id] = command.id;
    for (const alias of command.aliases ?? []) {
      aliases[alias] = command.id;
    }
    return aliases;
  },
  {} as Record<string, RootCommandId>,
);


const COMMAND_HEADINGS: Record<SlashCommandKind, string> = {
  root: 'Agent commands',
  cv: 'Reference a CV',
  search: 'Search CV pool',
  job: 'Choose a job',
  match: 'Choose a job to match',
  compare: 'Compare',
  candidate: 'Candidate commands',
  interview: 'Interview commands',
  email: 'Email commands',
  pipeline: 'Pipeline commands',
  stats: 'Stats commands',
  duplicates: 'Duplicate detection',
  note: 'Candidate note',
  analyse: 'Choose analysis type',
  clear: 'Clear references',
  help: 'Command help',
};

function renderCommandIcon(kind: SlashCommandKind, className: string) {
  switch (kind) {
    case 'cv':
    case 'duplicates':
      return <IconFileSearch className={className} />;
    case 'search':
      return <IconSearch className={className} />;
    case 'job':
      return <IconBriefcase className={className} />;
    case 'match':
    case 'pipeline':
      return <IconRoute className={className} />;
    case 'compare':
    case 'candidate':
      return <IconUsers className={className} />;
    case 'interview':
      return <IconCalendarEvent className={className} />;
    case 'email':
      return <IconMail className={className} />;
    case 'stats':
      return <IconChartBar className={className} />;
    case 'note':
      return <IconFile className={className} />;
    case 'clear':
      return <IconX className={className} />;
    case 'root':
    case 'analyse':
    case 'help':
      return <IconSparkles className={className} />;
  }
}


function getSlashCommandState(value: string, caretIndex: number): SlashCommandState | null {
  const beforeCaret = value.slice(0, caretIndex);
  const match = /(^|\s)\/([a-z]*)(?:\s+([^/\n]*))?$/i.exec(beforeCaret);

  if (!match) return null;

  const commandName = match[2].toLowerCase();
  const query = (match[3] ?? '').trimStart();
  const replaceStart = match.index + match[1].length;
  const commandKind = COMMAND_ALIASES[commandName];

  if (commandKind) {
    return { kind: commandKind, query, replaceStart, replaceEnd: caretIndex };
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
    option.contentType,
    option.email ?? '',
    option.phone ?? '',
    option.summary ?? '',
    option.latestExperience ?? '',
    option.latestEducation ?? '',
    ...option.skills,
    ...option.languages,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function jobMatchesQuery(option: AgentJobCommandOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    option.title,
    option.subtitle,
    option.seniority,
    option.status,
    option.businessUnit ?? '',
    ...option.mustHave,
    ...option.niceToHave,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function templateMatchesQuery(template: PromptTemplate, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || template.alwaysVisible) return true;

  const haystack = [
    template.title,
    template.description,
    ...(template.aliases ?? []),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function getCommandTemplates(
  kind: SlashCommandKind,
  query: string,
  referenceCount: number,
): PromptTemplate[] {
  const trimmedQuery = query.trim();

  if (kind === 'search') {
    const target = trimmedQuery || 'target role, skill set, seniority, language, or location';

    return [
      {
        id: 'search-query',
        title: trimmedQuery ? `Search "${trimmedQuery}"` : 'Search CV pool',
        description: 'Use RAG search and return ranked, cited CV matches.',
        prompt: `Search the CV pool for "${target}". Use RAG search first, show ranked matches with evidence, skills, languages, risks, and next action.`,
        aliases: ['find', 'rag', 'cv'],
        alwaysVisible: true,
      },
      {
        id: 'search-senior-frontend',
        title: 'Senior frontend profiles',
        description: 'React, Next.js, TypeScript, UI engineering.',
        prompt: 'Search the CV pool for senior frontend profiles with React, Next.js, TypeScript, strong UI engineering evidence, and English or French communication.',
        aliases: ['react', 'frontend'],
      },
      {
        id: 'search-data',
        title: 'Data profiles',
        description: 'Data science, analytics, ML, Python, SQL.',
        prompt: 'Search the CV pool for data science or analytics profiles with Python, SQL, machine learning, dashboarding, and measurable project evidence.',
        aliases: ['data', 'python', 'sql'],
      },
    ];
  }

  if (
    kind === 'root' ||
    kind === 'cv' ||
    kind === 'job' ||
    kind === 'match' ||
    kind === 'clear'
  ) {
    return [];
  }

  return STATIC_COMMAND_TEMPLATES[kind].map((template) => {
    if (template.id !== 'compare-references') return template;

    return {
      ...template,
      description:
        referenceCount >= 2
          ? `Compare ${referenceCount} referenced CVs.`
          : 'Attach at least 2 CV references or compare candidates by job.',
    };
  });
}

function resolveTemplatePrompt(
  template: PromptTemplate,
  query: string,
  referenceCount: number,
): string {
  return typeof template.prompt === 'function'
    ? template.prompt(query.trim(), referenceCount)
    : template.prompt;
}

function buildJobPrompt(kind: 'job' | 'match', option: AgentJobCommandOption): string {
  const businessUnit = option.businessUnit ? ` in ${option.businessUnit}` : '';
  const mustHave = option.mustHave.slice(0, 6).join(', ') || 'the listed must-have skills';

  if (kind === 'match') {
    return `Find the best CV matches for job "${option.title}" (${option.seniority}${businessUnit}). Rank candidates, cite matched skills and gaps against ${mustHave}, and recommend the next TA action.`;
  }

  return `Review job "${option.title}" (${option.seniority}${businessUnit}). Summarize status, must-have skills, nice-to-have skills, candidate pipeline health, risks, and the next recruiting action.`;
}

function formatReferenceDate(value: Date): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;

  return `${Number(value.toFixed(value >= 10 || exponent === 0 ? 0 : 1))} ${units[exponent]}`;
}
function buildCvAgentReference(option: AgentCvReferenceOption): AgentReference {
  const uploadedAt = formatReferenceDate(option.createdAt);
  const facts: AgentReference['facts'] = [
    ...(option.email ? [{ label: 'Email', value: option.email }] : []),
    ...(option.phone ? [{ label: 'Phone', value: option.phone }] : []),
    ...(option.skills.length > 0
      ? [{ label: 'Skills', value: option.skills.slice(0, 6).join(', ') }]
      : []),
    ...(option.languages.length > 0
      ? [{ label: 'Languages', value: option.languages.slice(0, 4).join(', ') }]
      : []),
    ...(option.latestExperience
      ? [{ label: 'Latest experience', value: option.latestExperience }]
      : option.experienceCount > 0
        ? [{ label: 'Experience entries', value: String(option.experienceCount) }]
        : []),
    ...(option.latestEducation
      ? [{ label: 'Education', value: option.latestEducation }]
      : option.educationCount > 0
        ? [{ label: 'Education entries', value: String(option.educationCount) }]
        : []),
    ...(option.summary ? [{ label: 'Summary', value: option.summary.slice(0, 160) }] : []),
    { label: 'File', value: option.filename },
    { label: 'File type', value: option.contentType },
    { label: 'Size', value: formatFileSize(option.size) },
    ...(uploadedAt ? [{ label: 'Uploaded', value: uploadedAt }] : []),
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
  references: AgentReference[];
  variant?: 'panel' | 'workspace';
  onInputChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttachFile: (file: File) => void;
  onRemoveFile: () => void;
  onAddReference: (reference: AgentReference) => void;
  onRemoveReference: (reference: AgentReference) => void;
  onClearReferences: () => void;
}

export function ChatInput({
  input,
  isStreaming,
  attachedFile,
  references,
  onInputChange,
  variant = 'panel',
  onSend,
  onStop,
  onAttachFile,
  onRemoveFile,
  onAddReference,
  onRemoveReference,
  onClearReferences,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousInputRef = useRef(input);
  const [caretIndex, setCaretIndex] = useState(input.length);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [cvOptions, setCvOptions] = useState<AgentCvReferenceOption[]>([]);
  const [cvLoadState, setCvLoadState] = useState<OptionLoadState>('idle');
  const [jobOptions, setJobOptions] = useState<AgentJobCommandOption[]>([]);
  const [jobLoadState, setJobLoadState] = useState<OptionLoadState>('idle');

  const boundedCaretIndex = Math.min(caretIndex, input.length);
  const commandState = useMemo(
    () => getSlashCommandState(input, boundedCaretIndex),
    [boundedCaretIndex, input],
  );
  const commandKind = commandState?.kind ?? null;
  const commandQuery = commandState?.query ?? '';
  const referenceCount = references.length;

  const rootOptions = useMemo(() => {
    if (commandKind !== 'root') return [];

    const query = commandQuery.toLowerCase();
    return ROOT_COMMANDS.filter((command) => {
      if (!query) return true;

      return (
        command.id.includes(query) ||
        command.label.includes(query) ||
        command.title.toLowerCase().includes(query) ||
        command.description.toLowerCase().includes(query) ||
        (command.aliases ?? []).some((alias) => alias.includes(query))
      );
    });
  }, [commandKind, commandQuery]);

  const visibleCvOptions = useMemo(() => {
    if (commandKind !== 'cv' || referenceCount >= MAX_COMPOSER_REFERENCES) return [];
    return cvOptions
      .filter((option) => !references.some((reference) => reference.id === option.id))
      .filter((option) => optionMatchesQuery(option, commandQuery))
      .slice(0, 8);
  }, [commandKind, commandQuery, cvOptions, referenceCount, references]);

  const visibleJobOptions = useMemo(() => {
    if (commandKind !== 'job' && commandKind !== 'match') return [];
    return jobOptions
      .filter((option) => jobMatchesQuery(option, commandQuery))
      .slice(0, 8);
  }, [commandKind, commandQuery, jobOptions]);

  const visiblePromptTemplates = useMemo(() => {
    if (!commandKind) return [];

    return getCommandTemplates(commandKind, commandQuery, referenceCount)
      .filter((template) => templateMatchesQuery(template, commandQuery))
      .slice(0, 8);
  }, [commandKind, commandQuery, referenceCount]);

  const commandOptionCount =
    commandKind === 'root'
      ? rootOptions.length
      : commandKind === 'cv'
        ? visibleCvOptions.length
        : commandKind === 'job' || commandKind === 'match'
          ? visibleJobOptions.length
          : commandKind === 'clear'
            ? 1
            : visiblePromptTemplates.length;
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

  const loadJobOptions = useCallback(() => {
    if (jobLoadState === 'loading' || jobLoadState === 'ready') return;

    setJobLoadState('loading');
    listJobCommandOptionsAction()
      .then((options) => {
        setJobOptions(options);
        setJobLoadState('ready');
      })
      .catch(() => {
        setJobOptions([]);
        setJobLoadState('error');
      });
  }, [jobLoadState]);

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
      setActiveCommandIndex(0);

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
      if (command.id === 'clear') {
        onClearReferences();
        replaceCommandSegment('');
        return;
      }

      replaceCommandSegment(`/${command.id} `);

      if (command.id === 'cv') {
        loadCvOptions();
      }

      if (command.id === 'job' || command.id === 'match') {
        loadJobOptions();
      }
    },
    [loadCvOptions, loadJobOptions, onClearReferences, replaceCommandSegment],
  );

  const handleCvOptionSelect = useCallback(
    (option: AgentCvReferenceOption) => {
      onAddReference(buildCvAgentReference(option));
      replaceCommandSegment('');
    },
    [onAddReference, replaceCommandSegment],
  );

  const handleJobOptionSelect = useCallback(
    (option: AgentJobCommandOption) => {
      if (commandKind !== 'job' && commandKind !== 'match') return;
      replaceCommandSegment(buildJobPrompt(commandKind, option));
    },
    [commandKind, replaceCommandSegment],
  );

  const handleTemplateSelect = useCallback(
    (template: PromptTemplate) => {
      replaceCommandSegment(resolveTemplatePrompt(template, commandQuery, referenceCount));
    },
    [commandQuery, referenceCount, replaceCommandSegment],
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

    if (commandState.kind === 'job' || commandState.kind === 'match') {
      const option = visibleJobOptions[safeActiveCommandIndex];
      if (!option) return false;
      handleJobOptionSelect(option);
      return true;
    }

    if (commandState.kind === 'clear') {
      onClearReferences();
      replaceCommandSegment('');
      return true;
    }

    const template = visiblePromptTemplates[safeActiveCommandIndex];
    if (!template) return false;
    handleTemplateSelect(template);
    return true;
  }, [
    safeActiveCommandIndex,
    commandOptionCount,
    commandState,
    handleCvOptionSelect,
    handleJobOptionSelect,
    handleRootCommandSelect,
    handleTemplateSelect,
    onClearReferences,
    replaceCommandSegment,
    rootOptions,
    visibleCvOptions,
    visibleJobOptions,
    visiblePromptTemplates,
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
      if (nextCommandState?.kind === 'job' || nextCommandState?.kind === 'match') {
        loadJobOptions();
      }
      resizeTextarea(e.currentTarget);
    },
    [loadCvOptions, loadJobOptions, onInputChange, resizeTextarea],
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

  const showsJobOptions = commandState?.kind === 'job' || commandState?.kind === 'match';
  const showsPromptTemplates =
    commandState !== null &&
    commandState.kind !== 'root' &&
    commandState.kind !== 'cv' &&
    commandState.kind !== 'job' &&
    commandState.kind !== 'match' &&
    commandState.kind !== 'clear';

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
                  {renderCommandIcon(commandState.kind, 'size-4')}
                </span>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {COMMAND_HEADINGS[commandState.kind]}
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
                          {renderCommandIcon(command.id, 'size-4')}
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
                        {command.id !== 'clear' && (
                          <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        )}
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

                {cvLoadState === 'ready' &&
                  referenceCount >= MAX_COMPOSER_REFERENCES && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Remove a reference before adding another one.
                    </p>
                  )}

                {cvLoadState === 'ready' &&
                  referenceCount < MAX_COMPOSER_REFERENCES &&
                  visibleCvOptions.length === 0 && (
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

            {showsJobOptions && (
              <div className="max-h-80 overflow-y-auto p-1.5">
                {jobLoadState === 'loading' && (
                  <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <IconLoader2 className="size-4 animate-spin" />
                    Loading jobs...
                  </div>
                )}

                {jobLoadState === 'error' && (
                  <p className="px-3 py-6 text-center text-sm text-destructive">
                    Could not load jobs.
                  </p>
                )}

                {jobLoadState === 'ready' && visibleJobOptions.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No job matches this search.
                  </p>
                )}

                {visibleJobOptions.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={index === safeActiveCommandIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveCommandIndex(index)}
                    onClick={() => handleJobOptionSelect(option)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                      index === safeActiveCommandIndex
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
                      {renderCommandIcon(commandState.kind, 'size-4')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {option.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {option.subtitle}
                      </span>
                      {option.mustHave.length > 0 && (
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                          {option.mustHave.slice(0, 5).join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {commandState.kind === 'clear' && (
              <div className="p-1.5">
                <button
                  type="button"
                  role="option"
                  aria-selected
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onClearReferences();
                    replaceCommandSegment('');
                  }}
                  className="flex w-full items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-left text-foreground transition-colors"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary ring-1 ring-border">
                    <IconX className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Clear references</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Remove all CV reference chips from this composer.
                    </span>
                  </span>
                </button>
              </div>
            )}

            {showsPromptTemplates && (
              <div className="max-h-80 overflow-y-auto p-1.5">
                {visiblePromptTemplates.length > 0 ? (
                  visiblePromptTemplates.map((template, index) => (
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
                        {renderCommandIcon(commandState.kind, 'size-4')}
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
                    No option matches this search.
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
          {references.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 pb-2 pt-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                References
              </span>
              {references.map((item) => (
                <AgentReferenceChip
                  key={`${item.type}:${item.id}`}
                  reference={item}
                  onRemove={() => onRemoveReference(item)}
                />
              ))}
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
                : references.length > 0
                  ? 'Ask about the referenced CVs...'
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
                  disabled={!input.trim() && !attachedFile && references.length === 0}
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
