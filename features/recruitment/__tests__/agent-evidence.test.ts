import { describe, expect, it } from 'vitest';

import {
  buildAgentEvidenceMetadata,
  buildInferenceLimitLines,
  buildObservedEvidenceLines,
  type AgentEvidenceToolRecord,
} from '../services/agent-evidence';

describe('agent evidence metadata', () => {
  it('builds source references and row-level evidence from successful tool output', () => {
    const records: AgentEvidenceToolRecord[] = [
      {
        toolName: 'semantic_search_cvs',
        args: { query: 'senior react developer' },
        result: {
          success: true,
          data: {
            totalResults: 2,
            results: [
              {
                candidateName: 'Amina Trabelsi',
                similarityScore: 0.92,
                extractedSkills: ['React', 'TypeScript', 'Node.js'],
              },
              {
                candidateName: 'Karim Ben Salah',
                similarityScore: 86,
                extractedSkills: ['React', 'GraphQL'],
              },
            ],
          },
        },
      },
    ];

    const metadata = buildAgentEvidenceMetadata(records);

    expect(metadata.sources).toHaveLength(1);
    expect(metadata.sources[0]).toMatchObject({
      label: 'Semantic Search Cvs',
      kind: 'cv',
      status: 'success',
      count: 2,
      detail: 'query: senior react developer',
    });
    expect(metadata.evidenceBlocks).toHaveLength(1);
    expect(metadata.evidenceBlocks[0].items[0]).toContain('Amina Trabelsi');
    expect(metadata.evidenceBlocks[0].items[0]).toContain('score 92%');
    expect(metadata.observedFacts[0]).toContain('Semantic Search Cvs returned (2 items)');
  });

  it('keeps failed tools out of row-level evidence and records source limits', () => {
    const records: AgentEvidenceToolRecord[] = [
      {
        toolName: 'get_dashboard_stats',
        result: {
          success: true,
          data: {
            totalCandidates: 12,
            totalJobs: 3,
            pendingScreenings: 4,
          },
        },
      },
      {
        toolName: 'rag_search_cvs',
        args: { query: 'rust blockchain' },
        result: {
          success: false,
          error: 'Embedding service unavailable',
        },
      },
    ];

    const metadata = buildAgentEvidenceMetadata(records);

    expect(metadata.sources).toHaveLength(2);
    expect(metadata.sources[1]).toMatchObject({
      label: 'Rag Search Cvs',
      status: 'error',
    });
    expect(metadata.evidenceBlocks).toHaveLength(1);
    expect(metadata.evidenceBlocks[0].title).toBe('Get Dashboard Stats evidence');
    expect(metadata.inferenceLimits).toContain(
      '1 failed tool result was excluded from factual claims.',
    );
  });

  it('returns explicit no-source limits when no tool records exist', () => {
    expect(buildObservedEvidenceLines([])).toEqual([
      'No role-scoped source was fetched for this response.',
    ]);
    expect(buildInferenceLimitLines([])[0]).toContain(
      'No successful live recruitment source was available',
    );
  });
});
