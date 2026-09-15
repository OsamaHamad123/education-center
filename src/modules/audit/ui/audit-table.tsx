"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ar } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { AuditPage } from "../application/queries/list-audit-logs";

/**
 * Server-paged, so this renders rows rather than owning a table instance. The audit
 * log is append-only and grows forever; loading it all into the browser to sort it
 * would stop working within a term.
 */
export function AuditTable({ page }: { page: AuditPage }) {
  const params = useSearchParams();
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));

  if (page.rows.length === 0) {
    return <EmptyState title={ar.audit.empty} description={ar.audit.emptyHint} />;
  }

  function href(targetPage: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(targetPage));
    return `/audit?${next.toString()}`;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2 md:hidden">
        {page.rows.map((row) => (
          <li key={row.id}>
            <Card>
              <CardContent className="space-y-1 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary">{ar.audit.actions[row.action]}</Badge>
                  <time className="text-muted-foreground text-xs" dir="ltr">
                    {formatMoment(row.createdAt)}
                  </time>
                </div>
                <p className="font-mono text-xs">{row.entity}</p>
                <p className="text-muted-foreground text-sm">
                  {row.userName ?? ar.audit.systemUser}
                  {row.branchName ? ` · ${row.branchName}` : ""}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ar.audit.when}</TableHead>
              <TableHead>{ar.audit.action}</TableHead>
              <TableHead>{ar.audit.entity}</TableHead>
              <TableHead>{ar.audit.who}</TableHead>
              <TableHead>{ar.users.branch}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <time dir="ltr" className="text-sm">
                    {formatMoment(row.createdAt)}
                  </time>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{ar.audit.actions[row.action]}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.entity}</TableCell>
                <TableCell>{row.userName ?? ar.audit.systemUser}</TableCell>
                <TableCell>{row.branchName ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {ar.audit.total}: {page.total} · {page.page} / {lastPage}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild disabled={page.page <= 1}>
            <Link href={href(Math.max(1, page.page - 1))}>{ar.common.previous}</Link>
          </Button>
          <Button variant="outline" size="sm" asChild disabled={page.page >= lastPage}>
            <Link href={href(Math.min(lastPage, page.page + 1))}>{ar.common.next}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** `dd/MM/yyyy HH:mm` in Cairo — the log is read by people sitting in Cairo. */
function formatMoment(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}
