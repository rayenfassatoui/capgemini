'use client';

import { useRef, useCallback, useEffect, useId, useLayoutEffect, useMemo, useState } from 'react';
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
import { useTranslation } from "@/components/shared/i18n-provider";
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
const FRENCH_ROOT_COMMANDS: Record<
  RootCommandId,
  Pick<RootCommand, 'title' | 'description'>
> = {
  cv: {
    title: 'Référencer un CV',
    description: "Joindre jusqu'à 5 CV comme contexte fiable.",
  },
  search: {
    title: 'Rechercher dans le vivier',
    description: 'Trouver des profils par compétence, rôle, langue ou expérience.',
  },
  job: {
    title: 'Analyser un poste',
    description: 'Choisir un poste et demander une analyse fondée sur les données.',
  },
  match: {
    title: 'Faire correspondre un poste',
    description: 'Classer les CV par rapport à un poste sélectionné.',
  },
  compare: {
    title: 'Comparer',
    description: 'Comparer les CV référencés ou les candidats.',
  },
  candidate: {
    title: 'Candidat',
    description: 'Analyser un candidat du pipeline par nom ou e-mail.',
  },
  interview: {
    title: 'Entretien',
    description: "Questions, suivi, planification ou vue d'aujourd'hui.",
  },
  email: {
    title: 'E-mail',
    description: "Préparer des invitations, offres ou e-mails de refus.",
  },
  pipeline: {
    title: 'Pipeline',
    description: 'Examiner les candidats par étape.',
  },
  stats: {
    title: 'Statistiques',
    description: 'Analyser le tableau de bord, le vivier de CV et les postes.',
  },
  duplicates: {
    title: 'Doublons',
    description: 'Identifier les CV en double avant le nettoyage.',
  },
  note: {
    title: 'Note',
    description: 'Préparer une demande de note candidat.',
  },
  analyse: {
    title: "Modèles d'analyse",
    description: "Choisir le type de réponse de l'agent.",
  },
  clear: {
    title: 'Effacer les références',
    description: 'Retirer toutes les références actuelles.',
  },
  help: {
    title: 'Aide',
    description: 'Afficher les commandes et des exemples.',
  },
};

const FRENCH_COMMAND_HEADINGS: Record<SlashCommandKind, string> = {
  root: "Commandes de l'agent",
  cv: 'Référencer un CV',
  search: 'Rechercher dans le vivier de CV',
  job: 'Choisir un poste',
  match: 'Choisir un poste à faire correspondre',
  compare: 'Comparer',
  candidate: 'Commandes candidat',
  interview: 'Commandes entretien',
  email: 'Commandes e-mail',
  pipeline: 'Commandes pipeline',
  stats: 'Commandes statistiques',
  duplicates: 'Détection des doublons',
  note: 'Note candidat',
  analyse: "Choisir le type d'analyse",
  clear: 'Effacer les références',
  help: 'Aide sur les commandes',
};

const FRENCH_TEMPLATE_OVERRIDES: Record<
  string,
  Pick<PromptTemplate, 'title' | 'description' | 'prompt'>
