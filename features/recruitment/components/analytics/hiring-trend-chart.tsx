"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "./glass-card";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";

const chartConfig = {
  hired: {
    label: "Hired",
    color: "hsl(var(--chart-2))", // using chart-2 for success (emerald)
  },
  rejected: {
    label: "Rejected",
    color: "hsl(var(--chart-1))", // using chart-1 for destructive (rose)
  },
};

export function HiringTrendChart({ analytics }: { analytics: RecruitmentAnalytics }) {
  return (
    <GlassCard className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Monthly Hiring Trend</CardTitle>
        <CardDescription>Hired vs Rejected candidates over the last 6 months</CardDescription>
      </CardHeader>
      <CardContent className="h-[350px]">
        {analytics.monthlyHiringTrend.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-full w-full">
            <AreaChart
              data={analytics.monthlyHiringTrend}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="fillHired" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-hired)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-hired)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fillRejected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-rejected)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-rejected)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="month" 
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => value.slice(0, 3)}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tickMargin={8}
              />
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "4 4" }}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Area 
                type="monotone" 
                dataKey="hired" 
                stroke="var(--color-hired)" 
                fill="url(#fillHired)" 
                strokeWidth={2}
                name="hired"
              />
              <Area 
                type="monotone" 
                dataKey="rejected" 
                stroke="var(--color-rejected)" 
                fill="url(#fillRejected)" 
                strokeWidth={2}
                name="rejected"
              />
              <ChartLegend content={<ChartLegendContent verticalAlign="top" />} />
            </AreaChart>
          </ChartContainer>
        ) : (
           <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No trend data available.
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
