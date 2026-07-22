import * as z from "zod/v3";

import type { RecruitmentAnalyticsChartDatum } from "../types";
import type { ToolExecutionRecord } from "./statistics-chat-types";

type PipelineStageKind = "active" | "accepted" | "rejected" | "terminal";

interface PipelineStageDefinition {
  key: string;
  label: string;
  kind: PipelineStageKind;
}
interface PipelineStageGroupDefinition {
  id: string;
  label: string;
  labelFr: string;
  stageKeys: readonly string[];
}



const PIPELINE_STAGE_DEFINITIONS: readonly PipelineStageDefinition[] = [
  { key: "new", label: "New", kind: "active" },
  { key: "ta_screening", label: "TA screening", kind: "active" },
  { key: "ta_interview", label: "TA interview", kind: "active" },
  { key: "ta_accepted", label: "TA accepted", kind: "accepted" },
  { key: "ta_rejected", label: "TA rejected", kind: "rejected" },
  { key: "manager_interview", label: "Manager interview", kind: "active" },
  { key: "manager_accepted", label: "Manager accepted", kind: "accepted" },
  { key: "manager_rejected", label: "Manager rejected", kind: "rejected" },
  { key: "hr_interview", label: "HR interview", kind: "active" },
  { key: "hr_accepted", label: "HR accepted", kind: "accepted" },
  { key: "hr_rejected", label: "HR rejected", kind: "rejected" },
  { key: "hired", label: "Hired", kind: "terminal" },
];
const PIPELINE_STAGE_GROUPS: readonly PipelineStageGroupDefinition[] = [
  {
    id: "sourcing_group",
    label: "Sourcing",
    labelFr: "Sourcing",
    stageKeys: ["new"],
  },
  {
    id: "ta_group",
    label: "Talent acquisition",
    labelFr: "Acquisition de talents",
    stageKeys: ["ta_screening", "ta_interview", "ta_accepted", "ta_rejected"],
  },
  {
    id: "manager_group",
    label: "Manager review",
    labelFr: "Revue du responsable",
    stageKeys: [
      "manager_interview",
      "manager_accepted",
      "manager_rejected",
    ],
  },
  {
    id: "hr_group",
    label: "Human resources",
    labelFr: "Ressources humaines",
    stageKeys: ["hr_interview", "hr_accepted", "hr_rejected", "hired"],
  },
];



const FR_STAGE_LABELS: Readonly<Record<string, string>> = {
  new: "Nouveau",
  ta_screening: "Présélection TA",
  ta_interview: "Entretien TA",
  ta_accepted: "Accepté par TA",
  ta_rejected: "Refusé par TA",
  manager_interview: "Entretien responsable",
  manager_accepted: "Accepté par le responsable",
  manager_rejected: "Refusé par le responsable",
  hr_interview: "Entretien RH",
  hr_accepted: "Accepté par les RH",
  hr_rejected: "Refusé par les RH",
  hired: "Embauché",
};


const MAIN_PIPELINE_EDGES: readonly [string, string][] = [
  ["new", "ta_screening"],
  ["ta_screening", "ta_interview"],
  ["ta_interview", "ta_accepted"],
  ["ta_accepted", "manager_interview"],
  ["manager_interview", "manager_accepted"],
  ["manager_accepted", "hr_interview"],
  ["hr_interview", "hr_accepted"],
  ["hr_accepted", "hired"],
];

const REJECTION_EDGES: readonly [string, string][] = [
  ["ta_screening", "ta_rejected"],
  ["ta_interview", "ta_rejected"],
  ["manager_interview", "manager_rejected"],
  ["hr_interview", "hr_rejected"],
];

const BOTTLENECK_STAGE_KEYS = new Set(
  PIPELINE_STAGE_DEFINITIONS
    .filter((stage) => stage.kind !== "rejected" && stage.kind !== "terminal")
    .map((stage) => stage.key),
);

const CANDIDATE_STAGE_ORDER = PIPELINE_STAGE_DEFINITIONS.map((stage) => stage.key);

const DIAGRAM_REQUEST_RE =
  /\b(mermaid|diagram|diagramme|diagrames|schema|schéma|flow|workflow|process|map|visual|visuali[sz]e)\b/i;

