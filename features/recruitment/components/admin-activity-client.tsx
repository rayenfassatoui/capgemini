"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconSearch, IconFilter, IconFileSpreadsheet, IconEye, IconActivity, IconAlertTriangle, IconBrain } from "@tabler/icons-react";
import { toast } from "sonner";
import { exportActivityLogExcelAction } from "@/features/recruitment/actions";
import { usePathname, useRouter } from "next/navigation";
import { formatUtcDateTime } from "@/lib/utils";
import { AdminAgentEvidencePanel } from "./admin-agent-evidence-panel";
import {
  buildActivityAdminEvidence,
  buildAdminAgentPrompt,
} from "./admin-agent-helpers";


interface ActivityEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  createdAt: Date | null;
  userName: string;
  userEmail: string;
  candidateStage: string | null;
}

interface AdminActivityClientProps {
  activityLog: ActivityEntry[];
  initialActivityId: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  update: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
  delete: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
  assign: "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400",
  stage_change: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
};

function getActionColor(action: string): string {
  const lower = action.toLowerCase();
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "bg-gray-500/10 text-gray-600 border-gray-500/20 dark:text-gray-400";
}

const STAGE_COLORS: Record<string, string> = {
  accepted: "bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
  interview: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
  hired: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
};

function getStageColor(stage: string | null): string {
  if (!stage) return "bg-gray-500/10 text-gray-600 border-gray-500/20 dark:text-gray-400";
  const lower = stage.toLowerCase();
  for (const [key, color] of Object.entries(STAGE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "bg-gray-500/10 text-gray-600 border-gray-500/20 dark:text-gray-400";
}

export function AdminActivityClient({
  activityLog,
  initialActivityId,
}: AdminActivityClientProps) {
  const [search, setSearch] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const [activityId, setActivityId] = useState<string | null>(initialActivityId);
  const [selectedActivity, setSelectedActivity] = useState<ActivityEntry | null>(null);
  const [entityFilter, setEntityFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const activityEvidence = buildActivityAdminEvidence(activityLog);
  const agentActions = [
    {
      label: "Summarize activity",
      description: "Produce a source-backed activity brief from loaded rows.",
      icon: IconActivity,
      prompt: buildAdminAgentPrompt({
        task: "Summarize system activity from the loaded admin audit rows. Separate observed events, inferred operational risks, and source limits.",
        summary: activityEvidence,
      }),
    },
    {
      label: "Flag audit risks",
      description: "Review destructive or narrow audit coverage patterns.",
      icon: IconAlertTriangle,
      prompt: buildAdminAgentPrompt({
        task: "Flag audit risks in the loaded activity log. Focus on destructive actions, actor concentration, missing before/after diffs, and incomplete telemetry.",
        summary: activityEvidence,
      }),
    },
    {
      label: "Next checks",
      description: "List safe follow-up checks for platform governance.",
      icon: IconBrain,
      prompt: buildAdminAgentPrompt({
        task: "Create the next governance checks from this activity log. Keep facts separate from inferred risks and avoid inventing unobserved records.",
        summary: activityEvidence,
      }),
    },
  ] as const;

  const updateActivityQuery = useCallback(
    (value: string | null) => {
      setActivityId(value);
      router.replace(value ? `${pathname}?activityId=${value}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!activityId) {
      setSelectedActivity(null);
      return;
    }

    const match = activityLog.find((entry) => entry.id === activityId);
    if (match) {
      setSelectedActivity((current) => (current?.id === match.id ? current : match));
    }
  }, [activityId, activityLog]);

  const handleOpenActivity = useCallback(
    (entry: ActivityEntry) => {
      setSelectedActivity(entry);
      if (activityId !== entry.id) {
        updateActivityQuery(entry.id);
      }
    },
    [activityId, updateActivityQuery],
  );

  const handleActivityDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSelectedActivity(null);
        if (activityId) {
          updateActivityQuery(null);
        }
      }
    },
    [activityId, updateActivityQuery],
  );



  const entityTypes = useMemo(() => {
    const types = new Set(activityLog.map((a) => a.entityType));
    return Array.from(types).sort();
  }, [activityLog]);

  const filtered = useMemo(() => {
    return activityLog.filter((entry) => {
      const matchesSearch =
        !search ||
        entry.userName.toLowerCase().includes(search.toLowerCase()) ||
        entry.action.toLowerCase().includes(search.toLowerCase()) ||
        entry.entityType.toLowerCase().includes(search.toLowerCase()) ||
        (entry.details?.toLowerCase().includes(search.toLowerCase()) ?? false);

      const matchesEntity =
        entityFilter === "all" || entry.entityType === entityFilter;

      return matchesSearch && matchesEntity;
    });
  }, [activityLog, search, entityFilter]);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const base64 = await exportActivityLogExcelAction();
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-log-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Activity log exported successfully");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to export activity log");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminAgentEvidencePanel summary={activityEvidence} actions={agentActions} />
      <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">All Activity ({filtered.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              onClick={handleExport}
              disabled={isExporting}
            >
              <IconFileSpreadsheet className="h-4 w-4" />
              {isExporting ? "Exporting..." : "Export Excel"}
            </Button>
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search activity..."
                className="h-9 w-[200px] pl-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={entityFilter} onValueChange={(v) => setEntityFilter(v ?? 'all')}>
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <IconFilter className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {entityTypes.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No activity entries found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">User</TableHead>
                  <TableHead className="w-[140px]">Action</TableHead>
                  <TableHead className="w-[100px]">Entity</TableHead>
                  <TableHead className="w-[120px]">Stage</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[160px] text-right">Timestamp</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{entry.userName}</span>
                        <span className="text-xs text-muted-foreground">{entry.userEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getActionColor(entry.action)}>
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize text-muted-foreground">
                        {entry.entityType}
                      </span>
                    </TableCell>
                    <TableCell>
                      {entry.candidateStage ? (
                        <Badge variant="outline" className={getStageColor(entry.candidateStage)}>
                          {entry.candidateStage}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground line-clamp-1">
                        {entry.details || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {entry.createdAt
                          ? formatUtcDateTime(entry.createdAt)
                          : "Unknown"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleOpenActivity(entry)}
                      >
                        <IconEye className="h-4 w-4" />
                        <span className="sr-only">Details</span>
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

      <Dialog open={!!selectedActivity} onOpenChange={handleActivityDialogChange}>
        <DialogContent>
          {selectedActivity && (
            <>
              <DialogHeader>
                <DialogTitle>Activity Details</DialogTitle>
                <DialogDescription>
                  Complete information about this activity log entry.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <span className="font-medium text-sm text-right">User</span>
                  <div className="col-span-3 flex flex-col">
                    <span className="text-sm font-medium">{selectedActivity.userName}</span>
                    <span className="text-xs text-muted-foreground">{selectedActivity.userEmail}</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <span className="font-medium text-sm text-right">Action</span>
                  <div className="col-span-3">
                    <Badge variant="outline" className={getActionColor(selectedActivity.action)}>
                      {selectedActivity.action}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <span className="font-medium text-sm text-right">Entity</span>
                  <div className="col-span-3 flex flex-col">
                    <span className="text-sm capitalize">{selectedActivity.entityType}</span>
                    {selectedActivity.entityId && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ID: {selectedActivity.entityId}
                      </span>
                    )}
                  </div>
                </div>
                {selectedActivity.candidateStage && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <span className="font-medium text-sm text-right">Stage</span>
                    <div className="col-span-3">
                      <Badge variant="outline" className={getStageColor(selectedActivity.candidateStage)}>
                        {selectedActivity.candidateStage}
                      </Badge>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-4">
                  <span className="font-medium text-sm text-right pt-1">Details</span>
                  <div className="col-span-3">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedActivity.details || "No additional details provided."}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <span className="font-medium text-sm text-right">Timestamp</span>
                  <div className="col-span-3">
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {selectedActivity.createdAt
                        ? formatUtcDateTime(selectedActivity.createdAt)
                        : "Unknown"}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
