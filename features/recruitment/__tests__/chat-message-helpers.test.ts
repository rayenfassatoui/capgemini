import { describe, expect, it } from "vitest";

import {
  buildConfirmationPreview,
  getConfirmationExpiryState,
  getFollowUpSuggestions,
  summarizeEvidenceConfidence,
} from "../components/chat/chat-message-helpers";
import type { AgentActionConfirmation, ChatResponseMetadata } from "../components/chat/chat-types";

const analyticsMetadata: ChatResponseMetadata = {
  evidence: {
    sources: [
      {
        id: "analytics-1",
        label: "Recruitment dashboard",
        kind: "analytics",
        tool: "get_dashboard_stats",
        status: "success",
        count: 4,
      },
    ],
    evidenceBlocks: [],
    observedFacts: ["Recruitment dashboard returned 4 metrics."],
    inferenceLimits: [],
  },
};

describe("chat message helpers", () => {
  it("prefers confirmation-specific follow-ups when a pending action exists", () => {
    const suggestions = getFollowUpSuggestions({
      content: "I can update the candidate stage for you.",
      confirmations: [
        {
          id: "pending-1",
          toolName: "update_candidate_stage",
          summary: "This action can change recruitment data.",
          args: { candidateId: "candidate-1", newStage: "ta_interview" },
          expiresAt: "2099-01-01T00:00:00.000Z",
          status: "pending",
        },
      ],
    });

    expect(suggestions).toEqual([
      "Explain the impact of this action before I confirm",
      "Show the affected records for this action",
      "List the risks if I approve this change",
    ]);
  });

  it("uses analytics follow-ups when the answer is backed by analytics evidence", () => {
    const suggestions = getFollowUpSuggestions({
      content: "Pipeline volumes are concentrated in screening.",
      metadata: analyticsMetadata,
    });

    expect(suggestions).toEqual([
      "Explain the main bottleneck behind this",
      "Turn this into role-specific next actions",
      "Compare this trend with another segment",
    ]);
  });
  it("uses structured card kind before text fallback when suggesting follow-ups", () => {
    const suggestions = getFollowUpSuggestions({
      content: "Here is a short answer.",
      cards: [
        {
          id: "governance-activity",
          kind: "governance",
          title: "Governance audit pulse",
          metrics: [{ label: "Audit rows", value: "2" }],
        },
      ],
    });

    expect(suggestions).toEqual([
      "Summarize the governance risk here",
      "Show only the failed or pending actions",
      "Draft an audit-ready summary",
    ]);
  });

  it("summarizes evidence confidence from verified and failed sources", () => {
    const summary = summarizeEvidenceConfidence({
      sources: [
        {
          id: "source-1",
          label: "Candidate search",
          kind: "candidate",
          tool: "search_candidates",
          status: "success",
        },
        {
          id: "source-2",
          label: "RAG search",
          kind: "search",
          tool: "rag_search_cvs",
          status: "error",
        },
      ],
      evidenceBlocks: [],
      observedFacts: ["1 candidate matched the query."],
      inferenceLimits: ["1 failed tool result was excluded from factual claims."],
    });

    expect(summary).toMatchObject({
      level: "medium",
      verifiedSources: 1,
      failedSources: 1,
      inferenceLimitCount: 1,
      observedFactCount: 1,
    });
    expect(summary?.issues).toContain(
      "1 source was unavailable or excluded.",
    );
  });

  it("builds confirmation previews from tool arguments", () => {
    const confirmation: AgentActionConfirmation = {
      id: "action-1",
      toolName: "update_candidate_stage",
      summary: "Move the candidate to the TA interview stage.",
      args: {
        candidateId: "11111111-1111-4111-8111-111111111111",
        newStage: "ta_interview",
      },
      expiresAt: "2099-01-01T00:00:00.000Z",
      status: "pending",
    };

    const preview = buildConfirmationPreview(confirmation);

    expect(preview).toMatchObject({
      riskLevel: "medium",
      riskLabel: "Medium risk",
      entities: [{ label: "Candidate", value: "11111111…1111" }],
    });
    expect(preview.impact).toContain("Stage will change to Ta Interview.");
  });

  it("shows generated job details in create_job confirmation previews", () => {
    const confirmation: AgentActionConfirmation = {
      id: "job-action-1",
      toolName: "create_job",
      summary: "Create a Senior UI/UX Designer job.",
      args: {
        title: "Senior UI/UX Designer",
        seniority: "Senior",
        mustHave: ["Discovery", "Figma", "Accessibility"],
      },
      expiresAt: "2099-01-01T00:00:00.000Z",
      status: "pending",
    };

    const preview = buildConfirmationPreview(confirmation);

    expect(preview.entities).toEqual(
      expect.arrayContaining([
        { label: "Seniority", value: "Senior" },
        { label: "Must-have", value: "3" },
      ]),
    );
    expect(preview.impact).toContain(
      "A job requirement will be created with 3 must-have items.",
    );
  });

  it("formats the remaining confirmation time and expiration state", () => {
    const upcoming = getConfirmationExpiryState(
      "2026-06-22T12:01:10.000Z",
      new Date("2026-06-22T12:00:00.000Z").getTime(),
    );
    const expired = getConfirmationExpiryState(
      "2026-06-22T11:59:59.000Z",
      new Date("2026-06-22T12:00:00.000Z").getTime(),
    );

    expect(upcoming).toEqual({
      expired: false,
      label: "Expires in 1m 10s",
    });
    expect(expired).toEqual({
      expired: true,
      label: "Expired",
    });
  });
});
