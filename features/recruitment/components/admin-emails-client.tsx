"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconSearch, IconMail, IconMailCheck, IconMailX } from "@tabler/icons-react";
import type { EmailLogEntry } from "@/features/recruitment/services/admin";

interface AdminEmailsClientProps {
  emails: EmailLogEntry[];
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

export function AdminEmailsClient({ emails }: AdminEmailsClientProps) {
  const [search, setSearch] = useState("");

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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">
            All Emails ({filtered.length})
          </CardTitle>
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by recipient, subject, sender..."
              className="h-9 w-[280px] pl-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                  <TableHead className="w-[160px] text-right">Date</TableHead>
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
                      <TableCell className="text-right">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(email.createdAt).toLocaleString()}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
