import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { getToolDefinition } from '../services/agent-tools';
import { TOOL_ARG_SCHEMAS } from '../services/agent-tools/schemas';
import { requiresAgentActionConfirmation } from '../services/pending-agent-actions';
import { buildStatisticsChatSystemPrompt } from '../services/statistics-chat-prompt';
import {
  buildAgentSkillPrompt,
  selectAgentRuntimeSkills,
  selectToolNamesForSkills,
  shouldRetryForMissingToolUse,
} from '../services/statistics-chat-skills';

describe('agent job authoring flow', () => {
  it('routes UI/UX job creation through generation before a confirmation-gated create', () => {
    const message = 'create job UI/UX kemla';
    const skills = selectAgentRuntimeSkills({
      message,
      role: 'ta',
      hasAttachments: false,
    });
    const skillIds = skills.map((skill) => skill.id);
    const toolNames = selectToolNamesForSkills(skills);
    const skillPrompt = buildAgentSkillPrompt(skills, toolNames);
    const systemPrompt = buildStatisticsChatSystemPrompt({
      role: 'ta',
      today: '2026-06-28',
      skillInstructions: skillPrompt,
    });

    expect(skillIds).toContain('job-authoring');
    expect(toolNames).toEqual(
      expect.arrayContaining(['generate_job_description', 'create_job']),
    );
    expect(systemPrompt).toContain(
      'generate_job_description(title, seniority) → create_job(using AI output)',
    );
    expect(systemPrompt).toContain(
      "If the user didn't specify a title or seniority, ASK THEM",
    );
    expect(skillPrompt).toContain('Generate a job description before create_job');
    expect(
      shouldRetryForMissingToolUse({
        message,
        skills,
        availableToolNames: toolNames,
        toolExecutionCount: 0,
      }),
    ).toBe(true);
  });

  it('keeps generate_job_description read-only and create_job mutating', () => {
    const generateDefinition = getToolDefinition('generate_job_description');
    const createDefinition = getToolDefinition('create_job');

    expect(generateDefinition).toMatchObject({
      name: 'generate_job_description',
      mutating: false,
      allowedRoles: ['ta', 'admin'],
    });
    expect(generateDefinition?.parameters.required).toEqual(['title', 'seniority']);
    expect(createDefinition).toMatchObject({
      name: 'create_job',
      mutating: true,
      allowedRoles: ['ta', 'admin'],
    });
    expect(requiresAgentActionConfirmation('create_job', true)).toBe(true);
  });

  it('validates that create_job receives the generated full job payload', () => {
    expect(
      TOOL_ARG_SCHEMAS.create_job.safeParse({
        title: 'Senior UI/UX Designer',
        seniority: 'Senior',
      }).success,
    ).toBe(false);

    const valid = TOOL_ARG_SCHEMAS.create_job.safeParse({
      title: 'Senior UI/UX Designer',
      description:
        'Lead product discovery, interface design, prototyping, accessibility, and design-system collaboration for enterprise recruitment workflows.',
      mustHave: [
        'User research',
        'Information architecture',
        'Figma',
        'Accessibility',
      ],
      niceToHave: ['Design systems', 'Recruitment domain knowledge'],
      seniority: 'Senior',
      businessUnit: 'Digital',
    });

    expect(valid.success).toBe(true);
  });
});
