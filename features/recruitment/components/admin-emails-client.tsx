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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { IconSearch, IconMail, IconMailCheck, IconMailX, IconFileSpreadsheet, IconEye, IconAlertTriangle, IconBrain, IconReportAnalytics } from "@tabler/icons-react";
import type { EmailLogEntry } from "@/features/recruitment/services/admin";
import { exportEmailLogsExcelAction } from "@/features/recruitment/actions";
import { usePathname, useRouter } from "next/navigation";
import { AdminAgentEvidencePanel } from "./admin-agent-evidence-panel";
import {
  buildAdminAgentPrompt,
  buildEmailAdminEvidence,
} from "./admin-agent-helpers";

import { toast } from "sonner";

interface AdminEmailsClientProps {
  emails: EmailLogEntry[];
  initialEmailId: string | null;
}

const STATUS_STYLES: Record<string, { className: string; icon: typeof IconMail }> = {
  sent: {
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
    icon: IconMailCheck,
  },
  failed: {
    className: "bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400",
    icon: IconMailX,
  },
};

const getStageBadgeColor = (stage: string | null) => {
  if (!stage) return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300";
  const s = stage.toLowerCase();
  if (s.includes("hired")) return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (s.includes("offer")) return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400";
  if (s.includes("interview")) return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400";
  if (s.includes("rejected")) return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400";
  return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300";
};

export function AdminEmailsClient({
  emails,
  initialEmailId,
}: AdminEmailsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [emailId, setEmailId] = useState<string | null>(initialEmailId);
  const [search, setSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<EmailLogEntry | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const emailEvidence = buildEmailAdminEvidence(emails);
  const agentActions = [
    {
      label: "Delivery risks",
      description: "Review failed, unlinked, and stage-less communication rows.",
      icon: IconAlertTriangle,
      prompt: buildAdminAgentPrompt({
        task: "Review email and notification delivery risks. Separate logged delivery facts from inferred risks and call out missing provider/notification evidence.",
        summary: emailEvidence,
      }),
    },
    {
      label: "Summarize communications",
      description: "Create a concise admin communication audit brief.",
      icon: IconReportAnalytics,
      prompt: buildAdminAgentPrompt({
        task: "Summarize recruitment communication logs for an admin. Include sent versus failed counts, unlinked rows, missing evidence, and recommended checks.",
        summary: emailEvidence,
      }),
    },
    {
      label: "Source limits",
      description: "Identify what cannot be proven from email logs alone.",
      icon: IconBrain,
      prompt: buildAdminAgentPrompt({
        task: "Explain the source limits of the email log table. Identify what cannot be inferred about notification delivery, bounce handling, retries, or candidate receipt.",
        summary: emailEvidence,
      }),
    },
  ] as const;

  const updateEmailQuery = useCallback(
    (value: string | null) => {
      setEmailId(value);
      router.replace(value ? `${pathname}?emailId=${value}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!emailId) {
      setSelectedEmail(null);
      return;
    }

    const match = emails.find((email) => email.id === emailId);
    if (match) {
      setSelectedEmail((current) => (current?.id === match.id ? current : match));
    }
  }, [emailId, emails]);

  const handleOpenEmail = useCallback(
    (email: EmailLogEntry) => {
      setSelectedEmail(email);
      if (emailId !== email.id) {
        updateEmailQuery(email.id);
      }
    },
    [emailId, updateEmailQuery],
  );

  const handleEmailDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSelectedEmail(null);
        if (emailId) {
          updateEmailQuery(null);
        }
      }
    },
    [emailId, updateEmailQuery],
  );



  const filtered = useMemo(() => {
    if (!search) return emails;
    const lower = search.toLowerCase();
    return emails.filter(
      (e) =>
        e.toEmail.toLowerCase().includes(lower) ||
        (e.toName?.toLowerCase().includes(lower) ?? false) ||
        e.subject.toLowerCase().includes(lower) ||
        e.sentByName.toLowerCase().includes(lower)
    );
  }, [emails, search]);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const base64 = await exportEmailLogsExcelAction();
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
      a.download = `email-logs-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Emails exported successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export emails");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminAgentEvidencePanel summary={emailEvidence} actions={agentActions} />
      <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">
            All Emails ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by recipient, subject, sender..."
                className="h-9 w-[280px] pl-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
              <IconFileSpreadsheet className="mr-2 h-4 w-4" />
              {isExporting ? "Exporting..." : "Export Excel"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <IconMail className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No emails found
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="w-[160px]">Sent By</TableHead>
                  <TableHead className="w-[90px]">Status</TableHead>
                  <TableHead className="w-[120px]">Stage</TableHead>
                  <TableHead className="w-[160px] text-right">Date</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((email) => {
                  const style = STATUS_STYLES[email.status] ?? STATUS_STYLES.sent;
                  return (
                    <TableRow key={email.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {email.toName || email.toEmail}
                          </span>
                          {email.toName && (
                            <span className="text-xs text-muted-foreground">
                              {email.toEmail}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm line-clamp-1">
                          {email.subject}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {email.sentByName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {email.sentByEmail}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={style.className}>
                          {email.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {email.candidateStage ? (
                          <Badge variant="secondary" className={getStageBadgeColor(email.candidateStage)}>
                            {email.candidateStage}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(email.createdAt).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleOpenEmail(email)}
                        >
                          <IconEye className="h-4 w-4" />
                          <span className="sr-only">Details</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!selectedEmail} onOpenChange={handleEmailDialogChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
            <DialogDescription>
              View full details of the sent email.
            </DialogDescription>
          </DialogHeader>

          {selectedEmail && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Recipient</h4>
                  <p className="text-sm">{selectedEmail.toName} &lt;{selectedEmail.toEmail}&gt;</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Sender</h4>
                  <p className="text-sm">{selectedEmail.sentByName} &lt;{selectedEmail.sentByEmail}&gt;</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Date</h4>
                  <p className="text-sm">{new Date(selectedEmail.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
                  <Badge variant="outline" className={STATUS_STYLES[selectedEmail.status]?.className}>
                    {selectedEmail.status}
                  </Badge>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Stage</h4>
                  <p className="text-sm">{selectedEmail.candidateStage || "-"}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Interview ID</h4>
                  <p className="text-sm font-mono">{selectedEmail.interviewId || "-"}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Subject</h4>
                <p className="text-sm font-medium">{selectedEmail.subject}</p>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Body</h4>
                <div className="h-[300px] w-full rounded-md border p-4 overflow-y-auto">
                  <div className="whitespace-pre-wrap text-sm">
                    {selectedEmail.body}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </Card>
      </div>
  );
}
