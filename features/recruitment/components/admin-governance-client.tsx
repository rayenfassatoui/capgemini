"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconDownload,
  IconEye,
  IconFilter,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportGovernanceAuditCsvAction } from "@/features/recruitment/actions";
import { GOVERNANCE_AUDIT_STATUSES } from "@/features/recruitment/types";
import { formatUtcDateTime as formatDateTime } from "@/lib/utils";
import type {
  GovernanceAuditFilters,
  GovernanceAuditReport,
  GovernanceAuditRow,
} from "@/features/recruitment/services/governance-types";

interface AdminGovernanceClientProps {
  report: GovernanceAuditReport;
}

const KIND_LABELS: Record<GovernanceAuditRow["kind"], string> = {
  activity_log: "Activity",
  agent_action: "AI action",
  stage_transition: "Stage transition",
};


function emptyToAll(value: string | undefined): string {
  return value && value.length > 0 ? value : "all";
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "failed" || status === "expired" || status === "cancelled") {
    return "destructive";
  }

  if (status === "executed" || status === "recorded" || status === "logged") {
    return "default";
  }

  if (status === "pending") {
    return "secondary";
  }

  return "outline";
}

function kindVariant(kind: GovernanceAuditRow["kind"]): "default" | "secondary" | "outline" {
  if (kind === "agent_action") return "secondary";
  if (kind === "stage_transition") return "default";
  return "outline";
}

function buildGovernanceUrl(filters: GovernanceAuditFilters): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || value === "all") {
      continue;
    }

    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `/admin/governance?${query}` : "/admin/governance";
}

