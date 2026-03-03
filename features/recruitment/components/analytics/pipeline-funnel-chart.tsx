"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Cell,
  LabelList,
} from "recharts";
import { GlassCard } from "./glass-card";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  ta_screening: "Screening",
  ta_interview: "TA Interview",
  ta_accepted: "TA Accepted",
  manager_interview: "Mgr Interview",
  manager_accepted: "Mgr Accepted",
  hr_interview: "HR Interview",
  hr_accepted: "HR Accepted",
  hired: "Hired",
};

const chartConfig = {
  value: {
    label: "Candidates",
  },
};

export function PipelineFunnelChart({ analytics }: { analytics: RecruitmentAnalytics }) {
  const data = [
    { name: STAGE_LABELS.new, value: analytics.pipelineFunnel.new, fill: "hsl(var(--chart-1))" },
    { name: STAGE_LABELS.ta_screening, value: analytics.pipelineFunnel.ta_screening, fill: "hsl(var(--chart-2))" },
    { name: STAGE_LABELS.ta_interview, value: analytics.pipelineFunnel.ta_interview, fill: "hsl(var(--chart-3))" },
    { name: STAGE_LABELS.ta_accepted, value: analytics.pipelineFunnel.ta_accepted, fill: "hsl(var(--chart-4))" },
    { name: STAGE_LABELS.manager_interview, value: analytics.pipelineFunnel.manager_interview, fill: "hsl(var(--chart-5))" },
    { name: STAGE_LABELS.manager_accepted, value: analytics.pipelineFunnel.manager_accepted, fill: "hsl(var(--chart-1))" },
    { name: STAGE_LABELS.hr_interview, value: analytics.pipelineFunnel.hr_interview, fill: "hsl(var(--chart-2))" },
    { name: STAGE_LABELS.hr_accepted, value: analytics.pipelineFunnel.hr_accepted, fill: "hsl(var(--chart-3))" },
    { name: STAGE_LABELS.hired, value: analytics.pipelineFunnel.hired, fill: "hsl(var(--chart-4))" },
  ];

  return (
    <GlassCard className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Recruitment Pipeline</CardTitle>
        <CardDescription>Candidate progression through stages</CardDescription>
      </CardHeader>
      <CardContent className="h-[350px]">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={110}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
            />
            <ChartTooltip
              cursor={{ fill: "var(--accent)" }}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} className="hover:opacity-80 transition-opacity" />
              ))}
              <LabelList 
                dataKey="value" 
                position="right" 
                className="fill-foreground text-xs font-semibold"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </GlassCard>
  );
}
