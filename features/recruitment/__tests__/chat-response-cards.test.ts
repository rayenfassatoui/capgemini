import { describe, expect, it } from "vitest";

import {
  appendChatResponseCardsToContent,
  extractChatResponseCardsFromContent,
  parseChatResponseCardEvent,
  serializeChatResponseCardEvent,
} from "../chat-card-events";
import { buildResponseCardsFromToolRecords } from "../services/chat-response-cards";
import type { RecruitmentResponseCard } from "../types";
import type { ToolExecutionRecord } from "../services/statistics-chat-types";

const pipelineCard: RecruitmentResponseCard = {
  id: "pipeline-dashboard",
  kind: "pipeline",
  title: "Pipeline snapshot",
  description: "Live counters.",
  tone: "warning",
  sourceTool: "get_dashboard_stats",
  metrics: [
    { label: "Pipeline candidates", value: "12" },
    { label: "Pending screenings", value: "4", tone: "warning" },
  ],
  bullets: ["TA Screening has 5 candidates."],
  actions: [{ label: "Open dashboard", href: "/ta/dashboard" }],
};

describe("chat response cards", () => {
  it("serializes structured cards without leaking marker lines into visible content", () => {
    const line = serializeChatResponseCardEvent(pipelineCard);
    const parsed = parseChatResponseCardEvent(line);
    const content = appendChatResponseCardsToContent("Observed pipeline state.", [pipelineCard]);
    const extracted = extractChatResponseCardsFromContent(content);

    expect(parsed).toMatchObject({
      id: "pipeline-dashboard",
      kind: "pipeline",
      title: "Pipeline snapshot",
    });
    expect(extracted.content).toBe("Observed pipeline state.");
    expect(extracted.cards).toHaveLength(1);
    expect(extracted.cards[0]?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Pipeline candidates", value: "12" }),
      ]),
    );
  });

  it("builds candidate, pipeline, and governance cards from grounded tool records", () => {
    const records: ToolExecutionRecord[] = [
      {
        toolName: "match_cvs_to_job",
        args: { jobId: "job-1" },
        result: {
          success: true,
          data: [
            {
              cvId: "cv-1",
              candidateName: "Amina Trabelsi",
              matchScore: 92,
              matchedMustHave: ["React", "TypeScript"],
              gaps: ["Kubernetes"],
              jobTitle: "Frontend Engineer",
            },
          ],
        },
        mutating: false,
      },
      {
        toolName: "get_dashboard_stats",
        args: {},
        result: {
          success: true,
          data: {
            totalCandidates: 12,
            totalJobs: 3,
            totalInterviewsToday: 2,
            pendingScreenings: 4,
            stageBreakdown: {
              new: 1,
              ta_screening: 5,
              hired: 1,
            },
          },
        },
        mutating: false,
      },
      {
        toolName: "get_activity_log_enriched",
        args: {},
        result: {
          success: true,
          data: [
            {
              id: "activity-1",
              action: "delete_candidate",
              userName: "Admin User",
              entityType: "candidate",
            },
          ],
        },
        mutating: false,
      },
    ];

    const cards = buildResponseCardsFromToolRecords(records, {
      role: "ta",
      maxCards: 3,
    });

    expect(cards.map((card) => card.kind)).toEqual([
      "candidate",
      "pipeline",
      "governance",
    ]);
    expect(cards[0]).toMatchObject({
      title: "Amina Trabelsi",
      metrics: expect.arrayContaining([
        expect.objectContaining({ label: "Fit", value: "92%" }),
      ]),
      actions: expect.arrayContaining([
        expect.objectContaining({ label: "Open CV", href: "/ta/cv-pool?reviewCvId=cv-1" }),
      ]),
    });
    expect(cards[1].bullets?.join(" ")).toContain("TA Screening has 5 candidates");
    expect(cards[2].metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "High-risk events", value: "1" }),
      ]),
    );
  });
  it("renders pipeline roster cards without shortlist language or fake gap counts", () => {
    const cards = buildResponseCardsFromToolRecords(
      [
        {
          toolName: "get_candidates_by_stage",
          args: { stages: ["manager_interview"] },
          result: {
            success: true,
            data: [
              {
                id: "candidate-1",
                fullName: "Mohamed Khayredine Gabsi",
                stage: "manager_interview",
                jobTitle: "Senior AI Engineer",
              },
            ],
          },
          mutating: false,
        },
      ],
      { role: "manager", maxCards: 1 },
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: "Mohamed Khayredine Gabsi",
      description: "Candidate returned by the current role-scoped pipeline query.",
      bullets: ["Assigned to Senior AI Engineer."],
      actions: [
        {
          label: "Open candidate",
          href: "/manager/candidates/candidate-1",
        },
      ],
    });
    expect(cards[0]?.metrics.some((metric) => metric.label === "Gaps")).toBe(
      false,
    );
    expect(cards[0]?.actions?.some((action) => action.label === "Compare top candidates") ?? false).toBe(
      false,
    );
  });

});
