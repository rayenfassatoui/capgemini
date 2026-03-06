"use client";

import { cn } from "@/lib/utils";
import { GlassCard } from "./glass-card";
import { IconArrowUpRight, IconArrowDownRight, IconMinus } from "@tabler/icons-react";
import { motion } from "framer-motion";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: {
    value: number; // percentage
    direction: "up" | "down" | "neutral";
    label?: string;
  };
  icon?: React.ElementType;
  className?: string;
  color?: "default" | "emerald" | "blue" | "purple" | "rose" | "amber";
}

const colorMap = {
  default: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function AnalyticsStatCard({
  title,
  value,
  description,
  trend,
  icon: Icon,
  className,
  color = "default",
}: StatCardProps) {
  return (
    <GlassCard className={cn("p-6 flex flex-col justify-between h-full", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mt-2 text-3xl font-bold tracking-tight text-foreground"
          >
            {value}
          </motion.div>
        </div>
        {Icon && (
          <div className={cn("p-2 rounded-lg", colorMap[color])}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {(description || trend) && (
        <div className="mt-4 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={cn(
                "flex items-center font-medium px-1.5 py-0.5 rounded-md",
                trend.direction === "up" && "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400",
                trend.direction === "down" && "text-rose-600 bg-rose-500/10 dark:text-rose-400",
                trend.direction === "neutral" && "text-slate-600 bg-slate-500/10 dark:text-slate-400"
              )}
            >
              {trend.direction === "up" && <IconArrowUpRight className="w-3 h-3 mr-1" />}
              {trend.direction === "down" && <IconArrowDownRight className="w-3 h-3 mr-1" />}
              {trend.direction === "neutral" && <IconMinus className="w-3 h-3 mr-1" />}
              {trend.value}%
            </span>
          )}
          {description && (
            <span className="text-muted-foreground truncate" title={description}>
              {description}
            </span>
          )}
        </div>
      )}
    </GlassCard>
  );
}
