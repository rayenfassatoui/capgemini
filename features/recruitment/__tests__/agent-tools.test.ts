import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAgentTool, getToolsForRole } from '../services/agent-tools';
import * as services from '../services/index';

vi.mock('../services/index', () => ({
  uploadCv: vi.fn(),
  parseCvDocument: vi.fn(),
  extractCvDataWithAI: vi.fn(),
  updateCvExtraction: vi.fn(),
  updateCvRawText: vi.fn(),
  listCvPool: vi.fn(),
  deleteCv: vi.fn(),
  getCvDetails: vi.fn(),
  listJobs: vi.fn(),
  getJob: vi.fn(),
  createJob: vi.fn(),
  closeJob: vi.fn(),
  assignCvToJob: vi.fn(),
  getCandidatesByJob: vi.fn(),
  getCandidatesByStage: vi.fn(),
  getCandidate: vi.fn(),
  updateCandidateStage: vi.fn(),
  matchCvsToJob: vi.fn(),
  matchCvsToJobWithFilters: vi.fn(),
  generateScreeningWithAI: vi.fn(),
  getScreening: vi.fn(),
  generateInterviewQuestionsWithAI: vi.fn(),
  getInterviewGuide: vi.fn(),
  scheduleInterview: vi.fn(),
  getInterview: vi.fn(),
  getTodayInterviews: vi.fn(),
  getInterviewReport: vi.fn(),
  getInterviewReportsByCandidate: vi.fn(),
  getDashboardStats: vi.fn(),
  getCvPoolStats: vi.fn(),
  getJobsStats: vi.fn(),
  getSmartInsights: vi.fn(),
  searchCvPool: vi.fn(),
  cancelInterview: vi.fn(),
  rescheduleInterview: vi.fn(),
  saveInterviewReport: vi.fn(),
  markInterviewCompleted: vi.fn(),
  sendInterviewEmail: vi.fn(),
  generateHRDecisionEmailWithAI: vi.fn(),
  sendHRDecisionEmail: vi.fn(),
  exportAcceptedCandidatesToExcel: vi.fn(),
}));

const mockedServices = vi.mocked(services);

const CV_1 = '11111111-1111-1111-1111-111111111111';
const CV_2 = '22222222-2222-2222-2222-222222222222';
const JOB_1 = '33333333-3333-3333-3333-333333333333';
const JOB_2 = '44444444-4444-4444-4444-444444444444';
const CAND_1 = '55555555-5555-5555-5555-555555555555';
const INT_1 = '66666666-6666-6666-6666-666666666666';

