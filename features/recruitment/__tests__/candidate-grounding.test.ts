import { describe, expect, it } from "vitest";
import {
  buildAllowedCandidatesFromToolRecords,
  groundAssistantResponse,
  isCandidateSearchOrRankingIntent,
  isCandidateRosterIntent,
  isExplicitNamedSearchIntent,
  validateGroundedCandidateNames,
  type GroundingToolRecord,
} from "../services/candidate-grounding";

describe("candidate name grounding guard", () => {
  const johnDoeRecord: GroundingToolRecord = {
    toolName: "list_cv_pool",
    result: {
      success: true,
      data: [
        {
          id: "cv-john-1",
          extractedName: "John Doe",
          extractedSkills: ["TypeScript", "React"],
          extractedLanguages: ["English"],
          extractedExperiences: [{ title: "Frontend Engineer" }],
        },
      ],
    },
  };

  it("rejects an unknown candidate name absent from current tool output", () => {
    const allowed = buildAllowedCandidatesFromToolRecords([johnDoeRecord]);

    const validation = validateGroundedCandidateNames(
      [
        "| Rank | Name | Score |",
        "|------|------|-------|",
        "| 1 | Maria Garcia | 95% |",
      ].join("\n"),
      allowed,
      { broad: true },
    );

    expect(validation.ok).toBe(false);
    expect(validation.rejectedNames).toContain("Maria Garcia");
  });

  it("allows a known candidate name present in current tool output", () => {
    const allowed = buildAllowedCandidatesFromToolRecords([johnDoeRecord]);

    const validation = validateGroundedCandidateNames(
      [
        "| Rank | Name | Score |",
        "|------|------|-------|",
        "| 1 | John Doe | 95% |",
      ].join("\n"),
      allowed,
      { broad: true },
    );

    expect(validation.ok).toBe(true);
    expect(validation.rejectedNames).toHaveLength(0);
  });

  it("does not treat job names as candidate named-search intents", () => {
    expect(
      isExplicitNamedSearchIntent(
        "Create a Senior UI/UX Designer job named QA Agentic UI/UX Designer for Digital BU.",
      ),
    ).toBe(false);
  });

  it("replaces hallucinated transferable-skills rankings with deterministic grounded rows", () => {
    const records: GroundingToolRecord[] = [
      {
        toolName: "semantic_search_cvs",
        result: {
          success: true,
          data: {
            query: "transferable skills for cloud architecture",
            totalResults: 2,
            results: [
              {
                cvId: "cv-ahmed-1",
                candidateName: "Ahmed Ben Ali",
                similarityScore: 91,
                extractedSkills: ["AWS", "Architecture", "TypeScript"],
                extractedLanguages: ["English", "French"],
                experienceCount: 4,
              },
              {
                cvId: "cv-sana-1",
                candidateName: "Sana Trabelsi",
                similarityScore: 86,
                extractedSkills: ["Azure", "Delivery", "Stakeholder Management"],
                extractedLanguages: ["English"],
                experienceCount: 5,
              },
            ],
          },
        },
      },
    ];

    const rawLlmOutput = [
      "| Rank | Name | Score | Key Skills |",
      "|------|------|-------|------------|",
      "| 1 | Maria Garcia | 98% | Cloud, Leadership |",
      "| 2 | Ahmed Ben Ali | 91% | AWS, Architecture |",
    ].join("\n");

    const grounded = groundAssistantResponse(rawLlmOutput, records, {
      userMessage: "Rank top candidates by transferable skills",
      forceDeterministicRanking: true,
    });

    expect(grounded.blocked).toBe(true);
    expect(grounded.deterministic).toBe(true);
    expect(grounded.rejectedNames).toContain("Maria Garcia");
    expect(grounded.text).not.toContain("Maria Garcia");
    expect(grounded.text).toContain("Ahmed Ben Ali");
    expect(grounded.text).toContain("Sana Trabelsi");
    expect(grounded.text).toContain("| Rank | Name | Score | Key Skills | Experience | Languages |");
    expect(grounded.text).toContain("## Shortlist read");
    expect(grounded.text).toContain("### My take");
    expect(grounded.text).not.toContain("Grounded candidate results");
  });

  it("returns a grounded no-results response for zero-result candidate searches", () => {
    const records: GroundingToolRecord[] = [
      {
        toolName: "semantic_search_cvs",
        result: {
          success: true,
          data: {
            query: "senior rust blockchain developer",
            totalResults: 0,
            results: [],
          },
        },
      },
    ];

    const grounded = groundAssistantResponse(
      "Maria Garcia ranks first for this search.",
      records,
      {
        userMessage: "Show top candidates for senior rust blockchain developer",
        forceDeterministicRanking: true,
      },
    );

    expect(grounded.blocked).toBe(true);
    expect(grounded.candidateCount).toBe(0);
    expect(grounded.text).toContain(
      "I couldn’t find any accessible candidates in the current tool results",
    );
    expect(grounded.text).not.toContain("Maria Garcia");
  });


  it("does not replace analytics summaries that do not ask for candidates", () => {
    const grounded = groundAssistantResponse(
      [
        "Lobb el mochkol: TA Interview is the largest visible stage.",
        "## Evidence",
        "- Total Jobs: 5.",
        "- Manager Interview has 1 candidate.",
      ].join("\n"),
      [
        {
          toolName: "get_dashboard_stats",
          result: {
            success: true,
            data: {
              totalCandidates: 8,
              totalJobs: 5,
              pendingScreenings: 0,
            },
          },
        },
      ],
      {
        userMessage: "Show me the hiring funnel bottleneck",
      },
    );

    expect(grounded.blocked).toBe(false);
    expect(grounded.text).toContain("Lobb el mochkol");
    expect(grounded.text).not.toContain(
      "I couldn’t find any accessible candidates",
    );
  });

  it("does not treat skill-demand chart comparisons as candidate ranking", () => {
    expect(
      isCandidateSearchOrRankingIntent(
        "Compare CV pool skills with job demand and show charts",
      ),
    ).toBe(false);
    expect(isCandidateSearchOrRankingIntent("Compare Ahmed vs Sarah")).toBe(
      true,
    );
  });

  it("grounds TA screening prioritization from pipeline rows and screening scores", () => {
    const records: GroundingToolRecord[] = [
      {
        toolName: "get_candidates_by_stage",
        result: {
          success: true,
          data: [
            {
              id: "candidate-ahmed-1",
              fullName: "Ahmed Attafi",
              stage: "ta_screening",
              jobTitle: "Senior Backend Engineer",
              createdAt: "2026-06-28T02:46:27.000Z",
            },
            {
              id: "candidate-youssef-1",
              fullName: "Youssef Mansour",
              stage: "ta_screening",
              jobTitle: "React Frontend Engineer",
              createdAt: "2026-06-26T02:46:27.000Z",
            },
          ],
        },
      },
      {
        toolName: "get_screening",
        result: {
          success: true,
          data: {
            candidateId: "candidate-ahmed-1",
            score: 91,
            matchedMustHave: ["Node.js", "PostgreSQL", "TypeScript"],
            matchedNiceToHave: ["Microservices"],
            aiSummary:
              "Ahmed matched 4/4 must-have requirements for Senior Backend Engineer.",
          },
        },
      },
    ];

    const grounded = groundAssistantResponse(
      "I couldn't find any accessible candidates in the current tool results.",
      records,
      {
        userMessage:
          "Show candidates in TA screening. Prioritize who needs attention first and explain why.",
      },
    );

    expect(grounded.deterministic).toBe(true);
    expect(grounded.candidateCount).toBe(2);
    expect(grounded.text).not.toContain(
      "I couldn’t find any accessible candidates",
    );
    expect(grounded.text).toContain("Ahmed Attafi");
    expect(grounded.text).toContain("Youssef Mansour");
    expect(grounded.text).toContain("| Rank | Name | Score | Stage | Job |");
    expect(grounded.text).toContain(
      "| 1 | Ahmed Attafi | 91% | TA Screening | Senior Backend Engineer | Node.js, PostgreSQL, TypeScript, Microservices |",
    );
    expect(grounded.text).toContain("screening score: 91%");
    expect(grounded.sourceTools).toEqual([
      "get_candidates_by_stage",
      "get_screening",
    ]);
  });
  it("formats assigned-candidate requests as a factual role-scoped roster", () => {
    const records: GroundingToolRecord[] = [
      {
        toolName: "get_candidates_by_stage",
        result: {
          success: true,
          data: [
            {
              id: "candidate-khayredine-1",
              fullName: "Mohamed Khayredine Gabsi",
              stage: "manager_interview",
              jobTitle: "Senior AI Engineer",
            },
          ],
        },
      },
    ];
    const userMessage =
      "List only candidates assigned to me with current stage and job title.";

    expect(isCandidateRosterIntent(userMessage)).toBe(true);
    expect(isCandidateSearchOrRankingIntent(userMessage)).toBe(false);

    const grounded = groundAssistantResponse(
      "Rayen Fassatoui should be screened first.",
      records,
      { userMessage },
    );

    expect(grounded.blocked).toBe(true);
    expect(grounded.deterministic).toBe(true);
    expect(grounded.candidateCount).toBe(1);
    expect(grounded.text).toContain("## Assigned candidate roster");
    expect(grounded.text).toContain(
      "| Mohamed Khayredine Gabsi | Manager Interview | Senior AI Engineer |",
    );
    expect(grounded.text).toContain(
      "This is a factual roster, not a ranking, shortlist, or hiring recommendation.",
    );
    expect(grounded.text).not.toContain("Rayen Fassatoui");
    expect(grounded.text).not.toContain("## Shortlist read");
    expect(grounded.text).not.toContain("screened first");
  });

  it("does not allow non-admin responses to reuse names absent from current user-scoped tool output", () => {
    const currentUserScopedRecords: GroundingToolRecord[] = [
      {
        toolName: "search_cv_pool",
        result: {
          success: true,
          data: [
            {
              id: "cv-user-a-1",
              uploadedBy: "user-a",
              extractedName: "Nadia Mansour",
              extractedSkills: ["Java", "Spring Boot"],
              extractedLanguages: ["French"],
              extractedExperiences: [{ title: "Backend Engineer" }],
            },
          ],
        },
      },
    ];

    const contaminatedHistoryStyleOutput =
      "Maria Garcia should be shortlisted ahead of Nadia Mansour.";

    const grounded = groundAssistantResponse(
      contaminatedHistoryStyleOutput,
      currentUserScopedRecords,
      {
        userMessage: "Rank candidates from my accessible CV pool",
        forceDeterministicRanking: true,
      },
    );

    expect(grounded.blocked).toBe(true);
    expect(grounded.text).toContain("Nadia Mansour");
    expect(grounded.text).not.toContain("Maria Garcia");
    expect(grounded.sourceTools).toEqual(["search_cv_pool"]);
  });
});
