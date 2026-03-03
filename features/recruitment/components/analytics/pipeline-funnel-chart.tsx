"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { GlassCard } from "./glass-card";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import { useTheme } from "next-themes";

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

const COLORS = [
  "#94a3b8", // new - slate-400
  "#60a5fa", // screening - blue-400
  "#3b82f6", // ta interview - blue-500
  "#2563eb", // ta accepted - blue-600
  "#818cf8", // mgr interview - indigo-400
  "#6366f1", // mgr accepted - indigo-500
  "#a78bfa", // hr interview - violet-400
  "#8b5cf6", // hr accepted - violet-500
  "#10b981", // hired - emerald-500
];

export function PipelineFunnelChart({ analytics }: { analytics: RecruitmentAnalytics }) {
  const { theme } = useTheme();
  
  const data = [
    { name: STAGE_LABELS.new, value: analytics.pipelineFunnel.new, fill: COLORS[0] },
    { name: STAGE_LABELS.ta_screening, value: analytics.pipelineFunnel.ta_screening, fill: COLORS[1] },
    { name: STAGE_LABELS.ta_interview, value: analytics.pipelineFunnel.ta_interview, fill: COLORS[2] },
    { name: STAGE_LABELS.ta_accepted, value: analytics.pipelineFunnel.ta_accepted, fill: COLORS[3] },
    { name: STAGE_LABELS.manager_interview, value: analytics.pipelineFunnel.manager_interview, fill: COLORS[4] },
    { name: STAGE_LABELS.manager_accepted, value: analytics.pipelineFunnel.manager_accepted, fill: COLORS[5] },
    { name: STAGE_LABELS.hr_interview, value: analytics.pipelineFunnel.hr_interview, fill: COLORS[6] },
    { name: STAGE_LABELS.hr_accepted, value: analytics.pipelineFunnel.hr_accepted, fill: COLORS[7] },
    { name: STAGE_LABELS.hired, value: analytics.pipelineFunnel.hired, fill: COLORS[8] },
  ];

  return (
    <GlassCard className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Recruitment Pipeline</CardTitle>
        <CardDescription>Candidate progression through stages</CardDescription>
      </CardHeader>
      <CardContent className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={theme === 'dark' ? '#333' : '#e5e7eb'} />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={100} 
              tick={{ fill: theme === 'dark' ? '#9ca3af' : '#4b5563', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: theme === 'dark' ? '#ffffff10' : '#00000005' }}
              contentStyle={{
                backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              itemStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </GlassCard>
  );
}
