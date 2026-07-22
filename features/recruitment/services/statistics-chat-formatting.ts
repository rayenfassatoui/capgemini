import { buildDeterministicToolFallback } from "./chat-orchestration";
import { maskUserIdForTelemetry } from "./candidate-grounding";
import {
  type ToolExecutionRecord,
  type ToolTraceJson,
} from "./statistics-chat-types";

const SENSITIVE_TRACE_KEY_RE =
  /password|token|apiKey|apikey|api_key|secret|authorization|rawBytes|base64|binaryData|_attachment/i;

export function getToolSummary(result: {
  success: boolean;
  data?: unknown;
  error?: string;
}): string {
  if (!result.success) {
    return result.error ?? "Failed";
  }

  if (Array.isArray(result.data)) {
    return `Returned ${result.data.length} result(s)`;
  }

  if (result.data && typeof result.data === "object") {
    return "Completed successfully";
  }

  return "Done";
}

export function sanitizeToolTraceValue(value: unknown): ToolTraceJson {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeToolTraceValue(item));
  }

  if (typeof value === "object") {
    const sanitized: Record<string, ToolTraceJson> = {};

    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      sanitized[key] = SENSITIVE_TRACE_KEY_RE.test(key)
        ? "[REDACTED]"
        : sanitizeToolTraceValue(nestedValue);
    }

    return sanitized;
  }

  return String(value);
}

export function inferToolPurpose(
  toolName: string,
  args: Record<string, unknown>,
  locale: "en" | "fr" = "en",
): string {
  const localized = (english: string, french: string) =>
    locale === "fr" ? french : english;

  if (toolName.includes("search")) {
    const query = typeof args.query === "string" ? args.query : undefined;
    return query
      ? localized(
          `Search recruitment data for "${query}"`,
          `Rechercher dans les donnees de recrutement pour "${query}"`,
        )
      : localized(
          "Search recruitment data",
          "Rechercher dans les donnees de recrutement",
        );
  }

  if (toolName.startsWith("list_")) {
    return localized(
      "List available recruitment records",
      "Lister les enregistrements de recrutement disponibles",
    );
  }
  if (toolName.startsWith("get_")) {
    return localized(
      "Fetch detailed recruitment data",
      "Recuperer les donnees de recrutement detaillees",
    );
  }
  if (toolName.includes("compare")) {
    return localized(
      "Compare candidate fit and ranking",
      "Comparer l'adequation et le classement des candidats",
    );
  }
  if (toolName.includes("match")) {
    return localized(
      "Score candidate/job fit",
      "Evaluer l'adequation entre le candidat et le poste",
    );
  }
  if (toolName.includes("upload")) {
    return localized(
      "Process an uploaded CV file",
      "Traiter un fichier CV televerse",
    );
  }
  if (toolName.includes("generate")) {
    return localized(
      "Generate AI-assisted recruitment output",
      "Generer un resultat de recrutement assiste par IA",
    );
  }
  if (toolName.includes("update")) {
    return localized(
      "Update recruitment workflow state",
      "Mettre a jour l'etat du workflow de recrutement",
    );
  }
  if (toolName.includes("delete")) {
    return localized(
      "Delete recruitment data",
      "Supprimer des donnees de recrutement",
    );
  }

  return localized(
    `Run ${toolName.replace(/_/g, " ")}`,
    `Executer ${toolName.replace(/_/g, " ")}`,
  );
}

export function buildDeterministicFallbackFromRecords(
  records: ToolExecutionRecord[],
): string | null {
  const successful = records.filter((record) => record.result.success);
  if (successful.length === 0) {
    return null;
  }

  const analyticsFallback = buildAnalyticsFallbackFromRecords(successful);
  if (analyticsFallback) {
    return analyticsFallback;
  }

  const prioritizedToolNames = [
    "compare_candidates",
    "hybrid_search_cvs",
    "rag_search_cvs",
    "semantic_search_cvs",
    "match_cvs_to_job",
    "match_cvs_to_job_with_filters",
    "get_dashboard_stats",
    "get_smart_insights",
    "get_cv_pool_stats",
    "get_jobs_stats",
  ];

  const prioritized =
    prioritizedToolNames
      .map((name) =>
        [...successful].reverse().find((record) => record.toolName === name),
      )
      .find(Boolean) ?? [...successful].reverse()[0];

  if (!prioritized || !prioritized.result.data) {
    return null;
  }

  const fallback = buildDeterministicToolFallback(
    prioritized.toolName,
    prioritized.result.data,
  );

  if (fallback) {
    return fallback;
  }

  return `I’m returning a deterministic fallback summary from the data that was already fetched successfully. Latest successful tool: **${prioritized.toolName}**.`;
}

