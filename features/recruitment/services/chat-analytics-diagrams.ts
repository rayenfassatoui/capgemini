import * as z from "zod/v3";

import type { RecruitmentAnalyticsChartDatum } from "../types";
import type { ToolExecutionRecord } from "./statistics-chat-types";

const CANDIDATE_STAGE_LABELS: Record<string, string> = {
  new: "New",
  ta_screening: "TA screening",
  ta_interview: "TA interview",
  ta_accepted: "TA accepted",
  ta_rejected: "TA rejected",
  manager_interview: "Manager interview",
  manager_accepted: "Manager accepted",
  manager_rejected: "Manager rejected",
  hr_interview: "HR interview",
  hr_accepted: "HR accepted",
  hr_rejected: "HR rejected",
  hired: "Hired",
};

const CANDIDATE_STAGE_ORDER = Object.keys(CANDIDATE_STAGE_LABELS);

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
  const data: RecruitmentAnalyticsChartDatum[] = [];

  for (const stage of CANDIDATE_STAGE_ORDER) {
    data.push({
      label: CANDIDATE_STAGE_LABELS[stage],
      count: funnel[stage] ?? 0,
    });
  }

  return data;
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

  const lines = ["```mermaid", "flowchart LR"];
  pipelineData.forEach((datum, index) => {
    const nodeId = `stage_${index}`;
    const count = typeof datum.count === "number" ? datum.count : 0;
    const candidateLabel = count === 1 ? "candidate" : "candidates";
    lines.push(
      `  ${nodeId}["${escapeMermaidLabel(`${datum.label}<br/>${count} ${candidateLabel}`)}"]`,
    );
  });

  for (let index = 0; index < pipelineData.length - 1; index += 1) {
    lines.push(`  stage_${index} --> stage_${index + 1}`);
  }

  lines.push("```");

  return [
    "## Diagram",
    "Pipeline flow generated from fetched stage counts.",
    "",
    lines.join("\n"),
  ].join("\n");
}
