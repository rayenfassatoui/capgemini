import { describe, expect, it } from 'vitest';

import {
  appendChatChartsToContent,
  extractChatChartsFromContent,
} from '../chat-chart-events';
import { buildAnalyticsChartsFromToolRecords } from '../services/chat-analytics-charts';

const smartInsightsData = {
  mostDemandedJobProfiles: [
    { title: 'Data Engineer', count: 3 },
    { title: 'Frontend Engineer', count: 1 },
  ],
  mostCommonCvSkills: [
    { skill: 'React', count: 5 },
    { skill: 'SQL', count: 4 },
  ],
  skillGapAnalysis: [
    { skill: 'python', demand: 5, supply: 2 },
    { skill: 'react', demand: 3, supply: 5 },
  ],
  pipelineFunnel: {
    new: 4,
    ta_screening: 3,
    ta_interview: 2,
    ta_accepted: 1,
    ta_rejected: 0,
    manager_interview: 1,
    manager_accepted: 0,
    manager_rejected: 0,
    hr_interview: 1,
    hr_accepted: 0,
    hr_rejected: 0,
    hired: 1,
  },
};

const cvPoolData = {
  totalCvs: 7,
  topSkills: [
    { skill: 'React', count: 5 },
    { skill: 'Node.js', count: 3 },
  ],
  languageDistribution: [
    { language: 'French', count: 4 },
    { language: 'English', count: 6 },
  ],
  uploadTrend: [
    { date: '2026-06-15', count: 0 },
    { date: '2026-06-16', count: 1 },
    { date: '2026-06-17', count: 2 },
    { date: '2026-06-18', count: 0 },
    { date: '2026-06-19', count: 3 },
    { date: '2026-06-20', count: 1 },
    { date: '2026-06-21', count: 0 },
  ],
};

describe('chat analytics charts', () => {
  it('prioritizes a line chart when the analytics question asks for a curve', () => {
    const charts = buildAnalyticsChartsFromToolRecords(
      [
        { toolName: 'get_smart_insights', result: { success: true, data: smartInsightsData } },
        { toolName: 'get_cv_pool_stats', result: { success: true, data: cvPoolData } },
      ],
      { question: 'aamel courbe mtaa cv upload analytics' }
    );

    expect(charts[0]?.id).toBe('cv-upload-trend');
    expect(charts[0]?.kind).toBe('line');
    expect(charts.some((chart) => chart.id === 'pipeline-funnel')).toBe(true);
  });

  it('serializes chart events into persisted content and extracts them without showing markers', () => {
    const [chart] = buildAnalyticsChartsFromToolRecords(
      [{ toolName: 'get_smart_insights', result: { success: true, data: smartInsightsData } }],
      { question: 'show pipeline analytics' }
    );

    expect(chart).toBeDefined();

    const persisted = appendChatChartsToContent('## Observed\nPipeline has data.', [chart]);
    const parsed = extractChatChartsFromContent(persisted);

    expect(parsed.content).toBe('## Observed\nPipeline has data.');
    expect(parsed.content).not.toContain('@@CHART@@');
    expect(parsed.charts).toHaveLength(1);
    expect(parsed.charts[0]).toMatchObject({
      id: 'pipeline-funnel',
      kind: 'bar',
      title: 'Pipeline funnel',
    });
  });

  it('ignores failed or malformed tool outputs instead of rendering broken charts', () => {
    const charts = buildAnalyticsChartsFromToolRecords([
      { toolName: 'get_smart_insights', result: { success: false, data: smartInsightsData } },
      { toolName: 'get_cv_pool_stats', result: { success: true, data: { totalCvs: 'bad' } } },
    ]);

    expect(charts).toEqual([]);
  });
});