export function isJobRosterIntent(message: string): boolean {
  const normalized = message.toLowerCase();
  const asksForJobs =
    /\b(jobs?|roles?|positions?|requisitions?|postes?|emplois?)\b/.test(
      normalized,
    );
  const asksForRoster =
    /\b(list|show|display|all|open|exact|title|seniority|business\s+unit|status|liste|affiche|tous|toutes|ouverts?|exact|titre|seniorite|unite\s+commerciale|statut)\b/.test(
      normalized,
    );
  const asksForMutation =
    /\b(create|publish|write|generate|close|delete|update|creer|publier|rediger|generer|fermer|supprimer|modifier)\b/.test(
      normalized,
    );

  return asksForJobs && asksForRoster && !asksForMutation;
}

function escapeMarkdownTableValue(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export function buildDeterministicJobRosterResponse(
  records: readonly ToolExecutionRecord[],
  userMessage: string,
  locale: "en" | "fr" = "en",
): string | null {
  if (!isJobRosterIntent(userMessage)) return null;

  const listJobsRecord = [...records]
    .reverse()
    .find(
      (record) =>
        record.toolName === "list_jobs" &&
        record.result.success &&
        Array.isArray(record.result.data),
    );
  if (!listJobsRecord || !Array.isArray(listJobsRecord.result.data)) {
    return null;
  }

  const onlyOpen = /\bopen\b/i.test(userMessage);
  const jobs = listJobsRecord.result.data
    .map(toRecord)
    .filter((job): job is Record<string, unknown> => job !== null)
    .filter((job) => {
      if (!onlyOpen) return true;
      return typeof job.status === "string" && job.status.toLowerCase() === "open";
    })
    .map((job) => ({
      title:
        typeof job.title === "string" && job.title.trim()
          ? job.title.trim()
          : locale === "fr" ? "Poste sans titre" : "Untitled job",
      seniority:
        typeof job.seniority === "string" && job.seniority.trim()
          ? job.seniority.trim()
          : locale === "fr" ? "Non precise" : "Not specified",
      businessUnit:
        typeof job.businessUnit === "string" && job.businessUnit.trim()
          ? job.businessUnit.trim()
          : locale === "fr" ? "Non precise" : "Not specified",
      status:
        typeof job.status === "string" && job.status.trim()
          ? locale === "fr" && job.status.trim().toLowerCase() === "open"
            ? "Ouvert"
            : job.status.trim()
          : locale === "fr"
            ? "Non precise"
            : "Not specified",
    }));

  if (locale === "fr") {
    if (jobs.length === 0) {
      return [
        "## Liste des postes",
        onlyOpen
          ? "Aucun poste ouvert n'a ete retourne par la source limitee a votre role."
          : "Aucun poste n'a ete retourne par la source limitee a votre role.",
        "",
        "## Source",
        "- `list_jobs` a retourne 0 resultat pour l'utilisateur courant.",
      ].join("\n");
    }

    const frenchTable = [
      "| Titre | Seniorite | Unite commerciale | Statut |",
      "|-------|-----------|--------------------|--------|",
      ...jobs.map(
        (job) =>
          `| ${escapeMarkdownTableValue(job.title)} | ${escapeMarkdownTableValue(job.seniority)} | ${escapeMarkdownTableValue(job.businessUnit)} | ${escapeMarkdownTableValue(job.status)} |`,
      ),
    ].join("\n");

    return [
      "## Liste des postes",
      `J'ai trouve **${jobs.length}** poste${jobs.length === 1 ? "" : "s"}${onlyOpen ? " ouvert" + (jobs.length === 1 ? "" : "s") : ""} dans le perimetre de votre role.`,
      "",
      frenchTable,
      "",
      "## Source",
      `- Resultat de \`list_jobs\` limite au role : ${jobs.length} enregistrement${jobs.length === 1 ? "" : "s"}.`,
      "- Les titres, niveaux de seniorite, unites commerciales et statuts proviennent directement du resultat de l'outil ; aucun candidat de secours n'a ete utilise.",
    ].join("\n");
  }

  if (jobs.length === 0) {
    return [
      "## Job roster",
      onlyOpen
        ? "No open jobs were returned by the role-scoped job source."
        : "No jobs were returned by the role-scoped job source.",
      "",
      "## Source",
      "- `list_jobs` returned 0 records for the current user.",
    ].join("\n");
  }

  const table = [
    "| Title | Seniority | Business unit | Status |",
    "|-------|-----------|---------------|--------|",
    ...jobs.map(
      (job) =>
        `| ${escapeMarkdownTableValue(job.title)} | ${escapeMarkdownTableValue(job.seniority)} | ${escapeMarkdownTableValue(job.businessUnit)} | ${escapeMarkdownTableValue(job.status)} |`,
    ),
  ].join("\n");

  return [
    "## Job roster",
    `I found **${jobs.length}** ${onlyOpen ? "open " : ""}job${jobs.length === 1 ? "" : "s"} in your role scope.`,
    "",
    table,
    "",
    "## Source",
    `- Role-scoped \`list_jobs\` result: ${jobs.length} record${jobs.length === 1 ? "" : "s"}.`,
    "- Titles, seniority levels, business units, and statuses above are copied from the tool result; no candidate fallback was used.",
  ].join("\n");
}

const ANALYTICS_RESPONSE_INTENT_RE =
  /\b(?:analytics?|analyses?|chart|charts|dashboard|diagram|diagramme|funnel|graph|graphe|graphique|kpi|mermaid|pipeline|repartition|répartition|statistiques?)\b/i;

export function buildDeterministicAnalyticsResponse(
  records: ToolExecutionRecord[],
  userMessage: string,
  locale: "en" | "fr" = "en",
): string | null {
  if (!ANALYTICS_RESPONSE_INTENT_RE.test(userMessage)) return null;
  return buildAnalyticsFallbackFromRecords(records, locale);
}

function buildAnalyticsFallbackFromRecords(
  records: ToolExecutionRecord[],
  locale: "en" | "fr" = "en",
): string | null {
  const dashboard = getToolRecordData(records, "get_dashboard_stats");
  const insights = getToolRecordData(records, "get_smart_insights");
  if (!dashboard && !insights) {
    return null;
  }

  const dashboardRecord = toRecord(dashboard);
  const insightsRecord = toRecord(insights);
  const totalCandidates = getNumber(dashboardRecord, "totalCandidates");
  const totalJobs = getNumber(dashboardRecord, "totalJobs");
  const pendingScreenings = getNumber(dashboardRecord, "pendingScreenings");
  const totalInterviewsToday = getNumber(
    dashboardRecord,
    "totalInterviewsToday",
  );
  const stageBreakdown = toNumberRecord(dashboardRecord?.stageBreakdown);
  const pipelineFunnel = toNumberRecord(insightsRecord?.pipelineFunnel);
  const stages = stageBreakdown ?? pipelineFunnel;
  const bottleneck = findTopEntry(stages);
  const skillGap = findLargestSkillGap(insightsRecord?.skillGapAnalysis);
  const topRole = findTopCount(insightsRecord?.mostDemandedJobProfiles, "title");

  const evidence =
    locale === "fr"
      ? [
          totalCandidates === null
            ? null
            : `Candidats assignes au pipeline : **${totalCandidates}**.`,
          totalJobs === null ? null : `Postes accessibles : **${totalJobs}**.`,
          pendingScreenings === null
            ? null
            : `Preselections en attente : **${pendingScreenings}**.`,
          totalInterviewsToday === null
            ? null
            : `Entretiens planifies aujourd'hui : **${totalInterviewsToday}**.`,
          bottleneck
            ? `Etape la plus chargee : **${formatStageLabel(bottleneck.key, locale)}** avec **${bottleneck.value}** candidat${bottleneck.value === 1 ? "" : "s"}.`
            : null,
          skillGap
            ? `Principal ecart de competences : **${skillGap.skill}**, demande **${skillGap.demand}** contre offre **${skillGap.supply}**.`
            : null,
          topRole
            ? `Role le plus demande : **${topRole.label}** avec **${topRole.count}** signal${topRole.count === 1 ? "" : "s"}.`
            : null,
        ]
      : [
          totalCandidates === null
            ? null
            : `Assigned pipeline candidates: **${totalCandidates}**.`,
          totalJobs === null ? null : `Accessible jobs: **${totalJobs}**.`,
          pendingScreenings === null
            ? null
            : `Pending screenings: **${pendingScreenings}**.`,
          totalInterviewsToday === null
            ? null
            : `Interviews scheduled today: **${totalInterviewsToday}**.`,
          bottleneck
            ? `Largest stage: **${formatStageLabel(bottleneck.key, locale)}** with **${bottleneck.value}** candidate${bottleneck.value === 1 ? "" : "s"}.`
            : null,
          skillGap
            ? `Largest skill gap: **${skillGap.skill}**, demand **${skillGap.demand}** versus supply **${skillGap.supply}**.`
            : null,
          topRole
            ? `Most demanded role: **${topRole.label}** with **${topRole.count}** signal${topRole.count === 1 ? "" : "s"}.`
            : null,
        ];

  const distribution = Object.entries(stages ?? {})
    .filter(([, count]) => count > 0)
    .map(
      ([stage, count]) =>
        `- **${formatStageLabel(stage, locale)}** : ${count}`,
    );

  return [
    locale === "fr" ? "# Apercu du pipeline" : "# Pipeline overview",
    ...(evidence.filter((line): line is string => Boolean(line)).map(
      (line) => `- ${line}`,
    )),
    "",
    locale === "fr" ? "## Repartition par etape" : "## Stage distribution",
    ...(distribution.length > 0
      ? distribution
      : [
          locale === "fr"
            ? "- Aucune repartition par etape n'a ete retournee."
            : "- No stage distribution was returned.",
        ]),
    "",
    locale === "fr" ? "## Graphiques et diagramme" : "## Charts and diagram",
    locale === "fr"
      ? "Les graphiques et le diagramme Mermaid ci-dessous proviennent des memes resultats verifies du tableau de bord et des analyses."
      : "The charts and Mermaid diagram below come from the same verified dashboard and insight results.",
    "",
    locale === "fr" ? "## Limite" : "## Caveat",
    locale === "fr"
      ? "- Ces chiffres decrivent uniquement les donnees accessibles au role actuel ; aucune valeur manquante n'a ete deduite."
      : "- These figures describe only data accessible to the current role; no missing value was inferred.",
  ].join("\n");
}

function getToolRecordData(
  records: ToolExecutionRecord[],
  toolName: string,
): unknown {
  return [...records].reverse().find((record) => record.toolName === toolName)
    ?.result.data;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNumber(
  record: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNumberRecord(value: unknown): Record<string, number> | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const result: Record<string, number> = {};
  for (const [key, nestedValue] of Object.entries(record)) {
    if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
      result[key] = nestedValue;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function findTopEntry(
  record: Record<string, number> | null,
): { key: string; value: number } | null {
  if (!record) {
    return null;
  }

  const [key, value] =
    Object.entries(record)
      .filter(([, count]) => count > 0)
      .sort(([, left], [, right]) => right - left)[0] ?? [];
  return typeof key === "string" && typeof value === "number"
    ? { key, value }
    : null;
}

function findLargestSkillGap(value: unknown): {
  skill: string;
  demand: number;
  supply: number;
} | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      const record = toRecord(item);
      const skill = record?.skill;
      const demand = record?.demand;
      const supply = record?.supply;
      if (
        typeof skill !== "string" ||
        typeof demand !== "number" ||
        typeof supply !== "number"
      ) {
        return null;
      }

      return { skill, demand, supply };
    })
    .filter((item): item is { skill: string; demand: number; supply: number } =>
      Boolean(item),
    )
    .sort(
      (left, right) =>
        right.demand - right.supply - (left.demand - left.supply),
    )[0] ?? null;
}

function findTopCount(
  value: unknown,
  labelKey: string,
): { label: string; count: number } | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      const record = toRecord(item);
      const label = record?.[labelKey];
      const count = record?.count;
      if (typeof label !== "string" || typeof count !== "number") {
        return null;
      }

      return { label, count };
    })
    .filter((item): item is { label: string; count: number } => Boolean(item))
    .sort((left, right) => right.count - left.count)[0] ?? null;
}

