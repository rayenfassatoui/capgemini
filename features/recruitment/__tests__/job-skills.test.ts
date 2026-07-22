import { describe, expect, it } from 'vitest';
import { createJobSchema, aiJobDescriptionOutputSchema } from '../schemas';
import { isAtomicJobSkillLabel, normalizeJobSkillLabels } from '../job-skills';
import { TOOL_ARG_SCHEMAS } from '../services/agent-tools/schemas';

describe('job skill normalization', () => {
  it('extracts atomic labels from requirement sentences', () => {
    const labels = normalizeJobSkillLabels([
      'Proven experience in UI/UX design with an impressive portfolio showcasing user-centered designs',
      'Proficiency in design tools such as Figma, Sketch, or Adobe XD',
      'Solid understanding of QA testing methodologies and hands-on experience with tools like Selenium, Cypress, or Jest',
      'Familiarity with accessibility standards (WCAG 2.1) and inclusive design principles',
    ]);

    expect(labels).toEqual([
      'UI/UX design',
      'Figma',
      'Sketch',
      'Adobe XD',
      'QA testing',
      'Selenium',
      'Cypress',
      'Jest',
      'Accessibility',
      'WCAG',
    ]);
    expect(labels.every(isAtomicJobSkillLabel)).toBe(true);
  });

  it('strips common experience prefixes from unknown skill requirements', () => {
    const labels = normalizeJobSkillLabels([
      'Hands-on experience working with AWS cloud architecture',
      '3+ years of experience in distributed systems',
      "At least 5 years' experience using Kubernetes",
    ]);

    expect(labels).toEqual([
      'AWS cloud architecture',
      'Distributed systems',
      'Kubernetes',
    ]);
    expect(labels.every(isAtomicJobSkillLabel)).toBe(true);
  });

  it('normalizes createJobSchema skill arrays before persistence', () => {
    const parsed = createJobSchema.parse({
      title: 'Senior Agentic UI/UX Designer',
      description:
        'Design agentic user experiences, test interaction quality, and collaborate with recruitment product teams.',
      mustHave: [
        'Proficiency in design tools such as Figma, Sketch, or Adobe XD',
        'Excellent communication and collaboration skills for cross-functional teamwork',
      ],
      niceToHave: [
        "Master's degree in Human-Computer Interaction, Design, or a related field",
      ],
      seniority: 'Senior',
      businessUnit: 'Digital BU',
    });

    expect(parsed.mustHave).toEqual([
      'Figma',
      'Sketch',
      'Adobe XD',
      'Communication',
      'Collaboration',
    ]);
    expect(parsed.niceToHave).toEqual(['Human-computer interaction']);
  });

  it('normalizes AI job description and create_job tool arguments', () => {
    const generated = aiJobDescriptionOutputSchema.parse({
      title: 'Senior Agentic UI/UX Designer',
      description:
        'Design agentic user experiences, test interaction quality, and collaborate with recruitment product teams.',
      mustHave: [
        'Knowledge of AI/ML concepts, particularly agentic systems, conversational AI, or autonomous agents',
      ],
      niceToHave: ['Experience with design systems and component-based design'],
      seniority: 'Senior',
      businessUnit: 'Digital BU',
    });
    const toolArgs = TOOL_ARG_SCHEMAS.create_job.safeParse({
      title: generated.title,
      description: generated.description,
      mustHave: generated.mustHave,
      niceToHave: generated.niceToHave,
      seniority: generated.seniority,
      businessUnit: generated.businessUnit,
    });

    expect(generated.mustHave).toEqual([
      'AI/ML',
      'Agentic systems',
      'Conversational AI',
    ]);
    expect(toolArgs.success).toBe(true);
    if (!toolArgs.success) return;
    expect(toolArgs.data.mustHave).toEqual([
      'AI/ML',
      'Agentic systems',
      'Conversational AI',
    ]);
    expect(toolArgs.data.niceToHave).toEqual(['Design systems']);
  });
});