describe('agent-tools executeAgentTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only allowed tools for role', () => {
    const managerTools = getToolsForRole('manager').map(
      (t) => t.function.name
    );

    expect(managerTools).toContain('get_job');
    expect(managerTools).toContain('get_candidate');
    expect(managerTools).not.toContain('delete_cv');
    expect(managerTools).not.toContain('create_job');
    expect(managerTools).not.toContain('close_job');
  });

  it('returns error for unknown tool', async () => {
    const res = await executeAgentTool('unknown_tool', {}, {
      userId: 'user-1',
      role: 'ta',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Unknown tool');
  });

  it('enforces role-based access control', async () => {
    const res = await executeAgentTool('delete_cv', { cvId: CV_1 }, {
      userId: 'user-1',
      role: 'manager',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Access denied');
    expect(mockedServices.deleteCv).not.toHaveBeenCalled();
  });

  it('sanitizes and truncates list_cv_pool results', async () => {
    mockedServices.listCvPool.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => ({
        id: `${CV_1}-${i}`,
        filename: `cv-${i}.pdf`,
        rawText: 'private',
        rawBytes: 'base64-data',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })) as never
    );

    const res = await executeAgentTool('list_cv_pool', {}, {
      userId: 'user-1',
      role: 'ta',
    });

    expect(res.success).toBe(true);
    const data = res.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(31);
    expect(data[0].rawText).toBeUndefined();
    expect(data[0].rawBytes).toBeUndefined();
    expect(data[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(data[30]).toBe('... and 1 more items (31 total)');
  });

  it('passes through UUID id arguments', async () => {
    mockedServices.getCvDetails.mockResolvedValue({
      id: CV_1,
      rawText: 'private',
      rawBytes: 'base64-data',
      filename: 'cv.pdf',
    } as never);

    const res = await executeAgentTool('get_cv_details', { cvId: CV_1 }, {
      userId: 'user-1',
      role: 'ta',
    });

    expect(mockedServices.getCvDetails).toHaveBeenCalledWith(CV_1);
    expect(res.success).toBe(true);
    const data = res.data as Record<string, unknown>;
    expect(data.rawText).toBeUndefined();
    expect(data.rawBytes).toBeUndefined();
  });

  it('resolves cv index to UUID for get_cv_details', async () => {
    mockedServices.listCvPool.mockResolvedValue(
      [{ id: CV_1 }, { id: CV_2 }] as never
    );
    mockedServices.getCvDetails.mockResolvedValue({ id: CV_2 } as never);

    const res = await executeAgentTool('get_cv_details', { cvId: 1 }, {
      userId: 'user-1',
      role: 'ta',
    });

    expect(res.success).toBe(true);
    expect(mockedServices.listCvPool).toHaveBeenCalledWith('user-1');
    expect(mockedServices.getCvDetails).toHaveBeenCalledWith(CV_2);
  });

  it('resolves cv/job indexes for assign_cv_to_job', async () => {
    mockedServices.listCvPool.mockResolvedValue([{ id: CV_1 }] as never);
    mockedServices.listJobs.mockResolvedValue(
      [{ id: JOB_1 }, { id: JOB_2 }] as never
    );
    mockedServices.assignCvToJob.mockResolvedValue(
      { id: CAND_1, cvId: CV_1, jobId: JOB_2 } as never
    );

    const res = await executeAgentTool(
      'assign_cv_to_job',
      { cvId: 0, jobId: 1 },
      {
        userId: 'user-1',
        role: 'ta',
      }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.assignCvToJob).toHaveBeenCalledWith(
      CV_1,
      JOB_2,
      'user-1'
    );
  });

  it('resolves interview index using get_today_interviews context', async () => {
    mockedServices.getTodayInterviews.mockResolvedValue(
      [
        {
          interviewId: INT_1,
          candidateId: CAND_1,
          candidateName: 'Candidate',
          candidateEmail: 'candidate@example.com',
          jobTitle: 'Engineer',
          stage: 'ta',
          scheduledTime: '10:00',
          meetLink: 'https://meet.google.com/test',
          status: 'scheduled',
        },
      ] as never
    );
    mockedServices.getInterview.mockResolvedValue({ id: INT_1 } as never);

    const res = await executeAgentTool('get_interview', { interviewId: 0 }, {
      userId: 'user-1',
      role: 'ta',
    });

    expect(res.success).toBe(true);
    expect(mockedServices.getInterview).toHaveBeenCalledWith(INT_1);
  });

  it('returns clear error for out-of-range index', async () => {
    mockedServices.listCvPool.mockResolvedValue([{ id: CV_1 }] as never);

    const res = await executeAgentTool('get_cv_details', { cvId: 8 }, {
      userId: 'user-1',
      role: 'ta',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid cvId index 8');
  });

  it('resolves candidate by name', async () => {
    mockedServices.getCandidatesByStage.mockResolvedValue([
      { id: CAND_1, fullName: 'Mohamed Achref Ben Abdallah', email: 'achref@test.com', stage: 'ta_accepted' },
    ] as never);
    mockedServices.getCandidate.mockResolvedValue(
      { id: CAND_1, fullName: 'Mohamed Achref Ben Abdallah' } as never
    );

    const res = await executeAgentTool(
      'get_candidate',
      { candidateId: 'Mohamed Achref Ben Abdallah' },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.getCandidate).toHaveBeenCalledWith(CAND_1);
  });

  it('resolves candidate by partial name match', async () => {
    mockedServices.getCandidatesByStage.mockResolvedValue([
      { id: CAND_1, fullName: 'Mohamed Achref Ben Abdallah', email: 'achref@test.com', stage: 'ta_accepted' },
    ] as never);
    mockedServices.getCandidate.mockResolvedValue(
      { id: CAND_1, fullName: 'Mohamed Achref Ben Abdallah' } as never
    );

    const res = await executeAgentTool(
      'get_candidate',
      { candidateId: 'Achref' },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.getCandidate).toHaveBeenCalledWith(CAND_1);
  });

  it('resolves job by title', async () => {
    mockedServices.listJobs.mockResolvedValue([
      { id: JOB_1, title: 'Full Stack Engineer - React & Python' },
    ] as never);
    mockedServices.getJob.mockResolvedValue(
      { id: JOB_1, title: 'Full Stack Engineer - React & Python' } as never
    );

    const res = await executeAgentTool(
      'get_job',
      { jobId: 'Full Stack Engineer' },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.getJob).toHaveBeenCalledWith(JOB_1);
  });

  it('returns clear error when upload attachment is missing', async () => {
    const res = await executeAgentTool(
      'upload_cv',
      { attachmentIndex: '0' },
      {
        userId: 'user-1',
        role: 'ta',
      }
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('No attachment data found');
  });

  it('runs upload_cv pipeline and returns extracted data', async () => {
    mockedServices.uploadCv.mockResolvedValue({ id: CV_1 } as never);
    mockedServices.parseCvDocument.mockResolvedValue('cv raw text' as never);
    mockedServices.extractCvDataWithAI.mockResolvedValue({
      extractedName: 'Jane Doe',
      extractedEmail: 'jane@example.com',
      extractedPhone: '+21600000000',
      extractedSkills: ['React', 'TypeScript'],
      extractedExperiences: ['5 years frontend'],
      extractedEducation: ['Computer Science'],
      extractedLanguages: ['English', 'French'],
      extractedSummary: 'Senior frontend engineer',
    } as never);
    mockedServices.updateCvExtraction.mockResolvedValue(undefined as never);
    mockedServices.updateCvRawText.mockResolvedValue(undefined as never);

    const res = await executeAgentTool(
      'upload_cv',
      {
        attachmentIndex: '0',
        _attachment: {
          filename: 'candidate.pdf',
          contentType: 'application/pdf',
          size: 12000,
          rawBytes: 'ZHVtbXk=',
        },
      },
      {
        userId: 'user-1',
        role: 'ta',
      }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.uploadCv).toHaveBeenCalledWith(
      {
        filename: 'candidate.pdf',
        contentType: 'application/pdf',
        size: 12000,
        rawBytes: 'ZHVtbXk=',
      },
      'user-1'
    );
    expect(mockedServices.parseCvDocument).toHaveBeenCalledWith(
      'candidate.pdf',
      'application/pdf',
      'ZHVtbXk='
    );
    expect(mockedServices.updateCvExtraction).toHaveBeenCalledWith(
      CV_1,
      expect.objectContaining({ extractedName: 'Jane Doe' })
    );
    expect(mockedServices.updateCvRawText).toHaveBeenCalledWith(
      CV_1,
      'cv raw text'
    );

    const data = res.data as Record<string, unknown>;
    expect(data.cvId).toBe(CV_1);
    expect(data.message).toBe('CV uploaded and parsed successfully');
  });

  // ==================== NEW TOOLS ====================

  it('search_cv_pool passes filters to service', async () => {
    mockedServices.searchCvPool.mockResolvedValue([
      { id: CV_1, filename: 'cv1.pdf', extractedSkills: ['React'] },
    ] as never);

    const res = await executeAgentTool(
      'search_cv_pool',
      { skills: ['React'], languages: ['French'], minExperience: '2', location: 'Paris' },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.searchCvPool).toHaveBeenCalledWith('user-1', {
      skills: ['React'],
      languages: ['French'],
      minExperience: 2,
      location: 'Paris',
    });
    const data = res.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
  });

  it('bulk_assign_cvs_to_job assigns top N unassigned matches', async () => {
    mockedServices.listJobs.mockResolvedValue(
      [{ id: JOB_1 }] as never
    );
    mockedServices.matchCvsToJob.mockResolvedValue([
      { cvId: CV_1, matchScore: 90, alreadyAssigned: false },
      { cvId: CV_2, matchScore: 80, alreadyAssigned: true },
      { cvId: '77777777-7777-7777-7777-777777777777', matchScore: 70, alreadyAssigned: false },
    ] as never);
    mockedServices.assignCvToJob.mockResolvedValue(
      { id: CAND_1, cvId: CV_1, jobId: JOB_1 } as never
    );

    const res = await executeAgentTool(
      'bulk_assign_cvs_to_job',
      { jobId: JOB_1, count: '1' },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    const data = res.data as { assignedCount: number; requestedCount: number };
    expect(data.assignedCount).toBe(1);
    expect(data.requestedCount).toBe(1);
    expect(mockedServices.assignCvToJob).toHaveBeenCalledTimes(1);
    expect(mockedServices.assignCvToJob).toHaveBeenCalledWith(CV_1, JOB_1, 'user-1');
  });

  it('close_job closes eligible job', async () => {
    mockedServices.listJobs.mockResolvedValue([{ id: JOB_1 }] as never);
    mockedServices.closeJob.mockResolvedValue({
      id: JOB_1,
      status: 'closed',
    } as never);

    const res = await executeAgentTool(
      'close_job',
      { jobId: JOB_1 },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.closeJob).toHaveBeenCalledWith(
      JOB_1,
      'user-1',
      'ta'
    );
    const data = res.data as { status: string };
    expect(data.status).toBe('closed');
  });

  it('reschedule_interview calls service with new date/time', async () => {
    mockedServices.getTodayInterviews.mockResolvedValue([
      { interviewId: INT_1, candidateId: CAND_1, candidateName: 'C', candidateEmail: 'c@test.com', jobTitle: 'J', stage: 'ta', scheduledTime: '10:00', meetLink: 'https://meet.google.com/a', status: 'scheduled' },
    ] as never);
    mockedServices.rescheduleInterview.mockResolvedValue({
      id: INT_1,
      scheduledDate: '2026-03-01',
      scheduledTime: '14:00',
      status: 'scheduled',
    } as never);

    const res = await executeAgentTool(
      'reschedule_interview',
      { interviewId: INT_1, newDate: '01/03/2026', newTime: '14:00' },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.rescheduleInterview).toHaveBeenCalledWith(
      INT_1,
      '01/03/2026',
      '14:00'
    );
  });

  it('cancel_interview sets status to cancelled', async () => {
    mockedServices.getTodayInterviews.mockResolvedValue([
      { interviewId: INT_1, candidateId: CAND_1, candidateName: 'C', candidateEmail: 'c@test.com', jobTitle: 'J', stage: 'ta', scheduledTime: '10:00', meetLink: 'https://meet.google.com/a', status: 'scheduled' },
    ] as never);
    mockedServices.cancelInterview.mockResolvedValue({
      id: INT_1,
      status: 'cancelled',
    } as never);

    const res = await executeAgentTool(
      'cancel_interview',
      { interviewId: INT_1 },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.cancelInterview).toHaveBeenCalledWith(INT_1);
    const data = res.data as { status: string };
    expect(data.status).toBe('cancelled');
  });

  it('create_interview_report saves report and returns data', async () => {
    mockedServices.getCandidatesByStage.mockResolvedValue(
      [{ id: CAND_1 }] as never
    );
    mockedServices.getTodayInterviews.mockResolvedValue([
      { interviewId: INT_1, candidateId: CAND_1, candidateName: 'C', candidateEmail: 'c@test.com', jobTitle: 'J', stage: 'ta', scheduledTime: '10:00', meetLink: 'https://meet.google.com/a', status: 'scheduled' },
    ] as never);
    mockedServices.saveInterviewReport.mockResolvedValue({
      id: 'report-1',
      interviewId: INT_1,
      candidateId: CAND_1,
      score: 85,
      decision: 'accepted',
    } as never);

    const res = await executeAgentTool(
      'create_interview_report',
      {
        interviewId: INT_1,
        candidateId: CAND_1,
        stage: 'ta',
        notes: 'Strong candidate',
        candidateAnswers: [{ question: 'Q1', answer: 'A1' }],
        score: '85',
        decision: 'accepted',
      },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.saveInterviewReport).toHaveBeenCalledWith(
      expect.objectContaining({
        interviewId: INT_1,
        candidateId: CAND_1,
        stage: 'ta',
        score: 85,
        decision: 'accepted',
      }),
      'user-1'
    );
  });

  it('send_interview_invite_email calls email service', async () => {
    mockedServices.getTodayInterviews.mockResolvedValue([
      { interviewId: INT_1, candidateId: CAND_1, candidateName: 'C', candidateEmail: 'c@test.com', jobTitle: 'J', stage: 'ta', scheduledTime: '10:00', meetLink: 'https://meet.google.com/a', status: 'scheduled' },
    ] as never);
    mockedServices.sendInterviewEmail.mockResolvedValue({
      id: 'email-1',
      toEmail: 'jane@example.com',
      status: 'sent',
    } as never);

    const res = await executeAgentTool(
      'send_interview_invite_email',
      {
        interviewId: INT_1,
        candidateEmail: 'jane@example.com',
        candidateName: 'Jane Doe',
        jobTitle: 'React Developer',
        scheduledDate: '15/03/2026',
        scheduledTime: '10:30',
        meetLink: 'https://meet.google.com/abc',
        interviewerName: 'John Smith',
        stage: 'ta',
      },
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.sendInterviewEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        interviewId: INT_1,
        candidateEmail: 'jane@example.com',
        candidateName: 'Jane Doe',
        stage: 'ta',
      }),
      'user-1'
    );
  });

  it('send_rejection_email generates and sends rejection', async () => {
    mockedServices.getCandidatesByStage.mockResolvedValue(
      [{ id: CAND_1, email: 'jane@example.com', fullName: 'Jane Doe' }] as never
    );
    mockedServices.listJobs.mockResolvedValue([{ id: JOB_1 }] as never);
    mockedServices.getCandidate.mockResolvedValue(
      { id: CAND_1, email: 'jane@example.com', fullName: 'Jane Doe' } as never
    );
    mockedServices.generateHRDecisionEmailWithAI.mockResolvedValue({
      subject: 'Application Update',
      body: 'Thank you for applying...',
    } as never);
    mockedServices.sendHRDecisionEmail.mockResolvedValue({
      id: 'email-2',
      toEmail: 'jane@example.com',
      status: 'sent',
    } as never);

    const res = await executeAgentTool(
      'send_rejection_email',
      { candidateId: CAND_1, jobId: JOB_1 },
      { userId: 'user-1', role: 'hr' }
    );

    expect(res.success).toBe(true);
    expect(mockedServices.generateHRDecisionEmailWithAI).toHaveBeenCalledWith(
      CAND_1,
      JOB_1,
      'rejected'
    );
    expect(mockedServices.sendHRDecisionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'jane@example.com',
        toName: 'Jane Doe',
        subject: 'Application Update',
      }),
      'user-1'
    );
  });

  it('export_candidates_csv returns export metadata', async () => {
    mockedServices.exportAcceptedCandidatesToExcel.mockResolvedValue(
      Buffer.from('fake-excel-data') as never
    );

    const res = await executeAgentTool(
      'export_candidates_csv',
      {},
      { userId: 'user-1', role: 'ta' }
    );

    expect(res.success).toBe(true);
    const data = res.data as { message: string; format: string; sizeBytes: number };
    expect(data.message).toBe('Export generated successfully');
    expect(data.format).toBe('xlsx');
    expect(data.sizeBytes).toBeGreaterThan(0);
  });

  it('new tools are included in ta role tools list', () => {
    const taTools = getToolsForRole('ta').map((t) => t.function.name);
    expect(taTools).toContain('search_cv_pool');
    expect(taTools).toContain('bulk_assign_cvs_to_job');
    expect(taTools).toContain('close_job');
    expect(taTools).toContain('reschedule_interview');
    expect(taTools).toContain('cancel_interview');
    expect(taTools).toContain('create_interview_report');
    expect(taTools).toContain('send_interview_invite_email');
    expect(taTools).toContain('send_rejection_email');
    expect(taTools).toContain('export_candidates_csv');
  });

  it('manager role cannot access search_cv_pool or bulk_assign', () => {
    const managerTools = getToolsForRole('manager').map((t) => t.function.name);
    expect(managerTools).not.toContain('search_cv_pool');
    expect(managerTools).not.toContain('bulk_assign_cvs_to_job');
    expect(managerTools).not.toContain('close_job');
    expect(managerTools).toContain('reschedule_interview');
    expect(managerTools).toContain('cancel_interview');
    expect(managerTools).toContain('create_interview_report');
  });
});