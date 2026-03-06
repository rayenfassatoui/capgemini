"use client";

import { GlassCard } from "./glass-card";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RecruitmentAnalytics } from "@/features/recruitment/services/admin";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function TopRecruitersList({ analytics }: { analytics: RecruitmentAnalytics }) {
  return (
    <GlassCard>
      <CardHeader>
        <CardTitle>Top Recruiters</CardTitle>
        <CardDescription>Most active talent acquisition specialists</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {analytics.topRecruiters.map((recruiter, index) => (
          <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-900/80 transition-colors border border-white/20 dark:border-white/5 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-white dark:border-slate-800 shadow-sm">
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-medium">
                  {recruiter.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold text-foreground">{recruiter.name}</p>
                <p className="text-xs text-muted-foreground">{recruiter.email}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">
                {recruiter.candidatesProcessed}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Candidates
              </span>
            </div>
          </div>
        ))}
        {analytics.topRecruiters.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No recruiter activity yet.
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
