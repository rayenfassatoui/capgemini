"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <Card className={cn(
      "bg-white/80 dark:bg-black/40 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-white/5",
      className
    )}>
      {children}
    </Card>
  );
}

interface GlassCardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function GlassCardHeader({ title, description, action, className }: GlassCardHeaderProps) {
  return (
    <CardHeader className={cn("pb-2", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg font-semibold tracking-tight text-foreground/90">
            {title}
          </CardTitle>
          {description && (
            <CardDescription className="text-xs font-medium text-muted-foreground/80">
              {description}
            </CardDescription>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </CardHeader>
  );
}
