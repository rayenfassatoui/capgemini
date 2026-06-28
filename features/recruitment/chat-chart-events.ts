import type {
  RecruitmentAnalyticsChart,
  RecruitmentAnalyticsChartKind,
} from './types';

export const CHAT_CHART_EVENT_PREFIX = '@@CHART@@';

const VALID_CHART_KINDS: Record<RecruitmentAnalyticsChartKind, true> = {
  line: true,
  bar: true,
  'comparison-bar': true,
};

const SERIES_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const SAFE_CHART_COLOR_RE =
  /^(?:var\(--chart-[1-5]\)|#[0-9A-Fa-f]{3,8}|(?:oklch|rgb|rgba)\([^)]+\))$/;

function isRecruitmentAnalyticsChartKind(
  value: unknown
): value is RecruitmentAnalyticsChartKind {
  return typeof value === 'string' && value in VALID_CHART_KINDS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChartDatum(
  value: unknown,
  seriesKeys: readonly string[]
): value is RecruitmentAnalyticsChart['data'][number] {
  if (!isRecord(value) || typeof value.label !== 'string') {
    return false;
  }

  for (const key of seriesKeys) {
    if (typeof value[key] !== 'number') {
      return false;
    }
  }

  return true;
}

function normalizeChartColor(value: string): string | null {
  const color = value.trim();
  if (!SAFE_CHART_COLOR_RE.test(color)) {
    return null;
  }

  return color;
}

function parseChartSeries(value: unknown): RecruitmentAnalyticsChart['series'] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const series: RecruitmentAnalyticsChart['series'] = [];
  const keys = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== 'string' || typeof item.label !== 'string') {
      return null;
    }

    const key = item.key.trim();
    const label = item.label.trim();
    if (!SERIES_KEY_RE.test(key) || !label || keys.has(key)) {
      return null;
    }

    const color =
      typeof item.color === 'string' ? normalizeChartColor(item.color) : null;

    keys.add(key);
    series.push({
      key,
      label,
      ...(color ? { color } : {}),
    });
  }

  return series;
}

export function normalizeRecruitmentAnalyticsChart(
  value: unknown
): RecruitmentAnalyticsChart | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, kind, title, description, xKey, data, summary } = value;
  if (
    typeof id !== 'string' ||
    !isRecruitmentAnalyticsChartKind(kind) ||
    typeof title !== 'string' ||
    xKey !== 'label'
  ) {
    return null;
  }

  const normalizedId = id.trim();
  const normalizedTitle = title.trim();
  if (!normalizedId || !normalizedTitle) {
    return null;
  }

  const series = parseChartSeries(value.series);
  if (!series) {
    return null;
  }

  const seriesKeys = series.map((item) => item.key);
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const normalizedData: RecruitmentAnalyticsChart['data'] = [];
  for (const datum of data) {
    if (!isChartDatum(datum, seriesKeys)) {
      return null;
    }

    const normalizedDatum: RecruitmentAnalyticsChart['data'][number] = {
      label: datum.label,
    };
    for (const key of seriesKeys) {
      normalizedDatum[key] = datum[key];
    }
    normalizedData.push(normalizedDatum);
  }

  return {
    id: normalizedId,
    kind,
    title: normalizedTitle,
    ...(typeof description === 'string' && description.trim()
      ? { description: description.trim() }
      : {}),
    xKey: 'label',
    series,
    data: normalizedData,
    ...(typeof summary === 'string' && summary.trim()
      ? { summary: summary.trim() }
      : {}),
  };
}

export function parseChatChartEvent(line: string): RecruitmentAnalyticsChart | null {
  const payload = line.startsWith(CHAT_CHART_EVENT_PREFIX)
    ? line.slice(CHAT_CHART_EVENT_PREFIX.length)
    : line;

  try {
    return normalizeRecruitmentAnalyticsChart(JSON.parse(payload));
  } catch {
    return null;
  }
}

export function serializeChatChartEvent(chart: RecruitmentAnalyticsChart): string {
  return `${CHAT_CHART_EVENT_PREFIX}${JSON.stringify(chart)}`;
}

function pushUniqueChart(
  charts: RecruitmentAnalyticsChart[],
  chart: RecruitmentAnalyticsChart
) {
  const index = charts.findIndex((item) => item.id === chart.id);
  if (index === -1) {
    charts.push(chart);
    return;
  }

  charts[index] = chart;
}

export function appendChatChartsToContent(
  content: string,
  charts: readonly RecruitmentAnalyticsChart[]
): string {
  if (charts.length === 0) {
    return content;
  }

  const chartLines = charts.map(serializeChatChartEvent);
  const trimmedContent = content.trimEnd();
  if (!trimmedContent) {
    return chartLines.join('\n');
  }

  return `${trimmedContent}\n${chartLines.join('\n')}`;
}

export function extractChatChartsFromContent(content: string): {
  content: string;
  charts: RecruitmentAnalyticsChart[];
} {
  const charts: RecruitmentAnalyticsChart[] = [];
  const visibleLines: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith(CHAT_CHART_EVENT_PREFIX)) {
      const chart = parseChatChartEvent(line);
      if (chart) {
        pushUniqueChart(charts, chart);
      }
      continue;
    }

    visibleLines.push(line);
  }

  return {
    content: visibleLines.join('\n').trimEnd(),
    charts,
  };
}
