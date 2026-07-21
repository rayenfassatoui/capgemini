import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { getInterview } from '../services/interviews';

type InterviewRecord = NonNullable<Awaited<ReturnType<typeof getInterview>>>;

const mocks = vi.hoisted(() => ({
  getCandidateForActor: vi.fn(),
  getInterview: vi.fn(),
  markInterviewCompleted: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('../services/ai', () => ({
  callOpenRouter: vi.fn(),
  cleanJsonResponse: vi.fn(),
}));
vi.mock('../services/candidates', () => ({
  getCandidate: vi.fn(),
  getCandidateForActor: mocks.getCandidateForActor,
}));
vi.mock('@/features/recruitment/services/candidates', () => ({
  getCandidate: vi.fn(),
  getCandidateForActor: mocks.getCandidateForActor,
}));
vi.mock('../services/activity-log', () => ({ logActivity: vi.fn() }));
vi.mock('../services/export', () => ({ generateCandidateAcceptExcel: vi.fn() }));
vi.mock('../services/jobs', () => ({ getJob: vi.fn() }));
vi.mock('../services/interviews', () => ({
  getInterview: mocks.getInterview,
  markInterviewCompleted: mocks.markInterviewCompleted,
}));
vi.mock('@/features/recruitment/services/interviews', () => ({
  getInterview: mocks.getInterview,
  markInterviewCompleted: mocks.markInterviewCompleted,
}));
import { sendInterviewEmail } from '../services/email';
import { saveInterviewReport } from '../services/interview-reports';

const EMAIL_INPUT = {
  interviewId: '11111111-1111-4111-8111-111111111111',
  candidateEmail: 'candidate@example.com',
  candidateName: 'Candidate Name',
  jobTitle: 'Backend Engineer',
  scheduledDate: '2026-07-25',
  scheduledTime: '14:00',
  meetLink: 'https://meet.google.com/secure-room',
  interviewerName: 'Hiring Manager',
  stage: 'manager' as const,
};

const MANAGER_CONTEXT = {
  userId: 'manager-user-1',
  role: 'manager' as const,
};

const MANAGER_INTERVIEW = {
  id: EMAIL_INPUT.interviewId,
  candidateId: '22222222-2222-4222-8222-222222222222',
  jobId: '33333333-3333-4333-8333-333333333333',
  interviewerId: 'another-manager',
  stage: 'manager',
  scheduledDate: EMAIL_INPUT.scheduledDate,
  scheduledTime: EMAIL_INPUT.scheduledTime,
  meetLink: EMAIL_INPUT.meetLink,
  status: 'scheduled',
  emailSent: false,
  emailSentAt: null,
  createdAt: new Date('2026-07-21T12:00:00.000Z'),
  updatedAt: new Date('2026-07-21T12:00:00.000Z'),
} satisfies InterviewRecord;

describe('interview email actor scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInterview.mockResolvedValue(MANAGER_INTERVIEW);
  });

  it('rejects an interview whose candidate is outside the actor scope', async () => {
    mocks.getCandidateForActor.mockResolvedValue(null);

    await expect(
      sendInterviewEmail(
        EMAIL_INPUT,
        MANAGER_CONTEXT.userId,
        MANAGER_CONTEXT.role
      )
    ).rejects.toThrow('Candidate not found or not accessible');

    expect(mocks.getCandidateForActor).toHaveBeenCalledWith(
      MANAGER_INTERVIEW.candidateId,
      MANAGER_CONTEXT
    );
  });

  it('rejects a report whose candidate is outside the actor scope', async () => {
    mocks.getCandidateForActor.mockResolvedValue(null);

    await expect(
      saveInterviewReport(
        {
          interviewId: EMAIL_INPUT.interviewId,
          candidateId: MANAGER_INTERVIEW.candidateId,
          stage: 'manager',
          notes: 'Observed interview evidence.',
          candidateAnswers: [],
          score: 80,
          decision: 'accepted',
        },
        MANAGER_CONTEXT.userId,
        MANAGER_CONTEXT.role
      )
    ).rejects.toThrow('Candidate not found or not accessible');

    expect(mocks.getCandidateForActor).toHaveBeenCalledWith(
      MANAGER_INTERVIEW.candidateId,
      MANAGER_CONTEXT
    );
  });

  it('rejects an interview stage owned by another role before candidate lookup', async () => {
    mocks.getInterview.mockResolvedValue({
      ...MANAGER_INTERVIEW,
      interviewerId: 'hr-user',
      stage: 'hr',
    });

    await expect(
      sendInterviewEmail(
        { ...EMAIL_INPUT, stage: 'hr' },
        MANAGER_CONTEXT.userId,
        MANAGER_CONTEXT.role
      )
    ).rejects.toThrow('Interview stage is outside your role');

    expect(mocks.getCandidateForActor).not.toHaveBeenCalled();
  });
});
