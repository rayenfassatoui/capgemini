import { localizeAgentEvidenceText } from "../../agent-localization";
import type { AgentEvidenceMetadata, AgentSourceKind, RecruitmentAnalyticsChart, RecruitmentResponseCard } from "../../types";
import type {
  AgentActionConfirmation,
  ChatResponseMetadata,
  ToolEvent,
  ToolTraceJson,
} from "./chat-types";

export interface FollowUpSuggestionContext {
  content: string;
  metadata?: ChatResponseMetadata;
  charts?: RecruitmentAnalyticsChart[];
  cards?: RecruitmentResponseCard[];
  confirmations?: AgentActionConfirmation[];
  toolEvents?: ToolEvent[];
}

export interface EvidenceConfidenceSummary {
  level: "high" | "medium" | "low";
  verifiedSources: number;
  failedSources: number;
  inferenceLimitCount: number;
  observedFactCount: number;
  summary: string;
  issues: string[];
}

export interface ConfirmationEntityChip {
  label: string;
  value: string;
}

export interface ConfirmationPreview {
  riskLevel: "high" | "medium" | "low";
  riskLabel: string;
  entities: ConfirmationEntityChip[];
  impact: string[];
}

const CV_FOLLOW_UPS = [
  "Compare the top matching candidates",
  "List the main hiring risks",
  "Generate interview questions for this profile",
] as const;

const JOB_FOLLOW_UPS = [
  "Tighten the job requirements",
  "Show the strongest matching profiles",
  "List the main matching gaps",
] as const;

const INTERVIEW_FOLLOW_UPS = [
  "Turn this into an interview scorecard",
  "List the red flags to probe next",
  "Draft a candidate follow-up email",
] as const;

const ANALYTICS_FOLLOW_UPS = [
  "Explain the main bottleneck behind this",
  "Turn this into role-specific next actions",
  "Compare this trend with another segment",
] as const;

const GOVERNANCE_FOLLOW_UPS = [
  "Summarize the governance risk here",
  "Show only the failed or pending actions",
  "Draft an audit-ready summary",
] as const;

const CONFIRMATION_FOLLOW_UPS = [
  "Explain the impact of this action before I confirm",
  "Show the affected records for this action",
  "List the risks if I approve this change",
] as const;

const GENERAL_FOLLOW_UPS = [
  "Turn this into next actions",
  "Show the evidence and risks",
  "Summarize this for a hiring manager",
] as const;
const FR_FOLLOW_UP_BY_ENGLISH: Readonly<Record<string, string>> = {
  "Compare the top matching candidates": "Comparer les meilleurs candidats correspondants",
  "List the main hiring risks": "Lister les principaux risques de recrutement",
  "Generate interview questions for this profile": "Generer des questions d'entretien pour ce profil",
  "Tighten the job requirements": "Preciser les exigences du poste",
  "Show the strongest matching profiles": "Afficher les profils les plus pertinents",
  "List the main matching gaps": "Lister les principaux ecarts de correspondance",
  "Turn this into an interview scorecard": "Transformer ceci en grille d'evaluation d'entretien",
  "List the red flags to probe next": "Lister les signaux d'alerte a approfondir",
  "Draft a candidate follow-up email": "Rediger un email de suivi au candidat",
  "Explain the main bottleneck behind this": "Expliquer le principal blocage",
  "Turn this into role-specific next actions": "Transformer ceci en actions par role",
  "Compare this trend with another segment": "Comparer cette tendance a un autre segment",
  "Summarize the governance risk here": "Resumer le risque de gouvernance",
  "Show only the failed or pending actions": "Afficher uniquement les actions en echec ou en attente",
  "Draft an audit-ready summary": "Rediger un resume pret pour l'audit",
  "Explain the impact of this action before I confirm": "Expliquer l'impact de cette action avant confirmation",
  "Show the affected records for this action": "Afficher les enregistrements concernes par cette action",
  "List the risks if I approve this change": "Lister les risques si j'approuve ce changement",
  "Turn this into next actions": "Transformer ceci en prochaines actions",
  "Show the evidence and risks": "Afficher les preuves et les risques",
  "Summarize this for a hiring manager": "Resumer ceci pour un manager recruteur",
};

export function localizeFollowUpSuggestions(
  suggestions: readonly string[],
  locale: "en" | "fr",
): string[] {
  if (locale === "en") return [...suggestions];
  return suggestions.map(
    (suggestion) => FR_FOLLOW_UP_BY_ENGLISH[suggestion] ?? suggestion,
  );
}

