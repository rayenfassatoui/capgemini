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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconSearch, IconFilter } from "@tabler/icons-react";

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
}

interface AdminActivityClientProps {
  activityLog: ActivityEntry[];
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

export function AdminActivityClient({ activityLog }: AdminActivityClientProps) {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");

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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">All Activity ({filtered.length})</CardTitle>
          <div className="flex items-center gap-2">
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
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[160px] text-right">Timestamp</TableHead>
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
                      <span className="text-sm text-muted-foreground line-clamp-1">
                        {entry.details || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {entry.createdAt
                          ? new Date(entry.createdAt).toLocaleString()
                          : "Unknown"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