const funnelSchema = z.record(z.string(), z.number().finite().nonnegative());
const smartInsightsSchema = z.object({ pipelineFunnel: funnelSchema });
const dashboardStatsSchema = z.object({ stageBreakdown: funnelSchema });
const adminAnalyticsSchema = z.object({ pipelineFunnel: funnelSchema });

const MERMAID_FENCE_RE =
  /```[ \t]*(?:mermaid)?[ \t]*(?:\r?\n)(\s*(?:graph|flowchart)\s+(?:TD|TB|BT|RL|LR)[\s\S]*?)```/gi;

export function normalizeMermaidCodeFences(content: string): string {
  return content.replace(
    MERMAID_FENCE_RE,
    (_match, diagramBody: string) => `\`\`\`mermaid\n${diagramBody.trimEnd()}\n\`\`\``,
  );
}

export function stripMermaidCodeFences(content: string): string {
  return content.replace(MERMAID_FENCE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}


export function shouldBuildRecruitmentDiagram(question: string): boolean {
  return DIAGRAM_REQUEST_RE.test(question);
}

function extractPipelineFunnel(records: readonly ToolExecutionRecord[]): Record<string, number> | null {
  for (const record of records) {
    if (!record.result.success) {
      continue;
    }

    if (record.toolName === "get_smart_insights") {
      const parsed = smartInsightsSchema.safeParse(record.result.data);
      if (parsed.success) {
        return parsed.data.pipelineFunnel;
      }
    }

    if (record.toolName === "get_dashboard_stats") {
      const parsed = dashboardStatsSchema.safeParse(record.result.data);
      if (parsed.success) {
        return parsed.data.stageBreakdown;
      }
    }

    if (record.toolName === "get_recruitment_analytics") {
      const parsed = adminAnalyticsSchema.safeParse(record.result.data);
      if (parsed.success) {
        return parsed.data.pipelineFunnel;
      }
    }
  }

  return null;
}

function buildPipelineData(funnel: Record<string, number>): RecruitmentAnalyticsChartDatum[] {
  return PIPELINE_STAGE_DEFINITIONS.map((stage) => ({
    label: stage.label,
    count: funnel[stage.key] ?? 0,
  }));
}

function getStageDefinition(stageKey: string): PipelineStageDefinition {
  const stage = PIPELINE_STAGE_DEFINITIONS.find((item) => item.key === stageKey);
  if (!stage) {
    throw new Error(`Unknown pipeline stage: ${stageKey}`);
  }

  return stage;
}

function getStageNodeId(stageKey: string): string {
  return `stage_${stageKey}`;
}

function formatCandidateCount(count: number): string {
  return `${count} ${count === 1 ? "candidate" : "candidates"}`;
}

function formatLocalizedCandidateCount(
  count: number,
  locale: "en" | "fr",
): string {
  if (locale === "fr") {
    return `${count} candidat${count === 1 ? "" : "s"}`;
  }
  return formatCandidateCount(count);
}

function localizeStageLabel(
  stage: PipelineStageDefinition,
  locale: "en" | "fr",
): string {
  return locale === "fr" ? FR_STAGE_LABELS[stage.key] ?? stage.label : stage.label;
}
function localizeStageGroupLabel(
  group: PipelineStageGroupDefinition,
  locale: "en" | "fr",
): string {
  return locale === "fr" ? group.labelFr : group.label;
}


function getBottleneckStageKey(funnel: Record<string, number>): string | null {
  let bottleneckKey: string | null = null;
  let bottleneckCount = 0;

  for (const stageKey of CANDIDATE_STAGE_ORDER) {
    if (!BOTTLENECK_STAGE_KEYS.has(stageKey)) {
      continue;
    }

    const count = funnel[stageKey] ?? 0;
    if (count > bottleneckCount) {
      bottleneckKey = stageKey;
      bottleneckCount = count;
    }
  }

  return bottleneckCount > 0 ? bottleneckKey : null;
}

function getStageClass(stage: PipelineStageDefinition, count: number, bottleneckKey: string | null): string {
  if (count === 0) return "empty";
  if (stage.key === bottleneckKey) return "hot";
  if (stage.kind === "rejected") return "rejected";
  if (stage.kind === "accepted" || stage.kind === "terminal") return "done";
  return "default";
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/"/g, "'");
}

export function buildRecruitmentMermaidDiagramFromToolRecords(
  records: readonly ToolExecutionRecord[],
  options: { question: string; locale?: "en" | "fr" },
): string | null {
  if (!shouldBuildRecruitmentDiagram(options.question)) {
    return null;
  }

  const funnel = extractPipelineFunnel(records);
  if (!funnel) {
    return null;
  }
  const locale = options.locale ?? "en";

  const pipelineData = buildPipelineData(funnel);
  const dataByStageKey = new Map(
    CANDIDATE_STAGE_ORDER.map((stageKey, index) => [stageKey, pipelineData[index]] as const),
  );
  const bottleneckKey = getBottleneckStageKey(funnel);
  const bottleneckStage = bottleneckKey ? getStageDefinition(bottleneckKey) : null;
  const bottleneckCount = bottleneckKey ? funnel[bottleneckKey] ?? 0 : 0;

  const lines = ["```mermaid", "flowchart TD"];

  for (const group of PIPELINE_STAGE_GROUPS) {
    lines.push(
      `  subgraph ${group.id}["${escapeMermaidLabel(
        localizeStageGroupLabel(group, locale),
      )}"]`,
    );
    lines.push("    direction TB");

    for (const stageKey of group.stageKeys) {
      const stage = getStageDefinition(stageKey);
      const datum = dataByStageKey.get(stage.key);
      const count = typeof datum?.count === "number" ? datum.count : 0;
      const nodeId = getStageNodeId(stage.key);
      const label = `${localizeStageLabel(stage, locale)}<br/>${formatLocalizedCandidateCount(count, locale)}`;
      lines.push(`    ${nodeId}["${escapeMermaidLabel(label)}"]`);
    }

    lines.push("  end");
  }

  for (const [fromStage, toStage] of MAIN_PIPELINE_EDGES) {
    lines.push(`  ${getStageNodeId(fromStage)} --> ${getStageNodeId(toStage)}`);
  }

  for (const [fromStage, toStage] of REJECTION_EDGES) {
    lines.push(`  ${getStageNodeId(fromStage)} -.-> ${getStageNodeId(toStage)}`);
  }

  lines.push("  classDef default fill:#eef2ff,stroke:#4f46e5,stroke-width:2px,color:#111827;");
  lines.push("  classDef hot fill:#fff7ed,stroke:#f97316,stroke-width:3px,color:#7c2d12;");
  lines.push("  classDef empty fill:#f8fafc,stroke:#cbd5e1,stroke-width:2px,color:#64748b;");
  lines.push("  classDef done fill:#ecfdf5,stroke:#10b981,stroke-width:2px,color:#064e3b;");
  lines.push("  classDef rejected fill:#fef2f2,stroke:#ef4444,stroke-width:2px,color:#7f1d1d;");
  lines.push("  linkStyle default stroke:#94a3b8,stroke-width:2px;");

  for (const stageKey of CANDIDATE_STAGE_ORDER) {
    const stage = getStageDefinition(stageKey);
    const datum = dataByStageKey.get(stageKey);
    const count = typeof datum?.count === "number" ? datum.count : 0;
    const stageClass = getStageClass(stage, count, bottleneckKey);
    if (stageClass !== "default") {
      lines.push(`  class ${getStageNodeId(stageKey)} ${stageClass};`);
    }
  }

  lines.push("```");

  const summary = bottleneckStage
    ? locale === "fr"
      ? `Carte du pipeline generee a partir des comptes d'etapes recuperes. Blocage mis en evidence : ${localizeStageLabel(bottleneckStage, locale)} (${formatLocalizedCandidateCount(bottleneckCount, locale)}).`
      : `Pipeline map generated from fetched stage counts. Highlighted bottleneck: ${bottleneckStage.label} (${formatCandidateCount(bottleneckCount)}).`
    : locale === "fr"
      ? "Carte du pipeline generee a partir des comptes d'etapes recuperes. Aucun blocage actif n'etait visible dans les etapes recuperees."
      : "Pipeline map generated from fetched stage counts. No active bottleneck was visible in the fetched stages.";

  return [
    locale === "fr" ? "## Diagramme" : "## Diagram",
    summary,
    "",
    lines.join("\n"),
  ].join("\n");
}