const HIGH_RISK_TOOL_RE = /(delete|close|cancel|reject|bulk|hired|mark_.*read)/i;
const MEDIUM_RISK_TOOL_RE = /(update|assign|create|add|send|schedule|upload)/i;

function isRecord(value: ToolTraceJson | undefined): value is Record<string, ToolTraceJson> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(args: Record<string, ToolTraceJson>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatToken(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const FR_CONFIRMATION_TOKENS: Readonly<Record<string, string>> = {
  new: "Nouveau",
  ta_screening: "Preselection TA",
  ta_interview: "Entretien TA",
  ta_accepted: "Accepte par TA",
  ta_rejected: "Refuse par TA",
  manager_interview: "Entretien manager",
  manager_accepted: "Accepte par le manager",
  manager_rejected: "Refuse par le manager",
  hr_interview: "Entretien RH",
  hr_accepted: "Accepte par les RH",
  hr_rejected: "Refuse par les RH",
  hired: "Embauche",
  open: "Ouvert",
  closed: "Cloture",
  scheduled: "Planifie",
  completed: "Termine",
  cancelled: "Annule",
};

function formatConfirmationToken(
  value: string,
  locale: "en" | "fr",
): string {
  return locale === "fr"
    ? (FR_CONFIRMATION_TOKENS[value.toLowerCase()] ?? formatToken(value))
    : formatToken(value);
}

function compactValue(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function uniquePush(values: string[], next: string | null) {
  if (!next || values.includes(next)) return;
  values.push(next);
}

function hasSourceKind(
  evidence: AgentEvidenceMetadata | undefined,
  kinds: readonly AgentSourceKind[],
): boolean {
  if (!evidence) return false;
  const kindSet = new Set(kinds);
  return evidence.sources.some((source) => kindSet.has(source.kind));
}

function hasToolName(toolEvents: ToolEvent[] | undefined, pattern: RegExp): boolean {
  return toolEvents?.some((event) => pattern.test(event.tool)) ?? false;
}

function fallbackFollowUps(content: string): readonly string[] {
  const normalized = content.toLowerCase();
  if (normalized.includes("interview")) return INTERVIEW_FOLLOW_UPS;
  if (normalized.includes("job") || normalized.includes("requirement")) return JOB_FOLLOW_UPS;
  if (normalized.includes("candidate") || normalized.includes("cv")) return CV_FOLLOW_UPS;
  return GENERAL_FOLLOW_UPS;
}

export function getFollowUpSuggestions({
  content,
  metadata,
  charts,
  cards,
  confirmations,
  toolEvents,
}: FollowUpSuggestionContext): string[] {
  const pendingConfirmations = confirmations?.some((item) => item.status === "pending") ?? false;
  if (pendingConfirmations) {
    return [...CONFIRMATION_FOLLOW_UPS];
  }

  if (cards?.some((card) => card.kind === "governance")) {
    return [...GOVERNANCE_FOLLOW_UPS];
  }

  if (cards?.some((card) => card.kind === "job")) {
    return [...JOB_FOLLOW_UPS];
  }

  if (cards?.some((card) => card.kind === "pipeline")) {
    return [...ANALYTICS_FOLLOW_UPS];
  }

  if (cards?.some((card) => card.kind === "candidate")) {
    return [...CV_FOLLOW_UPS];
  }
  const evidence = metadata?.evidence;
  if ((charts?.length ?? 0) > 0 || hasSourceKind(evidence, ["analytics", "search", "system"])) {
    return [...ANALYTICS_FOLLOW_UPS];
  }

  if (
    hasSourceKind(evidence, ["operation", "onboarding"]) ||
    hasToolName(toolEvents, /(governance|activity|onboarding|notification|email|audit)/i)
  ) {
    return [...GOVERNANCE_FOLLOW_UPS];
  }

  if (hasSourceKind(evidence, ["interview"]) || hasToolName(toolEvents, /(interview|scorecard)/i)) {
    return [...INTERVIEW_FOLLOW_UPS];
  }

  if (hasSourceKind(evidence, ["job"]) || hasToolName(toolEvents, /(job|requirement)/i)) {
    return [...JOB_FOLLOW_UPS];
  }

  if (
    hasSourceKind(evidence, ["candidate", "cv"]) ||
    hasToolName(toolEvents, /(candidate|cv|screening|matching)/i)
  ) {
    return [...CV_FOLLOW_UPS];
  }

  return [...fallbackFollowUps(content)];
}

export function summarizeEvidenceConfidence(
  evidence?: AgentEvidenceMetadata,
  locale: "en" | "fr" = "en",
): EvidenceConfidenceSummary | null {
  if (!evidence) return null;

  const verifiedSources = evidence.sources.filter((source) => source.status === "success").length;
  const failedSources = evidence.sources.length - verifiedSources;
  const inferenceLimitCount = evidence.inferenceLimits.length;
  const observedFactCount = evidence.observedFacts.length;

  const issues: string[] = [];
  if (failedSources > 0) {
    issues.push(
      locale === "fr"
        ? `${failedSources} source${failedSources === 1 ? "" : "s"} indisponible${failedSources === 1 ? "" : "s"} ou exclue${failedSources === 1 ? "" : "s"}.`
        : `${failedSources} source${failedSources === 1 ? " was" : "s were"} unavailable or excluded.`,
    );
  }
  for (const limit of evidence.inferenceLimits.slice(0, 2)) {
    uniquePush(issues, localizeAgentEvidenceText(limit, locale));
  }

  if (verifiedSources === 0) {
    return {
      level: "low",
      verifiedSources,
      failedSources,
      inferenceLimitCount,
      observedFactCount,
      summary:
        locale === "fr"
          ? "Aucune source verifiee en direct ne soutient encore cette reponse."
          : "No verified live source supports this answer yet.",
      issues,
    };
  }

  if (failedSources === 0 && inferenceLimitCount <= 1 && verifiedSources >= 2) {
    return {
      level: "high",
      verifiedSources,
      failedSources,
      inferenceLimitCount,
      observedFactCount,
      summary:
        locale === "fr"
          ? `${verifiedSources} sources verifiees soutiennent la recommandation.`
          : `${verifiedSources} verified sources support the recommendation.`,
      issues,
    };
  }

  return {
    level: "medium",
    verifiedSources,
    failedSources,
    inferenceLimitCount,
    observedFactCount,
    summary:
      locale === "fr"
        ? "Des preuves utiles existent, mais certaines limites doivent etre verifiees."
        : "Useful evidence exists, but the answer still has limits worth checking.",
    issues,
  };
}

export function buildConfirmationPreview(
  confirmation: AgentActionConfirmation,
  locale: "en" | "fr" = "en",
): ConfirmationPreview {
  const args = isRecord(confirmation.args) ? confirmation.args : {};
  const entities: ConfirmationEntityChip[] = [];
  const impact: string[] = [];

  const toolName = confirmation.toolName;
  const candidateId = readString(args, "candidateId");
  const jobId = readString(args, "jobId");
  const cvId = readString(args, "cvId");
  const interviewId = readString(args, "interviewId");
  const managerId = readString(args, "managerId");
  const hrId = readString(args, "hrId");
  const newStage = readString(args, "newStage");
  const status = readString(args, "status");
  const title = readString(args, "title") ?? readString(args, "taskTitle");
  const email = readString(args, "email") ?? readString(args, "toEmail");
  const seniority = readString(args, "seniority");
  const mustHaveCount = Array.isArray(args.mustHave)
    ? args.mustHave.filter((value): value is string => typeof value === "string").length
    : 0;
  const candidateIds = Array.isArray(args.candidateIds)
    ? args.candidateIds.filter((value): value is string => typeof value === "string")
    : [];

  if (candidateId) {
    entities.push({
      label: locale === "fr" ? "Candidat" : "Candidate",
      value: compactValue(candidateId),
    });
  }
  if (candidateIds.length > 0) {
    entities.push({
      label: locale === "fr" ? "Candidats" : "Candidates",
      value: String(candidateIds.length),
    });
  }
  if (jobId) {
    entities.push({
      label: locale === "fr" ? "Poste" : "Job",
      value: compactValue(jobId),
    });
  }
  if (cvId) entities.push({ label: "CV", value: compactValue(cvId) });
  if (interviewId) {
    entities.push({
      label: locale === "fr" ? "Entretien" : "Interview",
      value: compactValue(interviewId),
    });
  }
  if (email) {
    entities.push({
      label: locale === "fr" ? "Destinataire" : "Recipient",
      value: email,
    });
  }
  if (seniority) {
    entities.push({
      label: locale === "fr" ? "Seniorite" : "Seniority",
      value: seniority,
    });
  }
  if (mustHaveCount > 0) {
    entities.push({
      label: locale === "fr" ? "Indispensables" : "Must-have",
      value: String(mustHaveCount),
    });
  }

  uniquePush(
    impact,
    newStage
      ? locale === "fr"
        ? `L'etape passera a ${formatConfirmationToken(newStage, locale)}.`
        : `Stage will change to ${formatConfirmationToken(newStage, locale)}.`
      : null,
  );
  uniquePush(
    impact,
    status
      ? locale === "fr"
        ? `Le statut passera a ${formatConfirmationToken(status, locale)}.`
        : `Status will become ${formatConfirmationToken(status, locale)}.`
      : null,
  );
  uniquePush(
    impact,
    managerId
      ? locale === "fr"
        ? `La responsabilite sera transferee au manager ${compactValue(managerId)}.`
        : `Responsibility will move to manager ${compactValue(managerId)}.`
      : null,
  );
  uniquePush(
    impact,
    hrId
      ? locale === "fr"
        ? `La responsabilite sera transferee aux RH ${compactValue(hrId)}.`
        : `Responsibility will move to HR ${compactValue(hrId)}.`
      : null,
  );
  uniquePush(
    impact,
    title
      ? locale === "fr"
        ? `Un nouvel element intitule « ${title} » sera cree ou mis a jour.`
        : `A new item titled “${title}” will be created or updated.`
      : null,
  );
  if (/assign_cv_to_job/i.test(toolName)) {
    uniquePush(
      impact,
      locale === "fr"
        ? "Cette action associe un CV a un poste et cree un enregistrement candidat dans le pipeline."
        : "This links a CV to a job and creates a pipeline candidate record.",
    );
  }
  if (/create_job/i.test(toolName)) {
    uniquePush(
      impact,
      mustHaveCount > 0
        ? locale === "fr"
          ? `Une exigence de poste sera creee avec ${mustHaveCount} element${mustHaveCount === 1 ? "" : "s"} indispensable${mustHaveCount === 1 ? "" : "s"}.`
          : `A job requirement will be created with ${mustHaveCount} must-have item${mustHaveCount === 1 ? "" : "s"}.`
        : locale === "fr"
          ? "Une exigence de poste sera creee a partir de la description generee."
          : "A job requirement will be created from the generated description.",
    );
  }
  if (/schedule_interview/i.test(toolName)) {
    uniquePush(
      impact,
      locale === "fr"
        ? "Les donnees de planification de l'entretien seront enregistrees et pourront declencher des notifications."
        : "Interview planning data will be persisted and can trigger notifications.",
    );
  }
  if (/send_/i.test(toolName)) {
    uniquePush(
      impact,
      locale === "fr"
        ? "Une communication destinee au candidat sera journalisee et envoyee."
        : "A candidate-facing communication will be logged and sent.",
    );
  }
  if (/delete|close|cancel/i.test(toolName)) {
    uniquePush(
      impact,
      locale === "fr"
        ? "Cette modification peut masquer, cloturer ou annuler un element existant du workflow."
        : "This change can hide, close, or reverse an existing workflow item.",
    );
  }
  if (impact.length === 0) {
    impact.push(
      locale === "fr"
        ? "Cette action modifie les donnees de recrutement et sera inscrite dans le journal d'audit."
        : "This action changes recruitment data and will be written to the audit trail.",
    );
  }

  const riskLevel = HIGH_RISK_TOOL_RE.test(toolName)
    ? "high"
    : MEDIUM_RISK_TOOL_RE.test(toolName)
      ? "medium"
      : "low";

  return {
    riskLevel,
    riskLabel:
      locale === "fr"
        ? riskLevel === "high"
          ? "Risque eleve"
          : riskLevel === "medium"
            ? "Risque moyen"
            : "Risque faible"
        : riskLevel === "high"
          ? "High risk"
          : riskLevel === "medium"
            ? "Medium risk"
            : "Low risk",
    entities,
    impact,
  };
}

export function getConfirmationExpiryState(
  expiresAt: string,
  now: number = Date.now(),
  locale: "en" | "fr" = "en",
): { expired: boolean; label: string } {
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return {
      expired: false,
      label: locale === "fr" ? "Expiration indisponible" : "Expiration unavailable",
    };
  }

  const diffMs = expiresAtMs - now;
  if (diffMs <= 0) {
    return { expired: true, label: locale === "fr" ? "Expiree" : "Expired" };
  }

  const totalSeconds = Math.ceil(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return {
      expired: false,
      label:
        locale === "fr"
          ? `Expire dans ${hours} h ${minutes} min`
          : `Expires in ${hours}h ${minutes}m`,
    };
  }

  if (minutes > 0) {
    return {
      expired: false,
      label:
        locale === "fr"
          ? `Expire dans ${minutes} min ${seconds} s`
          : `Expires in ${minutes}m ${seconds}s`,
    };
  }

  return {
    expired: false,
    label:
      locale === "fr"
        ? `Expire dans ${seconds} s`
        : `Expires in ${seconds}s`,
  };
}
