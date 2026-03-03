"use client";

import { GlassCard } from "./glass-card";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import { Badge } from "@/components/ui/badge";

export function CandidatesPerJobList({ analytics }: { analytics: RecruitmentAnalytics }) {
  return (
    <GlassCard>
      <CardHeader>
        <CardTitle>Candidates per Job</CardTitle>
        <CardDescription>Top job positions by candidate volume</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {analytics.candidatesPerJob.map((job, index) => (
          <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-transparent hover:bg-slate-50 dark:hover:bg-slate-900/50 hover:border-slate-200 dark:hover:border-slate-800 transition-all group">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-500 group-hover:bg-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {index + 1}
              </div>
              <p className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-[300px]">
                {job.jobTitle}
              </p>
            </div>
            <Badge variant="secondary" className="group-hover:bg-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {job.count} candidates
            </Badge>
          </div>
        ))}
        {analytics.candidatesPerJob.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No active job applications.
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
