"use client";

import {
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { GlassCard } from "./glass-card";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";

const REJECTION_LABELS: Record<string, string> = {
  ta_rejected: "TA Rejected",
  manager_rejected: "Mgr Rejected",
  hr_rejected: "HR Rejected",
};

const chartConfig = {
  value: {
    label: "Rejections",
  },
  ta_rejected: {
    label: "TA Rejected",
    color: "var(--chart-1)",
  },
  manager_rejected: {
    label: "Manager Rejected",
    color: "var(--chart-2)",
  },
  hr_rejected: {
    label: "HR Rejected",
    color: "var(--chart-3)",
  },
};

export function RejectionBreakdownChart({ analytics }: { analytics: RecruitmentAnalytics }) {
  const data = [
    { name: REJECTION_LABELS.ta_rejected, value: analytics.pipelineFunnel.ta_rejected, fill: "var(--color-ta_rejected)" },
    { name: REJECTION_LABELS.manager_rejected, value: analytics.pipelineFunnel.manager_rejected, fill: "var(--color-manager_rejected)" },
    { name: REJECTION_LABELS.hr_rejected, value: analytics.pipelineFunnel.hr_rejected, fill: "var(--color-hr_rejected)" },
  ].filter((item) => item.value > 0);

  return (
    <GlassCard>
      <CardHeader>
        <CardTitle>Rejection Breakdown</CardTitle>
        <CardDescription>Where candidates are dropped</CardDescription>
      </CardHeader>
      <CardContent className="h-[350px]">
        {data.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-full w-full mx-auto aspect-square">
            <PieChart>
              <ChartTooltip
                cursor={{ fill: "transparent" }}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill} 
                    className="hover:opacity-80 transition-opacity"
                  />
                ))}
              </Pie>
              <ChartLegend 
                content={<ChartLegendContent />} 
                className="-translate-y-4"
              />
            </PieChart>
          </ChartContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No rejections recorded yet.
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
