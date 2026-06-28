import * as z from "zod/v3";

import type { RecruitmentAnalyticsChartDatum } from "../types";
import type { ToolExecutionRecord } from "./statistics-chat-types";

type PipelineStageKind = "active" | "accepted" | "rejected" | "terminal";

interface PipelineStageDefinition {
  key: string;
  label: string;
  groupId: string;
  kind: PipelineStageKind;
}

interface PipelineStageGroup {
  id: string;
  title: string;
  stageKeys: string[];
}

const PIPELINE_STAGE_DEFINITIONS: readonly PipelineStageDefinition[] = [
  { key: "new", label: "New", groupId: "sourcing_group", kind: "active" },
  { key: "ta_screening", label: "TA screening", groupId: "ta_group", kind: "active" },
  { key: "ta_interview", label: "TA interview", groupId: "ta_group", kind: "active" },
  { key: "ta_accepted", label: "TA accepted", groupId: "ta_group", kind: "accepted" },
  { key: "ta_rejected", label: "TA rejected", groupId: "ta_group", kind: "rejected" },
  { key: "manager_interview", label: "Manager interview", groupId: "manager_group", kind: "active" },
  { key: "manager_accepted", label: "Manager accepted", groupId: "manager_group", kind: "accepted" },
  { key: "manager_rejected", label: "Manager rejected", groupId: "manager_group", kind: "rejected" },
  { key: "hr_interview", label: "HR interview", groupId: "hr_group", kind: "active" },
  { key: "hr_accepted", label: "HR accepted", groupId: "hr_group", kind: "accepted" },
  { key: "hr_rejected", label: "HR rejected", groupId: "hr_group", kind: "rejected" },
  { key: "hired", label: "Hired", groupId: "outcome_group", kind: "terminal" },
];

const PIPELINE_STAGE_GROUPS: readonly PipelineStageGroup[] = [
  { id: "sourcing_group", title: "Sourcing", stageKeys: ["new"] },
  {
    id: "ta_group",
    title: "Talent acquisition",
    stageKeys: ["ta_screening", "ta_interview", "ta_accepted", "ta_rejected"],
  },
  {
    id: "manager_group",
    title: "Manager review",
    stageKeys: ["manager_interview", "manager_accepted", "manager_rejected"],
  },
  {
    id: "hr_group",
    title: "HR validation",
    stageKeys: ["hr_interview", "hr_accepted", "hr_rejected"],
  },
  { id: "outcome_group", title: "Outcome", stageKeys: ["hired"] },
];

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
  options: { question: string },
): string | null {
  if (!shouldBuildRecruitmentDiagram(options.question)) {
    return null;
  }

  const funnel = extractPipelineFunnel(records);
  if (!funnel) {
    return null;
  }

  const pipelineData = buildPipelineData(funnel);
  const dataByStageKey = new Map(
    CANDIDATE_STAGE_ORDER.map((stageKey, index) => [stageKey, pipelineData[index]] as const),
  );
  const bottleneckKey = getBottleneckStageKey(funnel);
  const bottleneckStage = bottleneckKey ? getStageDefinition(bottleneckKey) : null;
  const bottleneckCount = bottleneckKey ? funnel[bottleneckKey] ?? 0 : 0;

  const lines = ["```mermaid", "flowchart TD"];

  for (const group of PIPELINE_STAGE_GROUPS) {
    lines.push(`  subgraph ${group.id}["${escapeMermaidLabel(group.title)}"]`);
    lines.push("    direction TB");

    for (const stageKey of group.stageKeys) {
      const stage = getStageDefinition(stageKey);
      const datum = dataByStageKey.get(stageKey);
      const count = typeof datum?.count === "number" ? datum.count : 0;
      const nodeId = getStageNodeId(stageKey);
      const label = `${stage.label}<br/>${formatCandidateCount(count)}`;
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
    ? `Grouped pipeline map generated from fetched stage counts. Highlighted bottleneck: ${bottleneckStage.label} (${formatCandidateCount(bottleneckCount)}).`
    : "Grouped pipeline map generated from fetched stage counts. No active bottleneck was visible in the fetched stages.";

  return [
    "## Diagram",
    summary,
    "",
    lines.join("\n"),
  ].join("\n");
}