const FR_STAGE_LABELS: Readonly<Record<string, string>> = {
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
};

function formatStageLabel(
  stage: string,
  locale: "en" | "fr" = "en",
): string {
  if (locale === "fr" && FR_STAGE_LABELS[stage]) {
    return FR_STAGE_LABELS[stage];
  }
  return stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function logGroundingGuardBlock({
  requestId,
  userId,
  rejectedNames,
  toolNames,
}: {
  requestId: string;
  userId: string;
  rejectedNames: string[];
  toolNames: string[];
}) {
  console.warn("[candidate-grounding] blocked ungrounded assistant output", {
    requestId,
    userId: maskUserIdForTelemetry(userId),
    rejectedNames,
    toolNames,
  });
}

export function buildActionConfirmationResponse(
  summary: string,
  locale: "en" | "fr" = "en",
): string {
  return [
    locale === "fr" ? "Confirmation requise." : "Confirmation required.",
    "",
    summary,
    "",
    locale === "fr"
      ? "Verifiez la carte d'action ci-dessous, puis choisissez Confirmer ou Annuler."
      : "Review the action card below, then choose Confirm or Cancel.",
  ].join("\n");
}

export function buildConfirmedActionResponse(
  toolName: string,
  result: { success: boolean; error?: string },
  locale: "en" | "fr" = "en",
): string {
  const actionName = toolName.replace(/_/g, " ");
  if (!result.success) {
    return locale === "fr"
      ? `Je n'ai pas pu terminer **${actionName}** : ${result.error ?? "l'outil a echoue"}.`
      : `I couldn't complete **${actionName}** because: ${result.error ?? "the tool failed"}.`;
  }

  return locale === "fr"
    ? `Termine. L'action confirmee **${actionName}** a ete executee.`
    : `Done. Confirmed action **${actionName}** was executed.`;
}
