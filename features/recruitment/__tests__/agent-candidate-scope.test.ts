import { describe, expect, it, vi } from "vitest";
import { executors } from "../services/agent-tools/candidates";
import type {
  AgentToolContext,
  ExecutorDeps,
} from "../services/agent-tools/types";
import {
  ALL_CANDIDATE_STAGES,
  createResolveId,
} from "../services/agent-tools/utils";
import {
  CANDIDATE_VISIBLE_STAGES_BY_ROLE,
  getCandidateScopeField,
} from "../services/candidates";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("../services/jobs", () => ({ getJob: vi.fn() }));
vi.mock("../services/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("../services/notifications", () => ({ notifyStageChange: vi.fn() }));


const MANAGER_CONTEXT: AgentToolContext = {
  userId: "manager-user-1",
  role: "manager",
};

const SCOPED_CANDIDATE = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Mohamed Khayredine Gabsi",
  email: "khayredine@example.com",
  stage: "manager_interview",
  jobId: "22222222-2222-4222-8222-222222222222",
  jobTitle: "Senior AI Engineer",
};

function createExecutorDeps(
  services: Partial<ExecutorDeps["services"]>,
  resolveId: ExecutorDeps["resolveId"] = vi
    .fn()
    .mockResolvedValue(SCOPED_CANDIDATE.id),
): ExecutorDeps {
  return {
    services: services as ExecutorDeps["services"],
    resolveId,
    sanitizeForJson: (value) => value,
    truncateArray: (values, max) => values.slice(0, max),
    ctx: MANAGER_CONTEXT,
  };
}

describe("candidate agent role scope", () => {
  it("defines assignee and visible-stage boundaries for every role", () => {
    expect(getCandidateScopeField("ta")).toBe("assignedBy");
    expect(getCandidateScopeField("manager")).toBe("assignedManagerId");
    expect(getCandidateScopeField("hr")).toBe("assignedHrId");
    expect(getCandidateScopeField("admin")).toBeNull();
    expect(CANDIDATE_VISIBLE_STAGES_BY_ROLE.manager).toEqual([
      "manager_interview",
      "manager_accepted",
      "manager_rejected",
    ]);
    expect(CANDIDATE_VISIBLE_STAGES_BY_ROLE.hr).toEqual([
      "hr_interview",
      "hr_accepted",
      "hr_rejected",
      "hired",
    ]);
    expect(CANDIDATE_VISIBLE_STAGES_BY_ROLE.ta).toBeNull();
    expect(CANDIDATE_VISIBLE_STAGES_BY_ROLE.admin).toBeNull();
  });

  it("routes stage roster tools through the actor-scoped candidate service", async () => {
    const getCandidatesForActor = vi
      .fn()
      .mockResolvedValue([SCOPED_CANDIDATE]);
    const deps = createExecutorDeps({ getCandidatesForActor });

    const result = await executors.get_candidates_by_stage(
      { stages: ["manager_interview"] },
      deps,
    );

    expect(getCandidatesForActor).toHaveBeenCalledWith(MANAGER_CONTEXT, {
      stages: ["manager_interview"],
    });
    expect(result).toEqual([SCOPED_CANDIDATE]);
  });

  it("routes job roster tools through the same actor scope", async () => {
    const getCandidatesForActor = vi
      .fn()
      .mockResolvedValue([SCOPED_CANDIDATE]);
    const resolveId = vi
      .fn<ExecutorDeps["resolveId"]>()
      .mockResolvedValue(SCOPED_CANDIDATE.jobId);
    const deps = createExecutorDeps({ getCandidatesForActor }, resolveId);

    await executors.get_candidates_by_job(
      { jobId: SCOPED_CANDIDATE.jobId },
      deps,
    );

    expect(getCandidatesForActor).toHaveBeenCalledWith(MANAGER_CONTEXT, {
      jobId: SCOPED_CANDIDATE.jobId,
    });
  });

  it("rejects an inaccessible candidate UUID instead of trusting it", async () => {
    const getCandidateForActor = vi.fn().mockResolvedValue(null);
    const services = {
      getCandidateForActor,
    } as unknown as ExecutorDeps["services"];
    const resolveId = createResolveId(services, MANAGER_CONTEXT);

    await expect(
      resolveId("33333333-3333-4333-8333-333333333333", "candidateId"),
    ).rejects.toThrow("Candidate not found or not accessible.");
    expect(getCandidateForActor).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      MANAGER_CONTEXT,
    );
  });

  it("resolves candidate names and indexes from only the actor-scoped roster", async () => {
    const getCandidatesForActor = vi
      .fn()
      .mockResolvedValue([SCOPED_CANDIDATE]);
    const services = {
      getCandidatesForActor,
    } as unknown as ExecutorDeps["services"];
    const resolveId = createResolveId(services, MANAGER_CONTEXT);

    await expect(
      resolveId("Mohamed Khayredine Gabsi", "candidateId"),
    ).resolves.toBe(SCOPED_CANDIDATE.id);
    await expect(resolveId("0", "candidateId")).resolves.toBe(
      SCOPED_CANDIDATE.id,
    );
    expect(getCandidatesForActor).toHaveBeenCalledWith(MANAGER_CONTEXT, {
      stages: ALL_CANDIDATE_STAGES,
    });
  });
});
