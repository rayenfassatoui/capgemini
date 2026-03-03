"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { GlassCard } from "./glass-card";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import { useTheme } from "next-themes";

export function HiringTrendChart({ analytics }: { analytics: RecruitmentAnalytics }) {
  const { theme } = useTheme();

  return (
    <GlassCard className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle>Monthly Hiring Trend</CardTitle>
        <CardDescription>Hired vs Rejected candidates over the last 6 months</CardDescription>
      </CardHeader>
      <CardContent className="h-[350px]">
        {analytics.monthlyHiringTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={analytics.monthlyHiringTrend}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorHired" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorRejected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="month" 
                tick={{ fill: theme === 'dark' ? '#9ca3af' : '#4b5563', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: theme === 'dark' ? '#9ca3af' : '#4b5563', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#333' : '#e5e7eb'} />
              <Tooltip
                cursor={{ stroke: theme === 'dark' ? '#ffffff20' : '#00000010' }}
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                  borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                itemStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}
              />
              <Legend verticalAlign="top" height={36}/>
              <Area 
                type="monotone" 
                dataKey="hired" 
                stroke="#10b981" 
                fillOpacity={1} 
                fill="url(#colorHired)" 
                strokeWidth={2}
                name="Hired"
              />
              <Area 
                type="monotone" 
                dataKey="rejected" 
                stroke="#ef4444" 
                fillOpacity={1} 
                fill="url(#colorRejected)" 
                strokeWidth={2}
                name="Rejected"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
           <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No trend data available.
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
