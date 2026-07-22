"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

import { useTranslation } from "@/components/shared/i18n-provider";
import { AgentChatSurface } from "@/features/recruitment/components/chat/agent-chat-surface";
import { useStatisticsChatController } from "@/features/recruitment/components/chat/use-statistics-chat-controller";
import { parseAgentReferenceParam } from "@/features/recruitment/components/chat/agent-prompts";
import type { UserRole } from "@/features/recruitment/types";

interface AgentWorkspaceClientProps {
  role: UserRole;
  userName: string;
}

const ROLE_LABEL_KEYS: Record<UserRole, string> = {
  ta: "agent.roleTa",
  manager: "agent.roleManager",
  hr: "agent.roleHr",
  admin: "agent.roleAdmin",
};

export function AgentWorkspaceClient({
  role,
  userName,
}: AgentWorkspaceClientProps) {
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const prompt = searchParams.get("prompt")?.trim();
  const referenceParam = searchParams.get("reference");
  const reference = useMemo(
    () => parseAgentReferenceParam(referenceParam),
    [referenceParam],
  );
  const references = useMemo(() => (reference ? [reference] : []), [reference]);
  const chat = useStatisticsChatController({ enabled: true, references });
  const appliedPromptRef = useRef<string | null>(null);
  const roleLabel = t(ROLE_LABEL_KEYS[role] ?? ROLE_LABEL_KEYS.ta);
  const handoffKey = prompt
    ? `${prompt}:${reference?.type ?? "none"}:${reference?.id ?? "none"}`
    : null;

  useEffect(() => {
    if (!prompt || !handoffKey || appliedPromptRef.current === handoffKey) return;
    appliedPromptRef.current = handoffKey;
    chat.setInput(prompt);
  }, [chat, handoffKey, prompt]);

  return (
    <section className="mx-auto flex h-[calc(100dvh-10.75rem)] min-h-[30rem] w-full max-w-6xl flex-col gap-4 px-0 py-3 md:h-[calc(100dvh-11.5rem)] md:px-6 md:py-5">
      <header className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t("agent.eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground md:text-3xl">
            {t("agent.workspaceTitle")}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground md:text-right">
          {roleLabel} · {userName}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        <AgentChatSurface
          controller={chat}
          variant="workspace"
          contextLabel={`${roleLabel} · ${t("agent.workspaceSuffix")}`}
          className="h-full"
        />
      </div>
    </section>
  );
}
