import { describe, expect, it } from 'vitest';

import {
  buildAgentSkillPrompt,
  buildMissingToolRetryMessage,
  selectMissingToolRecoveryToolNames,
  selectAgentRuntimeSkills,
  selectToolNamesForSkills,
  shouldRetryForMissingToolUse,
} from '../services/statistics-chat-skills';

describe('statistics chat runtime skills', () => {
  it('selects visualization skills and scoped admin analytics tools for diagram requests', () => {
    const skills = selectAgentRuntimeSkills({
      message: 'Show me a diagramme of the recruitment pipeline analytics',
      role: 'admin',
      hasAttachments: false,
    });
    const skillIds = skills.map((skill) => skill.id);
    const toolNames = selectToolNamesForSkills(skills);

    expect(skillIds).toContain('analytics-visualization');
    expect(toolNames).toContain('get_recruitment_analytics');
    expect(toolNames).toContain('get_smart_insights');

    const prompt = buildAgentSkillPrompt(skills, toolNames);
    expect(prompt).toContain('SECTION 11: DYNAMIC AGENT SKILLS');
    expect(prompt).toContain('Analytics and diagram generation');

    expect(
      shouldRetryForMissingToolUse({
        message: 'Show me a diagramme of the recruitment pipeline analytics',
        skills,
        availableToolNames: toolNames,
        toolExecutionCount: 0,
      }),
    ).toBe(true);
  });

  it('selects proactive operations tools for broad next-step requests', () => {
    const skills = selectAgentRuntimeSkills({
      message: 'chbowa next step tawa',
      role: 'manager',
      hasAttachments: false,
    });
    const skillIds = skills.map((skill) => skill.id);
    const toolNames = selectToolNamesForSkills(skills);

    expect(skillIds).toContain('proactive-operations');
    expect(toolNames).toContain('get_dashboard_stats');
    expect(toolNames).toContain('get_today_interviews');
    expect(toolNames).toContain('get_notifications');
    expect(skills.find((skill) => skill.id === 'proactive-operations')?.instructions).toContain(
      'Treat the response as a production operating workflow using role-scoped live data, not a staged walkthrough.',
    );
    expect(
      shouldRetryForMissingToolUse({
        message: 'chbowa next step tawa',
        skills,
        availableToolNames: toolNames,
        toolExecutionCount: 0,
      }),
    ).toBe(true);
    expect(
      selectMissingToolRecoveryToolNames({
        skills,
        availableToolNames: toolNames,
      }),
    ).toEqual([
      'get_dashboard_stats',
      'get_smart_insights',
      'get_today_interviews',
      'get_notifications',
    ]);
  });

  it('does not activate admin-only governance tools for a TA request', () => {
    const skills = selectAgentRuntimeSkills({
      message: 'Find top React CVs and rank the best profiles',
      role: 'ta',
      hasAttachments: false,
    });
    const skillIds = skills.map((skill) => skill.id);
    const toolNames = selectToolNamesForSkills(skills);

    expect(skillIds).toContain('cv-search');
    expect(skillIds).not.toContain('governance-admin');
    expect(toolNames).toContain('rag_search_cvs');
    expect(toolNames).not.toContain('get_system_overview');
  });

  it('builds an explicit repair instruction when the model skipped required tools', () => {
    const skills = selectAgentRuntimeSkills({
      message: 'Give me dashboard stats with a chart',
      role: 'ta',
      hasAttachments: false,
    });
    const toolNames = selectToolNamesForSkills(skills);

    const retryMessage = buildMissingToolRetryMessage(skills, toolNames);

    expect(retryMessage).toContain('used no tools');
    expect(retryMessage).toContain('get_dashboard_stats');
    expect(retryMessage).toContain('Call the smallest necessary tool set now');
  });

  it('selects deterministic recovery tools when the model ignores required skills', () => {
    const skills = selectAgentRuntimeSkills({
      message: 'Aatini pipeline diagram mtaa recruitment',
      role: 'ta',
      hasAttachments: false,
    });
    const toolNames = selectToolNamesForSkills(skills);

    expect(
      selectMissingToolRecoveryToolNames({
        skills,
        availableToolNames: toolNames,
      }),
    ).toEqual(['get_dashboard_stats', 'get_smart_insights']);
  });
});
