import { describe, expect, it } from 'vitest';

import {
  appendChatChartsToContent,
  extractChatChartsFromContent,
} from '../chat-chart-events';
import { buildAnalyticsChartsFromToolRecords } from '../services/chat-analytics-charts';
import { buildRecruitmentMermaidDiagramFromToolRecords, normalizeMermaidCodeFences, stripMermaidCodeFences } from '../services/chat-analytics-diagrams';

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

const dashboardData = {
  totalCandidates: 0,
  totalJobs: 5,
  totalInterviewsToday: 0,
  pendingScreenings: 0,
  stageBreakdown: {
    new: 0,
    ta_screening: 0,
  },
};


const adminAnalyticsData = {
  pipelineFunnel: smartInsightsData.pipelineFunnel,
  hiringRate: 18,
  rejectionRate: 12,
  candidatesPerJob: [
    { jobTitle: 'Data Engineer', count: 4 },
    { jobTitle: 'Frontend Engineer', count: 2 },
  ],
  interviewsPerStage: [
    { stage: 'TA', count: 3 },
    { stage: 'Manager', count: 2 },
  ],
  monthlyHiringTrend: [
    { month: 'Jan', hired: 1, rejected: 0 },
    { month: 'Feb', hired: 2, rejected: 1 },
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

  it('labels dashboard candidates as pipeline candidates', () => {
    const charts = buildAnalyticsChartsFromToolRecords([
      { toolName: 'get_dashboard_stats', result: { success: true, data: dashboardData } },
    ]);

    const dashboardChart = charts.find((chart) => chart.id === 'dashboard-kpis');

    expect(dashboardChart?.description).toContain('assigned pipeline candidates');
    expect(dashboardChart?.data[0]).toMatchObject({
      label: 'Pipeline candidates',
      count: 0,
    });
  });

  it('normalizes unlabeled Mermaid fences so Streamdown renders model diagrams', () => {
    const normalized = normalizeMermaidCodeFences(`\`\`\`
graph TD
  A[CV Pool: 10] --> B[Pipeline Candidates: 0]
\`\`\``);

    expect(normalized).toContain('```mermaid');
    expect(normalized).toContain('graph TD');
  });

  it('strips model Mermaid fences before appending deterministic diagrams', () => {
    const stripped = stripMermaidCodeFences(`Before
\`\`\`mermaid
flowchart TD
  A[Open Jobs: 5] --> B[Pipeline Candidates: 0]
\`\`\`
After`);

    expect(stripped).toBe('Before\n\nAfter');
  });

  it('builds a valid Mermaid pipeline diagram even when all fetched stages are zero', () => {
    const diagram = buildRecruitmentMermaidDiagramFromToolRecords(
      [
        {
          toolName: 'get_dashboard_stats',
          args: {},
          mutating: false,
          result: { success: true, data: dashboardData },
        },
      ],
      { question: 'show Mermaid pipeline diagram' }
    );

    expect(diagram).toContain('```mermaid');
    expect(diagram).toContain('flowchart LR');
    expect(diagram).toContain('New<br/>0 candidates');
  });

  it('builds chart cards from admin recruitment analytics tool output', () => {
    const charts = buildAnalyticsChartsFromToolRecords(
      [
        {
          toolName: 'get_recruitment_analytics',
          result: { success: true, data: adminAnalyticsData },
        },
      ],
      { question: 'show admin hiring trend analytics' }
    );

    expect(charts.map((chart) => chart.id)).toContain('admin-hiring-trend');
    expect(charts.map((chart) => chart.id)).toContain('pipeline-funnel');
  });

  it('builds a valid Mermaid pipeline diagram from fetched stage counts', () => {
    const diagram = buildRecruitmentMermaidDiagramFromToolRecords(
      [
        {
          toolName: 'get_recruitment_analytics',
          args: {},
          mutating: false,
          result: { success: true, data: adminAnalyticsData },
        },
      ],
      { question: 'diagramme pipeline' }
    );

    expect(diagram).toContain('```mermaid');
    expect(diagram).toContain('flowchart LR');
    expect(diagram).toContain('New<br/>4 candidates');
  });
});
