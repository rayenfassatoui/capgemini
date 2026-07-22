"use client";

import { useEffect } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/components/shared/i18n-provider";

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: AppErrorProps) {
  const { t } = useTranslation();
  useEffect(() => {
    console.error("[app-error-boundary]", error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-12 text-foreground"
    >
      <section
        aria-labelledby="error-title"
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
      >
        <div className="flex size-11 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300">
          <IconAlertTriangle className="size-5" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t("agent.temporaryInterruption")}
        </p>
        <h1 id="error-title" className="mt-2 text-2xl font-semibold tracking-tight">
          {t("agent.workspaceLoadErrorTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("agent.workspaceLoadErrorDescription")}
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            {t("agent.errorReference")}: {error.digest}
          </p>
        ) : null}
        <Button type="button" size="lg" onClick={reset} className="mt-6 min-h-11 px-5">
          <IconRefresh className="size-4" />
          {t("agent.retryWorkspace")}
        </Button>
      </section>
    </main>
  );
}
