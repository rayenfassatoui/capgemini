import { describe, expect, it } from "vitest";

import {
  appendChatResponseCardsToContent,
  extractChatResponseCardsFromContent,
  parseChatResponseCardEvent,
  serializeChatResponseCardEvent,
} from "../chat-card-events";
import { buildResponseCardsFromToolRecords } from "../services/chat-response-cards";
import {
  buildDeterministicJobRosterResponse,
  isJobRosterIntent,
} from "../services/statistics-chat-formatting";

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

  it("renders every listed job as a role-scoped job card", () => {
    const cards = buildResponseCardsFromToolRecords(
      [
        {
          toolName: "list_jobs",
          args: {},
          result: {
            success: true,
            data: [
              {
                id: "job-1",
                title: "Senior React Engineer",
                seniority: "Senior",
                businessUnit: "Digital",
                status: "open",
                mustHave: ["React", "TypeScript"],
                niceToHave: ["Next.js"],
              },
              {
                id: "job-2",
                title: "Data Engineer",
                seniority: "Mid",
                businessUnit: "Data & AI",
                status: "closed",
                mustHave: ["Python", "SQL"],
              },
            ],
          },
          mutating: false,
        },
      ],
      { role: "ta", maxCards: 12 },
    );

    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.kind)).toEqual(["job", "job"]);
    expect(cards[0]).toMatchObject({
      title: "Senior React Engineer",
      sourceTool: "list_jobs",
      actions: [{ label: "Open job", href: "/ta/jobs/job-1" }],
      metrics: expect.arrayContaining([
        expect.objectContaining({ label: "Status", value: "Open" }),
      ]),
    });
    expect(cards[1]?.bullets?.join(" ")).toContain("Must-have: Python, SQL.");
  });

  it("renders single and generated job results without inventing persisted state", () => {
    const cards = buildResponseCardsFromToolRecords(
      [
        {
          toolName: "get_job",
          args: { jobId: "job-1" },
          result: {
            success: true,
            data: {
              id: "job-1",
              title: "Ingenieur plateforme",
              seniority: "Senior",
              businessUnit: "Cloud",
              status: "open",
              mustHave: ["Kubernetes"],
            },
          },
          mutating: false,
        },
        {
          toolName: "generate_job_description",
          args: { title: "Ingenieur donnees", seniority: "Mid" },
          result: {
            success: true,
            data: {
              title: "Ingenieur donnees",
              seniority: "Mid",
              businessUnit: "Data & AI",
              mustHave: ["Python", "SQL"],
            },
          },
          mutating: false,
        },
      ],
      { role: "ta", locale: "fr", maxCards: 3 },
    );

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      kind: "job",
      title: "Ingenieur plateforme",
      actions: [{ label: "Ouvrir le poste", href: "/ta/jobs/job-1" }],
      metrics: expect.arrayContaining([
        expect.objectContaining({ label: "Statut", value: "Ouvert" }),
      ]),
    });
    expect(cards[1]).toMatchObject({
      kind: "job",
      title: "Ingenieur donnees",
      description: "Description de poste generee, pas encore publiee.",
      actions: [],
      metrics: expect.arrayContaining([
        expect.objectContaining({ label: "Statut", value: "Brouillon" }),
      ]),
    });
  });

  it("builds an exact deterministic answer for a role-scoped job roster", () => {
    const message = "Show all open jobs with title, seniority, business unit, and status.";
    const response = buildDeterministicJobRosterResponse(
      [
        {
          toolName: "list_jobs",
          args: {},
          result: {
            success: true,
            data: [
              {
                title: "Senior React Engineer",
                seniority: "Senior",
                businessUnit: "Digital",
                status: "open",
              },
              {
                title: "Data Engineer",
                seniority: "Mid",
                businessUnit: "Data & AI",
                status: "closed",
              },
            ],
          },
          mutating: false,
        },
      ],
      message,
      "en",
    );

    expect(isJobRosterIntent(message)).toBe(true);
    expect(response).toContain("**1** open job");
    expect(response).toContain(
      "| Senior React Engineer | Senior | Digital | open |",
    );
    expect(response).not.toContain("Data Engineer");
    expect(response).toContain("`list_jobs`");
  });

});