function downloadCsv(csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `governance-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function AuditDetail({ row }: { row: GovernanceAuditRow }) {
  return (
    <dl className="flex flex-col gap-3">
      <DetailBlock label="Actor">
        {row.actorName ? (
          <div className="flex flex-col gap-0.5">
            <span>{row.actorName}</span>
            {row.actorEmail && (
              <span className="text-xs text-muted-foreground">{row.actorEmail}</span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">System workflow</span>
        )}
      </DetailBlock>

      <DetailBlock label="Candidate">
        {row.candidateName ? (
          <div className="flex flex-col gap-0.5">
            <span>{row.candidateName}</span>
            {row.candidateEmail && (
              <span className="text-xs text-muted-foreground">{row.candidateEmail}</span>
            )}
            {row.candidateId && (
              <code className="break-all text-xs text-muted-foreground">{row.candidateId}</code>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">No candidate attached</span>
        )}
      </DetailBlock>

      <DetailBlock label="Timestamp">
        <time dateTime={row.occurredAtIso}>{formatDateTime(row.occurredAtIso)}</time>
      </DetailBlock>

      {row.detail.type === "stage_transition" && (
        <>
          <DetailBlock label="Transition">
            {row.detail.previousStage ?? "Pipeline created"} → {row.detail.newStage}
          </DetailBlock>
          <DetailBlock label="Reason">
            {row.detail.reason || <span className="text-muted-foreground">No reason recorded</span>}
          </DetailBlock>
        </>
      )}

      {row.detail.type === "agent_action" && (
        <>
          <DetailBlock label="Tool">
            <code className="break-all text-xs">{row.detail.toolName}</code>
          </DetailBlock>
          <DetailBlock label="Confirmation lifecycle">
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>Expires: {formatDateTime(row.detail.expiresAtIso)}</span>
              {row.detail.confirmedAtIso && <span>Confirmed: {formatDateTime(row.detail.confirmedAtIso)}</span>}
              {row.detail.cancelledAtIso && <span>Cancelled: {formatDateTime(row.detail.cancelledAtIso)}</span>}
              {row.detail.executedAtIso && <span>Executed: {formatDateTime(row.detail.executedAtIso)}</span>}
            </div>
          </DetailBlock>
          <DetailBlock label="Sanitized args">
            <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs text-muted-foreground">
              {JSON.stringify(row.detail.args, null, 2)}
            </pre>
          </DetailBlock>
          {row.detail.error && (
            <DetailBlock label="Execution error">
              <span className="text-destructive">{row.detail.error}</span>
            </DetailBlock>
          )}
        </>
      )}

      {row.detail.type === "activity_log" && (
        <>
          <DetailBlock label="Entity">
            <div className="flex flex-col gap-0.5">
              <span>{row.detail.entityType}</span>
              {row.detail.entityId && (
                <code className="break-all text-xs text-muted-foreground">{row.detail.entityId}</code>
              )}
            </div>
          </DetailBlock>
          <DetailBlock label="Details">
            {row.detail.details || <span className="text-muted-foreground">No details recorded</span>}
          </DetailBlock>
        </>
      )}
    </dl>
  );
}

export function AdminGovernanceClient({ report }: AdminGovernanceClientProps) {
  const router = useRouter();
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const [selectedRow, setSelectedRow] = useState<GovernanceAuditRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [filters, setFilters] = useState({
    from: report.filters.from ?? "",
    to: report.filters.to ?? "",
    actorId: emptyToAll(report.filters.actorId),
    candidateId: emptyToAll(report.filters.candidateId),
    action: report.filters.action ?? "",
    status: emptyToAll(report.filters.status),
    limit: String(report.filters.limit),
  });

  const activeFilterCount = useMemo(() => {
    return [
      filters.from,
      filters.to,
      filters.action,
      filters.actorId !== "all" ? filters.actorId : "",
      filters.candidateId !== "all" ? filters.candidateId : "",
      filters.status !== "all" ? filters.status : "",
    ].filter(Boolean).length;
  }, [filters]);

  const applyFilters = () => {
    startTransition(() => {
      router.push(
        buildGovernanceUrl({
          from: filters.from || undefined,
          to: filters.to || undefined,
          actorId: filters.actorId === "all" ? undefined : filters.actorId,
          candidateId: filters.candidateId === "all" ? undefined : filters.candidateId,
          action: filters.action || undefined,
          status: filters.status === "all" ? undefined : (filters.status as GovernanceAuditFilters["status"]),
          limit: Number(filters.limit) || 200,
        }),
      );
    });
  };

  const resetFilters = () => {
    startTransition(() => {
      router.push("/admin/governance");
    });
  };

  const exportCsv = async () => {
    try {
      setIsExporting(true);
      const csv = await exportGovernanceAuditCsvAction(report.filters);
      downloadCsv(csv);
      toast.success("Governance audit CSV exported");
    } catch {
      toast.error("Failed to export governance audit CSV");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Rows</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{report.stats.totalRows}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Stage changes</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{report.stats.stageTransitions}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">AI actions</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{report.stats.agentActions}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Activity rows</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{report.stats.activityLogs}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending AI</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{report.stats.pendingAgentActions}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Failed AI</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{report.stats.failedAgentActions}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconFilter aria-hidden="true" />
                Governance filters
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Filter by date, actor, candidate, action/tool, or lifecycle status.
              </p>
            </div>
            <Badge variant="outline" className="w-fit rounded-full">
              {activeFilterCount} active
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Field>
              <FieldLabel htmlFor="governance-from">From</FieldLabel>
              <Input
                id="governance-from"
                type="date"
                value={filters.from}
                onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="governance-to">To</FieldLabel>
              <Input
                id="governance-to"
                type="date"
                value={filters.to}
                onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Actor</FieldLabel>
              <Select
                value={filters.actorId}
                onValueChange={(value) => setFilters((current) => ({ ...current, actorId: value ?? "all" }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All actors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All actors</SelectItem>
                    {report.options.actors.map((actor) => (
                      <SelectItem key={actor.id} value={actor.id}>
                        {actor.name} ({actor.role})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Candidate</FieldLabel>
              <Select
                value={filters.candidateId}
                onValueChange={(value) => setFilters((current) => ({ ...current, candidateId: value ?? "all" }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All candidates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All candidates</SelectItem>
                    {report.options.candidates.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.fullName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="governance-action">Action / tool</FieldLabel>
              <Input
                id="governance-action"
                value={filters.action}
                placeholder="update, delete, tool name..."
                onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters((current) => ({ ...current, status: value ?? "all" }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All statuses</SelectItem>
                    {GOVERNANCE_AUDIT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button onClick={applyFilters} disabled={isPending}>
                <IconShieldCheck data-icon="inline-start" aria-hidden="true" />
                {isPending ? "Applying..." : "Apply filters"}
              </Button>
              <Button variant="outline" onClick={resetFilters} disabled={isPending}>
                <IconRefresh data-icon="inline-start" aria-hidden="true" />
                Reset
              </Button>
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={isExporting || report.rows.length === 0}>
              <IconDownload data-icon="inline-start" aria-hidden="true" />
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit evidence ({report.rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
              <IconShieldCheck aria-hidden="true" />
              <p className="text-sm">No governance audit rows match the current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Action / tool</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={`${row.kind}-${row.id}`}>
                      <TableCell>
                        <Badge variant={kindVariant(row.kind)}>{KIND_LABELS[row.kind]}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[260px] flex-col gap-1">
                          <span className="truncate text-sm font-medium">{row.action}</span>
                          <span className="truncate text-xs text-muted-foreground">{row.source}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[260px] flex-col gap-1">
                          <span className="truncate text-sm">{row.candidateName ?? row.summary}</span>
                          {row.candidateEmail && (
                            <span className="truncate text-xs text-muted-foreground">{row.candidateEmail}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[220px] flex-col gap-1">
                          <span className="truncate text-sm">{row.actorName ?? "System"}</span>
                          {row.actorEmail && (
                            <span className="truncate text-xs text-muted-foreground">{row.actorEmail}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(row.occurredAtIso)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="icon-sm" onClick={() => setSelectedRow(row)}>
                          <IconEye aria-hidden="true" />
                          <span className="sr-only">Open audit details</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <SheetContent
          ref={sheetContentRef}
          initialFocus={sheetContentRef}
          className="w-full sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>Governance audit detail</SheetTitle>
            <SheetDescription>
              Sanitized evidence for the selected governance event.
            </SheetDescription>
          </SheetHeader>
          {selectedRow && (
            <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
              <div className="flex flex-col gap-4 pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={kindVariant(selectedRow.kind)}>{KIND_LABELS[selectedRow.kind]}</Badge>
                  <Badge variant={statusVariant(selectedRow.status)}>{selectedRow.status}</Badge>
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold tracking-tight">{selectedRow.action}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{selectedRow.summary}</p>
                </div>
                <AuditDetail row={selectedRow} />
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
