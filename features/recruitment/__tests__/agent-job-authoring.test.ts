import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { getToolDefinition } from '../services/agent-tools';
import { TOOL_ARG_SCHEMAS } from '../services/agent-tools/schemas';
import { requiresAgentActionConfirmation } from '../services/pending-agent-actions';
import { buildStatisticsChatSystemPrompt } from '../services/statistics-chat-prompt';
import {
  buildAgentSkillPrompt,
  buildMissingCloseJobToolCall,
  buildMissingCreateJobToolCall,
  selectAgentRuntimeSkills,
  selectToolNamesForSkills,
  shouldRetryForMissingToolUse,
} from '../services/statistics-chat-skills';

describe('agent job authoring flow', () => {
  it('routes job authoring mutations through safe recovery', () => {
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
      'generate_job_description(title, seniority) → create_job(using AI output with atomic skill labels)',
    );
    expect(systemPrompt).toContain('mustHave/niceToHave must be short skill labels');
    expect(systemPrompt).toContain(
      "If the user didn't specify a title or seniority, ASK THEM",
    );
    expect(skillPrompt).toContain('Generate a job description before create_job');
    expect(skillPrompt).toContain('atomic skill labels');
    expect(skillPrompt).toContain('To close a named job, resolve its exact ID');
    expect(
      shouldRetryForMissingToolUse({
        message,
        skills,
        availableToolNames: toolNames,
        toolExecutionCount: 0,
      }),
    ).toBe(true);
    const closeMessage =
      'Close the "Cloud DevOps Lead" job. Do not execute it; show the confirmation needed before any change.';
    const closeSkills = selectAgentRuntimeSkills({
      message: closeMessage,
      role: 'ta',
      hasAttachments: false,
    });
    const closeToolNames = selectToolNamesForSkills(closeSkills);
    const closeToolCall = buildMissingCloseJobToolCall({
      message: closeMessage,
      skills: closeSkills,
      availableToolNames: closeToolNames,
      records: [
        {
          toolName: 'list_jobs',
          args: {},
          result: {
            success: true,
            data: [
              {
                id: 'cloud-devops-lead-id',
                title: 'Cloud DevOps Lead',
                status: 'open',
              },
            ],
          },
          mutating: false,
        },
      ],
      step: 2,
    });

    expect(closeSkills.map((skill) => skill.id)).toContain('job-authoring');
    expect(closeToolCall).toMatchObject({
      function: { name: 'close_job' },
    });
    expect(JSON.parse(closeToolCall?.function.arguments ?? '{}')).toEqual({
      jobId: 'cloud-devops-lead-id',
    });
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

  it('builds a confirmation-gated create_job call from generated JD output', () => {
    const message =
      'Create a Senior UI/UX Designer job named QA Agentic UI/UX Designer for Digital BU.';
    const skills = selectAgentRuntimeSkills({
      message,
      role: 'ta',
      hasAttachments: false,
    });
    const toolNames = selectToolNamesForSkills(skills);
    const toolCall = buildMissingCreateJobToolCall({
      message,
      skills,
      availableToolNames: toolNames,
      step: 2,
      records: [
        {
          toolName: 'generate_job_description',
          args: { title: 'QA Agentic UI/UX Designer', seniority: 'Senior', businessUnit: 'Digital' },
          mutating: false,
          result: {
            success: true,
            data: {
              title: 'Senior UI/UX Designer - QA Specialist',
              description:
                'Lead discovery, interaction design, accessibility, prototyping, and design-system collaboration for enterprise recruitment products.',
              mustHave: [
                'Proficiency in design tools such as Figma, Sketch, or Adobe XD',
                'Familiarity with accessibility standards (WCAG 2.1) and inclusive design principles',
              ],
              niceToHave: [
                'Experience with design systems and component-based design',
              ],
              seniority: 'Senior',
              businessUnit: 'Digital',
            },
          },
        },
      ],
    });

    expect(toolCall).toMatchObject({
      id: 'missing-create-job-recovery-2',
      type: 'function',
      function: { name: 'create_job' },
    });
    expect(JSON.parse(toolCall?.function.arguments ?? '{}')).toMatchObject({
      title: 'QA Agentic UI/UX Designer',
      seniority: 'Senior',
      businessUnit: 'Digital',
      mustHave: ['Figma', 'Sketch', 'Adobe XD', 'Accessibility', 'WCAG'],
      niceToHave: ['Design systems'],
    });
  });
});
