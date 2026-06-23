import { describe, expect, it } from 'vitest';

import {
  appendChatResponseCardsToContent,
  extractChatResponseCardsFromContent,
} from '../chat-card-events';
import { buildConfirmationPreview } from '../components/chat/chat-message-helpers';
import type { AgentActionConfirmation } from '../components/chat/chat-types';
import { buildAgentEvidenceMetadata } from '../services/agent-evidence';
import {
  groundAssistantResponse,
  type GroundingToolRecord,
} from '../services/candidate-grounding';
import { requiresAgentActionConfirmation } from '../services/pending-agent-actions';
import { buildResponseCardsFromToolRecords } from '../services/chat-response-cards';
import {
  buildOutOfScopeResponse,
  buildStatisticsChatSystemPrompt,
  ensureAgenticResponseStructure,
  isCreativeOffTopicRequest,
  isRecruitmentWorkRequest,
} from '../services/statistics-chat-prompt';
import { sanitizeToolTraceValue } from '../services/statistics-chat-formatting';
import type { ToolExecutionRecord } from '../services/statistics-chat-types';

const candidateSearchRecord: ToolExecutionRecord = {
  toolName: 'semantic_search_cvs',
  args: { query: 'react typescript consultant' },
  mutating: false,
  result: {
    success: true,
    data: {
      query: 'react typescript consultant',
      totalResults: 2,
      results: [
        {
          cvId: 'cv-amina',
          candidateName: 'Amina Trabelsi',
          similarityScore: 91,
          extractedSkills: ['React', 'TypeScript', 'Consulting'],
          extractedLanguages: ['French', 'English'],
          experienceCount: 4,
        },
        {
          cvId: 'cv-youssef',
          candidateName: 'Youssef Mansour',
          similarityScore: 83,
          extractedSkills: ['React', 'Next.js'],
          extractedLanguages: ['English'],
          experienceCount: 3,
        },
      ],
    },
  },
};

const dashboardRecord: ToolExecutionRecord = {
  toolName: 'get_dashboard_stats',
  args: {},
  mutating: false,
  result: {
    success: true,
    data: {
      totalCandidates: 18,
      totalJobs: 4,
      totalInterviewsToday: 3,
      pendingScreenings: 6,
      stageBreakdown: {
        new: 2,
        ta_screening: 8,
        manager_interview: 3,
        hired: 1,
      },
    },
  },
};

const governanceRecord: ToolExecutionRecord = {
  toolName: 'get_activity_log_enriched',
  args: { limit: 20 },
  mutating: false,
  result: {
    success: true,
    data: [
      {
        id: 'activity-1',
        action: 'delete_candidate',
        entityType: 'candidate',
        userName: 'Admin User',
        candidateStage: 'ta_rejected',
        details: 'Candidate removed from active workflow.',
      },
      {
        id: 'activity-2',
        action: 'update_candidate_stage',
        entityType: 'candidate',
        userName: 'TA User',
        candidateStage: 'manager_interview',
      },
    ],
  },
};

function toGroundingRecord(record: ToolExecutionRecord): GroundingToolRecord {
  return {
    toolName: record.toolName,
    result: record.result,
  };
}