> = {
  'cv-strengths': {
    title: 'Forces et risques du CV',
    description: 'Analyse recruteur concise avec limites et prochaine action.',
    prompt:
      'Résume ce CV : forces, risques, preuves manquantes et types de postes adaptés. Propose ensuite la prochaine action TA.',
  },
  'missing-evidence': {
    title: 'Preuves manquantes',
    description: 'Identifier les lacunes avant la présélection ou le matching.',
    prompt:
      'Liste les preuves manquantes pour ce CV. Sépare les lacunes d’extraction, les questions de suivi recruteur et les contrôles de risque.',
  },
  'job-fit': {
    title: 'Types de postes adaptés',
    description: 'Associer le CV à des familles de rôles réalistes.',
    prompt:
      'Identifie les types de postes les plus adaptés à ce CV et explique les preuves, les risques et les hypothèses de séniorité.',
  },
  'interview-plan': {
    title: "Questions d'entretien",
    description: 'Générer un plan de présélection ciblé.',
    prompt:
      'Génère un plan de premier entretien ciblé pour ce CV avec des questions techniques, des contrôles comportementaux, des signaux d’alerte et un guide de notation.',
  },
  'manager-summary': {
    title: 'Synthèse pour le manager',
    description: 'Transformer le CV en briefing manager concis.',
    prompt:
      'Rédige une synthèse pour le manager à partir de ce CV. Reste concis, fondé sur les preuves et explicite sur les éléments non vérifiés.',
  },
  'compare-references': {
    title: 'Comparer les CV référencés',
    description: 'Classer les CV actuellement joints au message.',
    prompt: (_query, referenceCount) =>
      referenceCount >= 2
        ? 'Compare les CV référencés. Classe-les et explique les forces, écarts, risques et la prochaine action TA la plus sûre.'
        : 'Compare des candidats pour un poste sélectionné. Demande d’abord quels candidats ou quel poste utiliser si les données sont ambiguës.',
  },
  'compare-job-candidates': {
    title: 'Comparer les candidats pour un poste',
    description: 'Utiliser les candidats du pipeline affectés à un poste.',
    prompt:
      'Compare les candidats pour un poste. Récupère d’abord les données du poste et des candidats, puis fournis un tableau de décision classé et une recommandation.',
  },
  'candidate-query': {
    title: 'Analyser un candidat',
    description: 'Trouver un candidat et résumer la prochaine action.',
    prompt: (query) =>
      `Analyse le candidat « ${query || 'nom ou e-mail du candidat'} ». Récupère son profil, son poste, son étape, sa présélection, ses entretiens, ses risques et la prochaine action.`,
  },
  'candidate-notes': {
    title: 'Notes du candidat',
    description: 'Afficher les notes et le contexte d’un candidat.',
    prompt: (query) =>
      `Affiche les notes du candidat « ${query || 'nom ou e-mail du candidat'} » et résume le suivi le plus important.`,
  },
  'today-interviews': {
    title: "Entretiens d'aujourd'hui",
    description: "Afficher la charge d'entretiens du jour.",
    prompt:
      "Affiche les entretiens d'aujourd'hui, regroupe-les par heure et signale les préparations nécessaires.",
  },
  'interview-questions': {
    title: 'Générer des questions',
    description: "Préparer des questions adaptées à l'étape.",
    prompt: (query) =>
      `Génère des questions d’entretien pour « ${query || 'le candidat sélectionné'} ». Ne demande le candidat, le poste ou l’étape que si les données actuelles ne permettent pas de les résoudre.`,
  },
  'follow-up': {
    title: 'Questions de suivi',
    description: "Examiner les lacunes après un rapport d'entretien.",
    prompt: (query) =>
      `Génère des questions de suivi pour « ${query || 'le candidat'} » à partir de son dernier rapport d’entretien et des risques non résolus.`,
  },
  'schedule-interview': {
    title: 'Planifier un entretien',
    description: 'Démarrer une demande de planification protégée.',
    prompt: (query) =>
      `Planifie un entretien pour « ${query || 'le candidat'} ». Confirme le candidat, le poste, l’étape, la date, l’heure et le lien de réunion avant d’envoyer les invitations.`,
  },
  'interview-invite': {
    title: "Invitation à l'entretien",
    description: "Préparer ou envoyer une invitation à l'entretien.",
    prompt: (query) =>
      `Prépare un e-mail d’invitation à un entretien pour « ${query || 'le candidat'} ». Confirme la date, l’heure, l’étape, l’intervieweur et le lien de réunion avant l’envoi.`,
  },
  'rejection-email': {
    title: 'E-mail de refus',
    description: 'Générer un e-mail de refus respectueux.',
    prompt: (query) =>
      `Prépare un e-mail de refus pour « ${query || 'le candidat'} ». Utilise les données du candidat et du poste, reste respectueux et demande confirmation avant l’envoi.`,
  },
  'offer-email': {
    title: "E-mail d'offre",
    description: "Préparer un message de type offre d'emploi.",
    prompt: (query) =>
      `Prépare un e-mail d’offre pour « ${query || 'le candidat'} ». Inclus le contexte du poste et la liste des documents d’intégration, puis demande confirmation avant l’envoi.`,
  },
  'ta-screening': {
    title: 'File de présélection TA',
    description: 'Afficher les candidats en attente de présélection TA.',
    prompt:
      'Affiche les candidats en présélection TA. Priorise ceux qui nécessitent une attention immédiate et explique pourquoi.',
  },
  'manager-stage': {
    title: 'Étape manager',
    description: 'Afficher la charge des entretiens et décisions manager.',
    prompt:
      'Affiche les candidats aux étapes entretien manager et accepté manager. Résume les blocages et les prochaines actions.',
  },
  'hr-stage': {
    title: 'Étape RH',
    description: 'Afficher les étapes entretien, accepté et refusé RH.',
    prompt:
      'Affiche les candidats aux étapes entretien RH et accepté RH. Résume leur préparation à la décision finale.',
  },
  hired: {
    title: 'Recrutés et intégration',
    description: "Analyser les candidats recrutés et l'état d'intégration.",
    prompt:
      'Affiche les candidats recrutés et leur état d’intégration. Signale les blocages et les tâches manquantes.',
  },
  'dashboard-overview': {
    title: "Vue d'ensemble du tableau de bord",
    description: 'Pipeline, postes, entretiens et blocages.',
    prompt:
      'Donne une vue d’ensemble du tableau de bord. Récupère les statistiques du pipeline et des postes ainsi que les analyses intelligentes, puis résume les actions prioritaires.',
  },
  'cv-pool-stats': {
    title: 'Statistiques du vivier de CV',
    description: 'Taille, compétences, langues et tendance du vivier.',
    prompt:
      'Affiche les statistiques du vivier de CV : total, principales compétences, langues, tendance des ajouts et prochaine action de sourcing.',
  },
  'job-stats': {
    title: 'Statistiques des postes',
    description: 'Postes ouverts, séniorité et demande.',
    prompt:
      'Affiche les statistiques des postes par statut, séniorité, unité commerciale et compétences les plus demandées.',
  },
  'scan-duplicates': {
    title: 'Rechercher les CV en double',
    description: 'Identifier les profils probablement dupliqués dans le vivier.',
    prompt:
      'Recherche les doublons dans le vivier de CV. Regroupe les correspondances probables, explique les raisons et demande confirmation avant toute suppression.',
  },
  'candidate-note': {
    title: 'Ajouter une note candidat',
    description: 'Transformer le texte après /note en demande protégée.',
    prompt: (query) =>
      `Ajoute une note candidat : « ${query || 'texte de la note'} ». Demande à quel candidat elle appartient si ce n’est pas clair, puis confirme avant l’enregistrement.`,
  },
  'slash-help': {
    title: 'Afficher l’aide des commandes',
    description: 'Expliquer les raccourcis disponibles et donner des exemples.',
    prompt:
      'Affiche les commandes slash disponibles, leur fonction et un exemple court pour chacune.',
  },
};

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
function getLocalizedRootCommands(locale: 'en' | 'fr'): RootCommand[] {
  if (locale === 'en') return ROOT_COMMANDS;
  return ROOT_COMMANDS.map((command) => ({
    ...command,
    ...FRENCH_ROOT_COMMANDS[command.id],
  }));
}

