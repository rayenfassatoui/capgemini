"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  IconInfoCircle,
  IconDatabase,
  IconShield,
  IconMail,
  IconBrandOpenai,
} from "@tabler/icons-react";

interface SettingSection {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Array<{
    label: string;
    value: string;
    status?: "active" | "configured" | "not_configured";
  }>;
}

const SECTIONS: SettingSection[] = [
  {
    title: "Platform Information",
    description: "Current system configuration and version details",
    icon: IconInfoCircle,
    items: [
      { label: "Framework", value: "Next.js 16 (App Router)", status: "active" },
      { label: "Database", value: "PostgreSQL (Neon)", status: "active" },
      { label: "ORM", value: "Drizzle ORM", status: "active" },
      { label: "Package Manager", value: "Bun", status: "active" },
    ],
  },
  {
    title: "Authentication",
    description: "Authentication provider and security configuration",
    icon: IconShield,
    items: [
      { label: "Provider", value: "Better Auth", status: "active" },
      { label: "Session Strategy", value: "Database Sessions", status: "configured" },
      { label: "Role-Based Access", value: "4 Roles (TA, Manager, HR, Admin)", status: "configured" },
    ],
  },
  {
    title: "AI Configuration",
    description: "AI model and provider settings for screening and analysis",
    icon: IconBrandOpenai,
    items: [
      { label: "Provider", value: "OpenRouter", status: "active" },
      { label: "Model", value: "stepfun/step-3.5-flash:free", status: "configured" },
      { label: "Features", value: "CV Screening, Interview Guides, Statistics Chat", status: "active" },
    ],
  },
  {
    title: "Email Service",
    description: "Email notification and interview invitation configuration",
    icon: IconMail,
    items: [
      { label: "Provider", value: "Gmail SMTP (Nodemailer)", status: "configured" },
      { label: "Interview Invitations", value: "Enabled", status: "active" },
      { label: "HR Decision Emails", value: "Enabled", status: "active" },
    ],
  },
  {
    title: "Data Storage",
    description: "Database and file storage configuration",
    icon: IconDatabase,
    items: [
      { label: "Database Host", value: "Neon (Serverless PostgreSQL)", status: "active" },
      { label: "CV Storage", value: "Database (Base64)", status: "configured" },
      { label: "Activity Logging", value: "Enabled", status: "active" },
    ],
  },
];

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  configured: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
  not_configured: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
};

export function AdminSettingsClient() {
  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        return (
          <Card key={section.title}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
                  <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {section.items.map((item, idx) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.value}</span>
                        {item.status && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] capitalize ${STATUS_STYLES[item.status] ?? ""}`}
                          >
                            {item.status.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {idx < section.items.length - 1 && (
                      <Separator className="mt-1" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
