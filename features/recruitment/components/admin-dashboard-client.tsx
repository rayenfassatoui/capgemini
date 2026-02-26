"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IconUsers,
  IconBriefcase,
  IconFileText,
  IconCalendarEvent,
  IconUserShield,
} from "@tabler/icons-react";
import type { SystemOverview } from "@/features/recruitment/services/admin";

interface AdminDashboardClientProps {
  overview: SystemOverview | null;
}

const ROLE_COLORS: Record<string, string> = {
  ta: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
  manager: "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400",
  hr: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
  admin: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
};

export function AdminDashboardClient({ overview }: AdminDashboardClientProps) {
  if (!overview) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Failed to load system overview.
      </div>
    );
  }

  const stats = [
    {
      label: "Total Users",
      value: overview.totalUsers,
      icon: IconUsers,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Total Jobs",
      value: overview.totalJobs,
      icon: IconBriefcase,
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Total Candidates",
      value: overview.totalCandidates,
      icon: IconUserShield,
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      label: "CVs in Pool",
      value: overview.totalCvsInPool,
      icon: IconFileText,
      color: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Total Interviews",
      value: overview.totalInterviews,
      icon: IconCalendarEvent,
      color: "text-rose-600 dark:text-rose-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                  </div>
                  <Icon className={`h-8 w-8 opacity-80 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Users by Role + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Users by Role */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Users by Role</CardTitle>
            <CardDescription>Distribution of users across roles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overview.usersByRole.map((entry) => {
                const percentage =
                  overview.totalUsers > 0
                    ? Math.round((entry.count / overview.totalUsers) * 100)
                    : 0;
                return (
                  <div key={entry.role} className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={`w-20 justify-center capitalize ${ROLE_COLORS[entry.role] ?? ""}`}
                    >
                      {entry.role}
                    </Badge>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className="h-2 rounded-full bg-gray-900 dark:bg-white transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-16 text-right text-sm font-medium tabular-nums">
                      {entry.count} ({percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Latest actions across the platform</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recentActivity.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No activity recorded yet
              </p>
            ) : (
              <div className="space-y-3">
                {overview.recentActivity.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 rounded-md border border-transparent px-2 py-2 transition hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-800 dark:hover:bg-gray-900"
                  >
                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{entry.userName}</span>{" "}
                        <span className="text-muted-foreground">{entry.action}</span>{" "}
                        <span className="text-muted-foreground">
                          {entry.entityType}
                        </span>
                      </p>
                      {entry.details && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {entry.details}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                        {entry.createdAt
                          ? new Date(entry.createdAt).toLocaleString()
                          : "Unknown"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