function localizePromptTemplate(
  template: PromptTemplate,
  locale: 'en' | 'fr',
): PromptTemplate {
  if (locale === 'en') return template;
  const override = FRENCH_TEMPLATE_OVERRIDES[template.id];
  return override ? { ...template, ...override } : template;
}

function getCommandHeading(
  kind: SlashCommandKind,
  locale: 'en' | 'fr',
): string {
  return locale === 'fr'
    ? FRENCH_COMMAND_HEADINGS[kind]
    : COMMAND_HEADINGS[kind];
}


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
  locale: 'en' | 'fr',
): PromptTemplate[] {
  const trimmedQuery = query.trim();

  if (kind === 'search') {
    if (locale === 'fr') {
      const target =
        trimmedQuery ||
        'rôle cible, compétences, séniorité, langue ou localisation';
      return [
        {
          id: 'search-query',
          title: trimmedQuery
            ? `Rechercher « ${trimmedQuery} »`
            : 'Rechercher dans le vivier de CV',
          description:
            'Utiliser la recherche RAG et classer les CV avec leurs sources.',
          prompt: `Recherche dans le vivier de CV : « ${target} ». Utilise d’abord la recherche RAG, puis affiche les correspondances classées avec preuves, compétences, langues, risques et prochaine action.`,
          aliases: ['find', 'rag', 'cv'],
          alwaysVisible: true,
        },
        {
          id: 'search-senior-frontend',
          title: 'Profils frontend seniors',
          description: 'React, Next.js, TypeScript et ingénierie UI.',
          prompt:
            'Recherche des profils frontend seniors avec React, Next.js, TypeScript, de solides preuves en ingénierie UI et une communication en anglais ou en français.',
          aliases: ['react', 'frontend'],
        },
        {
          id: 'search-data',
          title: 'Profils data',
          description: 'Data science, analytique, ML, Python et SQL.',
          prompt:
            'Recherche des profils data science ou analytique avec Python, SQL, machine learning, tableaux de bord et résultats de projets mesurables.',
          aliases: ['data', 'python', 'sql'],
        },
      ];
    }

    const target =
      trimmedQuery ||
      'target role, skill set, seniority, language, or location';
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
        prompt:
          'Search the CV pool for senior frontend profiles with React, Next.js, TypeScript, strong UI engineering evidence, and English or French communication.',
        aliases: ['react', 'frontend'],
      },
      {
        id: 'search-data',
        title: 'Data profiles',
        description: 'Data science, analytics, ML, Python, SQL.',
        prompt:
          'Search the CV pool for data science or analytics profiles with Python, SQL, machine learning, dashboarding, and measurable project evidence.',
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
    const localized = localizePromptTemplate(template, locale);
    if (template.id !== 'compare-references') return localized;

    return {
      ...localized,
      description:
        referenceCount >= 2
          ? locale === 'fr'
            ? `Comparer ${referenceCount} CV référencés.`
            : `Compare ${referenceCount} referenced CVs.`
          : locale === 'fr'
            ? 'Joignez au moins 2 CV ou comparez des candidats par poste.'
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

function buildJobPrompt(
  kind: 'job' | 'match',
  option: AgentJobCommandOption,
  locale: 'en' | 'fr',
): string {
  if (locale === 'fr') {
    const businessUnit = option.businessUnit
      ? ` dans ${option.businessUnit}`
      : '';
    const mustHave =
      option.mustHave.slice(0, 6).join(', ') ||
      'les compétences indispensables indiquées';
    if (kind === 'match') {
      return `Trouve les meilleurs CV pour le poste « ${option.title} » (${option.seniority}${businessUnit}). Classe les candidats, cite les compétences correspondantes et les écarts par rapport à ${mustHave}, puis recommande la prochaine action TA.`;
    }
    return `Analyse le poste « ${option.title} » (${option.seniority}${businessUnit}). Résume le statut, les compétences indispensables et souhaitées, la santé du pipeline candidat, les risques et la prochaine action de recrutement.`;
  }

  const businessUnit = option.businessUnit ? ` in ${option.businessUnit}` : '';
  const mustHave =
    option.mustHave.slice(0, 6).join(', ') ||
    'the listed must-have skills';
  if (kind === 'match') {
    return `Find the best CV matches for job "${option.title}" (${option.seniority}${businessUnit}). Rank candidates, cite matched skills and gaps against ${mustHave}, and recommend the next TA action.`;
  }
  return `Review job "${option.title}" (${option.seniority}${businessUnit}). Summarize status, must-have skills, nice-to-have skills, candidate pipeline health, risks, and the next recruiting action.`;
}

function formatReferenceDate(
  value: Date,
  locale: 'en' | 'fr',
): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
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
function buildCvAgentReference(
  option: AgentCvReferenceOption,
  locale: 'en' | 'fr',
): AgentReference {
  const uploadedAt = formatReferenceDate(option.createdAt, locale);
  const labels =
    locale === 'fr'
      ? {
          phone: 'Téléphone',
          skills: 'Compétences',
          languages: 'Langues',
          latestExperience: 'Dernière expérience',
          experienceEntries: "Expériences",
          education: 'Formation',
          educationEntries: 'Formations',
          summary: 'Résumé',
          file: 'Fichier',
          fileType: 'Type de fichier',
          size: 'Taille',
          uploaded: 'Ajouté',
        }
      : {
          phone: 'Phone',
          skills: 'Skills',
          languages: 'Languages',
          latestExperience: 'Latest experience',
          experienceEntries: 'Experience entries',
          education: 'Education',
          educationEntries: 'Education entries',
          summary: 'Summary',
          file: 'File',
          fileType: 'File type',
          size: 'Size',
          uploaded: 'Uploaded',
        };
  const facts: AgentReference['facts'] = [
    ...(option.email ? [{ label: 'Email', value: option.email }] : []),
    ...(option.phone ? [{ label: labels.phone, value: option.phone }] : []),
    ...(option.skills.length > 0
      ? [{ label: labels.skills, value: option.skills.slice(0, 6).join(', ') }]
      : []),
    ...(option.languages.length > 0
      ? [
          {
            label: labels.languages,
            value: option.languages.slice(0, 4).join(', '),
          },
        ]
      : []),
    ...(option.latestExperience
      ? [{ label: labels.latestExperience, value: option.latestExperience }]
      : option.experienceCount > 0
        ? [
            {
              label: labels.experienceEntries,
              value: String(option.experienceCount),
            },
          ]
        : []),
    ...(option.latestEducation
      ? [{ label: labels.education, value: option.latestEducation }]
      : option.educationCount > 0
        ? [
            {
              label: labels.educationEntries,
              value: String(option.educationCount),
            },
          ]
        : []),
    ...(option.summary
      ? [{ label: labels.summary, value: option.summary.slice(0, 160) }]
      : []),
    { label: labels.file, value: option.filename },
    { label: labels.fileType, value: option.contentType },
    { label: labels.size, value: formatFileSize(option.size) },
    ...(uploadedAt ? [{ label: labels.uploaded, value: uploadedAt }] : []),
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
  const { t, locale } = useTranslation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commandListboxId = useId();
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
    return getLocalizedRootCommands(locale).filter((command) => {
      if (!query) return true;

      return (
        command.id.includes(query) ||
        command.label.includes(query) ||
        command.title.toLowerCase().includes(query) ||
        command.description.toLowerCase().includes(query) ||
        (command.aliases ?? []).some((alias) => alias.includes(query))
      );
    });
  }, [commandKind, commandQuery, locale]);

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

    return getCommandTemplates(
      commandKind,
      commandQuery,
      referenceCount,
      locale,
    )
      .filter((template) => templateMatchesQuery(template, commandQuery))
      .slice(0, 8);
  }, [commandKind, commandQuery, locale, referenceCount]);

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
  const activeCommandOptionId =
    commandState && commandOptionCount > 0
      ? `${commandListboxId}-option-${safeActiveCommandIndex}`
      : undefined;

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
      onAddReference(buildCvAgentReference(option, locale));
      replaceCommandSegment('');
    },
    [locale, onAddReference, replaceCommandSegment],
  );

  const handleJobOptionSelect = useCallback(
    (option: AgentJobCommandOption) => {
      if (commandKind !== 'job' && commandKind !== 'match') return;
      replaceCommandSegment(buildJobPrompt(commandKind, option, locale));
    },
    [commandKind, locale, replaceCommandSegment],
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
    <div className={cn("relative px-3 pb-3 pt-0 sm:px-6 sm:pb-6", variant === 'workspace' ? "bg-transparent" : "bg-background")}>
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
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("agent.removeFile")}
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

        <div className="relative">
        {commandState && (
          <div
            id={commandListboxId}
            role="listbox"
            aria-label={t("agent.slashCommands")}
            className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-foreground/5 ring-1 ring-foreground/5"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {renderCommandIcon(commandState.kind, 'size-4')}
                </span>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {getCommandHeading(commandState.kind, locale)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("agent.commandKeyboardHelp")}
                  </p>
                </div>
              </div>
              <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                /
              </span>
            </div>

            {commandState.kind === 'root' && (
              <div className="max-h-64 overflow-y-auto p-1.5 sm:max-h-72">
                {rootOptions.length > 0 ? (
                  rootOptions.map((command, index) => (
                      <button
                        key={command.id}
                        type="button"
                        id={`${commandListboxId}-option-${index}`}
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
                    {t("agent.noCommandMatch")}
                  </p>
                )}
              </div>
            )}

            {commandState.kind === 'cv' && (
              <div className="max-h-64 overflow-y-auto p-1.5 sm:max-h-80">
                {cvLoadState === 'loading' && (
                  <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <IconLoader2 className="size-4 animate-spin" />
                    {t("agent.loadingCvReferences")}
                  </div>
                )}

                {cvLoadState === 'error' && (
                  <p className="px-3 py-6 text-center text-sm text-destructive">
                    {t("agent.cvReferencesLoadError")}
                  </p>
                )}

                {cvLoadState === 'ready' &&
                  referenceCount >= MAX_COMPOSER_REFERENCES && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {t("agent.referenceLimit")}
                    </p>
                  )}

                {cvLoadState === 'ready' &&
                  referenceCount < MAX_COMPOSER_REFERENCES &&
                  visibleCvOptions.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {t("agent.noCvMatch")}
                    </p>
                  )}

                {visibleCvOptions.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    id={`${commandListboxId}-option-${index}`}
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
              <div className="max-h-64 overflow-y-auto p-1.5 sm:max-h-80">
                {jobLoadState === 'loading' && (
                  <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <IconLoader2 className="size-4 animate-spin" />
                    {t("agent.loadingJobs")}
                  </div>
                )}

                {jobLoadState === 'error' && (
                  <p className="px-3 py-6 text-center text-sm text-destructive">
                    {t("agent.jobsLoadError")}
                  </p>
                )}

                {jobLoadState === 'ready' && visibleJobOptions.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {t("agent.noJobMatch")}
                  </p>
                )}

                {visibleJobOptions.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    id={`${commandListboxId}-option-${index}`}
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
                  id={`${commandListboxId}-option-0`}
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
                    <span className="block text-sm font-semibold">
                      {t("agent.clearReferences")}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t("agent.clearReferencesDescription")}
                    </span>
                  </span>
                </button>
              </div>
            )}

            {showsPromptTemplates && (
              <div className="max-h-64 overflow-y-auto p-1.5 sm:max-h-80">
                {visiblePromptTemplates.length > 0 ? (
                  visiblePromptTemplates.map((template, index) => (
                    <button
                      key={template.id}
                      type="button"
                      id={`${commandListboxId}-option-${index}`}
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
                    {t("agent.noOptionMatch")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={cn(
            "group relative flex flex-col gap-2 rounded-[1.5rem] border border-border/90 bg-card p-2 shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-300 focus-within:border-primary/50 focus-within:shadow-[0_8px_32px_rgba(0,0,0,0.08)] dark:border-white/20 dark:bg-zinc-950/90",
            variant === 'workspace' ? "supports-[backdrop-filter]:bg-card/95" : "",
          )}
        >
          {references.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 pb-2 pt-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("agent.references")}
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
            role="combobox"
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onSelect={handleCaretChange}
            onClick={handleCaretChange}
            onKeyUp={handleCaretChange}
            placeholder={
              attachedFile
                ? t("agent.attachmentPlaceholder")
                : references.length > 0
                  ? t("agent.referencePlaceholder")
                  : t("agent.messagePlaceholder")
            }
            aria-label={t("agent.messageLabel")}
            aria-haspopup="listbox"
            aria-expanded={commandState !== null}
            aria-controls={commandState ? commandListboxId : undefined}
            aria-activedescendant={activeCommandOptionId}
            aria-autocomplete="list"
            disabled={isStreaming}
            rows={1}
            className="min-h-[52px] w-full resize-none bg-transparent px-3 py-3.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/90 focus:outline-none disabled:opacity-50 sm:px-4"
            style={{ overflowY: 'hidden' }}
          />

          <div className="flex w-full items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 rounded-full text-muted-foreground transition-transform duration-300 hover:bg-muted hover:text-foreground active:scale-[0.96]"
              disabled={isStreaming}
              onClick={() => fileInputRef.current?.click()}
              aria-label={t("agent.attachFile")}
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
                  className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("agent.clearMessage")}
                >
                  <IconX className="size-4 stroke-[1.5]" />
                </Button>
              )}
              {isStreaming ? (
                <Button
                  type="button"
                  onClick={onStop}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-300 hover:scale-[0.98] hover:bg-primary/90 active:scale-[0.94]"
                  aria-label={t("agent.stop")}
                >
                  <IconPlayerStopFilled className="size-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 hover:scale-[0.98] hover:bg-primary/90 active:scale-[0.94] disabled:bg-muted disabled:text-muted-foreground"
                  disabled={!input.trim() && !attachedFile && references.length === 0}
                  aria-label={t("agent.send")}
                >
                  <IconSend2 className="size-4 stroke-[2px] ml-[2px]" />
                </Button>
              )}
            </div>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
