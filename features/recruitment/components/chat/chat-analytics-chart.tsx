"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { IconChartBar, IconChartLine } from "@tabler/icons-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import type { RecruitmentAnalyticsChart } from "../../types";

const FALLBACK_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

function buildChartConfig(chart: RecruitmentAnalyticsChart): ChartConfig {
  const config: ChartConfig = {};

  chart.series.forEach((series, index) => {
    config[series.key] = {
      label: series.label,
      color: series.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    };
  });

  return config;
}

function formatTick(value: unknown): string {
  const text = String(value);
  return text.length > 16 ? `${text.slice(0, 14)}…` : text;
}

function AnalyticsLineChart({
  chart,
  config,
}: {
  chart: RecruitmentAnalyticsChart;
  config: ChartConfig;
}) {
  return (
    <ChartContainer
      config={config}
      className="h-[220px] w-full [&_.recharts-curve.recharts-tooltip-cursor]:stroke-initial"
    >
      <LineChart data={chart.data} margin={{ top: 8, right: 14, left: 0, bottom: 4 }}>
        <CartesianGrid
          stroke="var(--border)"
          strokeDasharray="4 8"
          vertical={false}
        />
        <XAxis
          dataKey={chart.xKey}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickMargin={10}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          width={28}
        />
        <ChartTooltip
          content={<ChartTooltipContent />}
          cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
        />
        {chart.series.map((series, index) => (
          <Line
            key={series.key}
            dataKey={series.key}
            type="monotone"
            stroke={`var(--color-${series.key})`}
            strokeWidth={index === 0 ? 2.5 : 2}
            dot={{ r: 3, strokeWidth: 1.5 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

function AnalyticsBarChart({
  chart,
  config,
}: {
  chart: RecruitmentAnalyticsChart;
  config: ChartConfig;
}) {
  return (
    <ChartContainer config={config} className="h-[260px] w-full">
      <BarChart
        data={chart.data}
        layout="vertical"
        margin={{ top: 4, right: 14, left: 8, bottom: 4 }}
        barCategoryGap={chart.kind === "comparison-bar" ? 10 : 8}
      >
        <CartesianGrid
          stroke="var(--border)"
          strokeDasharray="4 8"
          horizontal={false}
        />
        <XAxis
          type="number"
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          dataKey={chart.xKey}
          type="category"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={formatTick}
          width={116}
        />
        <ChartTooltip
          content={<ChartTooltipContent />}
          cursor={{ fill: "var(--muted)" }}
        />
        {chart.series.map((series, index) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            fill={`var(--color-${series.key})`}
            radius={index === chart.series.length - 1 ? [0, 7, 7, 0] : [7, 7, 7, 7]}
            maxBarSize={24}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

function ChartDataSummary({ chart }: { chart: RecruitmentAnalyticsChart }) {
  const topRows = chart.data.slice(0, 4);

  return (
    <dl className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
      {topRows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
        >
          <dt className="truncate text-[11px] font-medium text-muted-foreground">
            {row.label}
          </dt>
          <dd className="flex shrink-0 items-center gap-2 text-[11px] font-semibold tabular-nums text-foreground">
            {chart.series.map((series) => (
              <span key={series.key}>
                {series.label}: {Number(row[series.key]).toLocaleString()}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ChatAnalyticsChart({
  chart,
  className,
}: {
  chart: RecruitmentAnalyticsChart;
  className?: string;
}) {
  if (chart.data.length === 0 || chart.series.length === 0) {
    return null;
  }

  const config = buildChartConfig(chart);
  const isLine = chart.kind === "line";
  const Icon = isLine ? IconChartLine : IconChartBar;

  return (
    <Card
      className={cn(
        "w-full overflow-hidden border-border/70 bg-card/80 shadow-sm backdrop-blur",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold tracking-tight">
              {chart.title}
            </CardTitle>
            {chart.description ? (
              <CardDescription className="mt-1 text-xs leading-5">
                {chart.description}
              </CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLine ? (
          <AnalyticsLineChart chart={chart} config={config} />
        ) : (
          <AnalyticsBarChart chart={chart} config={config} />
        )}
        {chart.summary ? (
          <p className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {chart.summary}
          </p>
        ) : null}
        <ChartDataSummary chart={chart} />
      </CardContent>
    </Card>
  );
}
