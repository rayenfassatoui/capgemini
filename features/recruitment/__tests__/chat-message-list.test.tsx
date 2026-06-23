import type { AnchorHTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatMessageList } from "../components/chat/chat-message-list";
import type { ChatMessage } from "../components/chat/chat-types";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@streamdown/mermaid", () => ({ mermaid: {} }));

describe("ChatMessageList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:00:00.000Z"));
    Element.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders confidence, confirmation preview, and metadata-aware follow-up actions", () => {
    const messages: ChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "The pipeline is building up in screening and needs action.",
        metadata: {
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
              {
                id: "analytics-2",
                label: "Pipeline insights",
                kind: "analytics",
                tool: "get_pipeline_insights",
                status: "success",
                count: 3,
              },
            ],
            evidenceBlocks: [],
            observedFacts: ["Screening currently has the highest candidate volume."],
            inferenceLimits: [],
          },
        },
        cards: [
          {
            id: "pipeline-dashboard",
            kind: "pipeline",
            title: "Pipeline snapshot",
            description: "Live recruitment counters from the dashboard source.",
            tone: "warning",
            sourceTool: "get_dashboard_stats",
            metrics: [
              { label: "Candidates", value: "12" },
              { label: "Pending screenings", value: "4", tone: "warning" },
            ],
            bullets: ["TA Screening has 5 candidates."],
            actions: [
              {
                label: "Explain bottleneck",
                prompt: "Explain the main pipeline bottleneck and next actions",
              },
            ],
          },
        ],
        confirmations: [
          {
            id: "confirmation-1",
            toolName: "update_candidate_stage",
            summary: "Move the selected candidate to the TA interview stage.",
            args: {
              candidateId: "11111111-1111-4111-8111-111111111111",
              newStage: "ta_interview",
            },
            expiresAt: "2026-06-22T12:01:00.000Z",
            status: "pending",
          },
        ],
      },
    ];

    render(
      <ChatMessageList
        messages={messages}
        isStreaming={false}
        isLoadingHistory={false}
        onSendSuggestion={vi.fn()}
        onConfirmAction={vi.fn()}
      />,
    );

    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByText("Medium risk")).toBeInTheDocument();
    expect(screen.getByText("Expected impact")).toBeInTheDocument();
    expect(screen.getByText(/Expires in 1m 0s/i)).toBeInTheDocument();
    expect(screen.getByText("Pipeline snapshot")).toBeInTheDocument();
    expect(screen.getByText("Pending screenings")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /explain bottleneck/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /explain the impact of this action before i confirm/i,
      }),
    ).toBeInTheDocument();
  });
});
