"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { GlassCard } from "./glass-card";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import { useTheme } from "next-themes";

const REJECTION_LABELS: Record<string, string> = {
  ta_rejected: "TA Rejected",
  manager_rejected: "Mgr Rejected",
  hr_rejected: "HR Rejected",
};

const COLORS = [
  "#f87171", // ta rejected - red-400
  "#ef4444", // mgr rejected - red-500
  "#b91c1c", // hr rejected - red-700
];

export function RejectionBreakdownChart({ analytics }: { analytics: RecruitmentAnalytics }) {
  const { theme } = useTheme();

  const data = [
    { name: REJECTION_LABELS.ta_rejected, value: analytics.pipelineFunnel.ta_rejected },
    { name: REJECTION_LABELS.manager_rejected, value: analytics.pipelineFunnel.manager_rejected },
    { name: REJECTION_LABELS.hr_rejected, value: analytics.pipelineFunnel.hr_rejected },
  ].filter((item) => item.value > 0);

  return (
    <GlassCard>
      <CardHeader>
        <CardTitle>Rejection Breakdown</CardTitle>
        <CardDescription>Where candidates are dropped</CardDescription>
      </CardHeader>
      <CardContent className="h-[350px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                  borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                itemStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle"
                wrapperStyle={{
                    paddingTop: "20px"
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No rejections recorded yet.
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
