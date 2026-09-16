"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ar } from "@/shared/i18n/ar";
import { formatPhoneForDisplay } from "@/shared/lib/phone";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { StudentsPage } from "../application/queries/list-students";

/**
 * Server-paged: a center has thousands of students, so the browser never receives the
 * whole register. Filters and the page number live in the URL.
 */
export function StudentsTable({
  page,
  viewerBranchId,
}: {
  page: StudentsPage;
  viewerBranchId: string | null;
}) {
  const params = useSearchParams();
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize));

  if (page.rows.length === 0) {
    return (
      <EmptyState
        title={page.status === "archived" ? ar.students.emptyArchive : ar.students.empty}
        description={page.status === "archived" ? undefined : ar.students.emptyHint}
      />
    );
  }

  function href(targetPage: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(targetPage));
    return `?${next.toString()}`;
  }

  /** A student whose current branch is not the viewer's has transferred out. */
  const isTransferredOut = (branchId: string) => viewerBranchId !== null && branchId !== viewerBranchId;

  /*
   * The branch column carried the same value on every row for a branch admin, who has
   * exactly one branch (docs/PRODUCT-REVIEW-2026-09.md). It exists for the transferred-out
   * case, so it appears only when there is something to tell apart: a super admin looking
   * across branches, or a list that actually contains someone else's student.
   */
  const showBranch = viewerBranchId === null || page.rows.some((row) => isTransferredOut(row.branchId));

  return (
    <div className="space-y-3">
      <ul className="space-y-2 md:hidden">
        {page.rows.map((row) => (
          <li key={row.id}>
            <Card>
              <CardContent className="space-y-1 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/students/${row.id}`} className="font-medium hover:underline">
                    {row.fullName}
                  </Link>
                  <span className="text-muted-foreground font-mono text-xs" dir="ltr">
                    {row.studentCode}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {row.className}
                  {showBranch ? ` · ${row.branchName}` : ""}
                </p>
                <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                  {formatPhoneForDisplay(row.parentPhone)}
                </p>
                {isTransferredOut(row.branchId) ? (
                  <Badge variant="outline">{ar.students.transferredOutBadge}</Badge>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ar.students.code}</TableHead>
              <TableHead>{ar.students.fullName}</TableHead>
              <TableHead>{ar.students.class}</TableHead>
              {showBranch ? <TableHead>{ar.students.branch}</TableHead> : null}
              <TableHead>{ar.students.parentPhone}</TableHead>
              <TableHead>{ar.students.joinDate}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs" dir="ltr">
                  {row.studentCode}
                </TableCell>
                <TableCell>
                  <Link href={`/students/${row.id}`} className="font-medium hover:underline">
                    {row.fullName}
                  </Link>
                  {isTransferredOut(row.branchId) ? (
                    <Badge variant="outline" className="ms-2">
                      {ar.students.transferredOutBadge}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{row.className}</TableCell>
                {showBranch ? <TableCell>{row.branchName}</TableCell> : null}
                <TableCell className="font-mono text-xs" dir="ltr">
                  {formatPhoneForDisplay(row.parentPhone)}
                </TableCell>
                <TableCell>{formatDisplayDate(row.joinDate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {/*
            The total moved to the page title, where it is asked — it used to be here,
            below twenty-five rows (docs/PRODUCT-REVIEW-2026-09.md). What is left is the
            position, which is the thing this line is actually for.
          */}
          {page.page} / {lastPage}
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