describe('agent evaluation suite', () => {
  it('keeps the system prompt aligned with anti-hallucination and tool-use policy', () => {
    const prompt = buildStatisticsChatSystemPrompt({
      role: 'ta',
      today: '2026-06-22',
    });

    expect(prompt).toContain('NEVER fabricate data');
    expect(prompt).toContain('NEVER use a name, filename, or title as an ID parameter');
    expect(prompt).toContain('NEVER mention a candidate/person name unless that exact person appears');
    expect(prompt).toContain('list_jobs → hybrid_search_cvs(jobId)');
    expect(prompt).toContain('NEVER: list_cv_pool alone (ignores job requirements)');
    expect(prompt).toContain('ALL numeric tool arguments (limit, count, threshold, score) must be passed as numbers');
  });

  it('blocks creative off-topic work while preserving recruitment requests', () => {
    const creativePrompt = 'write me a rap about a database migration';
    const recruitmentPrompt = 'find top React candidates for this job';
    const response = buildOutOfScopeResponse('ta');

    expect(isCreativeOffTopicRequest(creativePrompt)).toBe(true);
    expect(isRecruitmentWorkRequest(creativePrompt)).toBe(false);
    expect(isRecruitmentWorkRequest(recruitmentPrompt)).toBe(true);
    expect(response).toContain('I am focused on recruitment work');
    expect(response).toContain('search CVs');
  });

  it('grounds candidate rankings exclusively in the current tool outputs', () => {
    const grounded = groundAssistantResponse(
      [
        '| Rank | Name | Score |',
        '|------|------|-------|',
        '| 1 | Maria Garcia | 99% |',
        '| 2 | Amina Trabelsi | 91% |',
      ].join('\n'),
      [toGroundingRecord(candidateSearchRecord)],
      {
        userMessage: 'rank the best React candidates',
        forceDeterministicRanking: true,
      },
    );

    expect(grounded.blocked).toBe(true);
    expect(grounded.deterministic).toBe(true);
    expect(grounded.rejectedNames).toEqual(['Maria Garcia']);
    expect(grounded.sourceTools).toEqual(['semantic_search_cvs']);
    expect(grounded.text).toContain('Amina Trabelsi');
    expect(grounded.text).toContain('Youssef Mansour');
    expect(grounded.text).not.toContain('Maria Garcia');
  });

  it('keeps mutating actions behind confirmation except user-attached CV upload', () => {
    const confirmationCases = [
      { toolName: 'update_candidate_stage', mutating: true, expected: true },
      { toolName: 'bulk_update_candidate_stage', mutating: true, expected: true },
      { toolName: 'schedule_interview', mutating: true, expected: true },
      { toolName: 'send_interview_email', mutating: true, expected: true },
      { toolName: 'upload_cv', mutating: true, expected: false },
      { toolName: 'get_dashboard_stats', mutating: false, expected: false },
    ] as const;

    for (const item of confirmationCases) {
      expect(
        requiresAgentActionConfirmation(item.toolName, item.mutating),
        item.toolName,
      ).toBe(item.expected);
    }

    const confirmation: AgentActionConfirmation = {
      id: 'pending-1',
      toolName: 'bulk_update_candidate_stage',
      summary: 'Move selected candidates to HR interview.',
      args: {
        candidateIds: ['candidate-1', 'candidate-2'],
        newStage: 'hr_interview',
      },
      expiresAt: '2030-01-01T00:00:00.000Z',
      status: 'pending',
    };

    const preview = buildConfirmationPreview(confirmation);
    expect(preview).toMatchObject({
      riskLevel: 'high',
      riskLabel: 'High risk',
      entities: [{ label: 'Candidates', value: '2' }],
    });
    expect(preview.impact).toContain('Stage will change to Hr Interview.');
  });

  it('creates durable response cards for candidate, pipeline, and governance evidence', () => {
    const cards = buildResponseCardsFromToolRecords(
      [candidateSearchRecord, dashboardRecord, governanceRecord],
      {
        role: 'ta',
        maxCards: 3,
      },
    );
    const persisted = appendChatResponseCardsToContent('Grounded answer.', cards);
    const parsed = extractChatResponseCardsFromContent(persisted);

    expect(cards.map((card) => card.kind)).toEqual([
      'candidate',
      'pipeline',
      'governance',
    ]);
    expect(cards[0]).toMatchObject({
      kind: 'candidate',
      title: 'Amina Trabelsi',
      sourceTool: 'semantic_search_cvs',
    });
    expect(cards[1].metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Pending screenings', value: '6' }),
      ]),
    );
    expect(cards[2].metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'High-risk events', value: '1' }),
      ]),
    );
    expect(parsed.content).toBe('Grounded answer.');
    expect(parsed.cards).toHaveLength(3);
  });

  it('emits audit-ready evidence metadata and redacts sensitive trace payloads', () => {
    const evidence = buildAgentEvidenceMetadata([governanceRecord], {
      role: 'admin',
    });
    const sanitized = sanitizeToolTraceValue({
      token: 'secret-token',
      rawBytes: 'base64-pdf',
      nested: {
        api_key: 'secret-key',
        safe: 'visible',
      },
    });

    expect(evidence.sources).toHaveLength(1);
    expect(evidence.sources[0]).toMatchObject({
      kind: 'system',
      status: 'success',
      tool: 'get_activity_log_enriched',
      count: 2,
    });
    expect(evidence.observedFacts[0]).toContain('returned (2 items)');
    expect(evidence.evidenceBlocks[0]?.items[0]?.text).toContain('delete_candidate candidate');
    expect(sanitized).toEqual({
      token: '[REDACTED]',
      rawBytes: '[REDACTED]',
      nested: {
        api_key: '[REDACTED]',
        safe: 'visible',
      },
    });
  });

  it('formats agent answers with caveats and bounded next steps from tool evidence', () => {
    const structured = ensureAgenticResponseStructure({
      text: 'TA Screening is the bottleneck and needs review.',
      userMessage: 'show me the candidate pipeline',
      role: 'ta',
      records: [dashboardRecord],
    });

    expect(structured).toContain('## My read');
    expect(structured).toContain('## Caveats');
    expect(structured).toContain('## Next Steps');
    expect(structured).toContain('Drill down on pipeline bottlenecks by stage and owner.');
    expect(structured.match(/^\d\. /gm)).toHaveLength(3);
  });
});
