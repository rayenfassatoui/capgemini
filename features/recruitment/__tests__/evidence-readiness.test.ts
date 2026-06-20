import { describe, expect, it } from 'vitest';

import {
  buildCandidateEvidenceReadiness,
  buildCvEvidenceReadiness,
  formatEvidenceReadinessForAgent,
} from '../components/evidence-readiness';

describe('evidence readiness helpers', () => {
  it('marks a candidate decision as grounded when screening, reports, guide, and interview are present', () => {
    const readiness = buildCandidateEvidenceReadiness({
      workflow: 'manager',
      candidateName: 'Sana Mansour',
      stage: 'manager_interview',
      jobTitle: 'Senior Frontend Engineer',
      screening: {
        score: 84,
        mustMatchScore: 90,
        niceMatchScore: 70,
        gaps: [],
        matchedMustHave: ['React', 'TypeScript'],
        matchedNiceToHave: ['GraphQL'],
      },
      reports: [
        {
          stage: 'ta',
          score: 82,
          decision: 'accepted',
          overallEvaluation: 'Strong technical fit.',
        },
      ],
      currentInterview: {
        scheduledDate: '2026-06-20',
        scheduledTime: '10:00',
        status: 'completed',
      },
      hasInterviewGuide: true,
      hasAutoPilotGuide: true,
    });

    expect(readiness.status).toBe('ready');
    expect(readiness.metrics[0]).toMatchObject({
      label: 'Screening score',
      value: '84/100',
    });
    expect(readiness.missingEvidence).toHaveLength(0);
    expect(readiness.riskFlags).toHaveLength(0);
  });

  it('surfaces missing and risky evidence for HR decisions', () => {
    const readiness = buildCandidateEvidenceReadiness({
      workflow: 'hr',
      candidateName: 'Karim Ben Salah',
      stage: 'hr_interview',
      screening: {
        score: 55,
        mustMatchScore: 45,
        niceMatchScore: 60,
        gaps: ['Kubernetes', 'French'],
        matchedMustHave: ['Java'],
        matchedNiceToHave: [],
      },
      reports: [],
      currentInterview: null,
      hasInterviewGuide: false,
    });

    expect(readiness.status).toBe('needs-evidence');
    expect(readiness.missingEvidence).toContain('Prior TA/manager evaluation report');
    expect(readiness.riskFlags).toContain('Low screening score (55/100)');
    expect(readiness.riskFlags.join(' ')).toContain('Kubernetes');
  });

  it('summarizes CV extraction completeness and Agent prompt context', () => {
    const readiness = buildCvEvidenceReadiness({
      filename: 'amina-trabelsi.pdf',
      extractedName: 'Amina Trabelsi',
      extractedEmail: null,
      extractedSkills: ['React'],
      extractedExperiences: [],
      extractedEducation: [{ degree: 'Engineering' }],
      extractedLanguages: ['French'],
      extractedSummary: null,
    });

    expect(readiness.status).toBe('needs-evidence');
    expect(readiness.metrics[0]).toMatchObject({
      label: 'Profile evidence',
      value: '4/7',
    });
    expect(readiness.missingEvidence).toContain('Candidate email');

    const promptContext = formatEvidenceReadinessForAgent(readiness);
    expect(promptContext).toContain('Observed facts:');
    expect(promptContext).toContain('Missing evidence:');
    expect(promptContext).toContain('separate observed facts from inferred recommendations');
  });
});
