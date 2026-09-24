"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Eye, EyeOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/date-display";
import { formatScore } from "@/shared/lib/score";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import type { AssessmentList, AssessmentListRow } from "../application/queries/get-assessments";
import { archiveAssessment, publishAssessment } from "../application/use-cases/manage-assessment";
import { AssessmentDialog } from "./assessment-dialog";

/**
 * Every assessment in the range, and what has happened to each (`drizzle/0021`).
 *
 * Two facts per row carry the screen: **how much of the class is marked**, and
 * **whether parents can see it**. Those are the only two questions anybody opens this
 * list to answer, and the second is the one with consequences outside the building.
 */
export function AssessmentsTable({ list, basePath }: { list: AssessmentList; basePath: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AssessmentDialog
          list={list}
          trigger={
            <Button>
              <Plus className="size-4" aria-hidden />
              {ar.assessments.create}
            </Button>
          }
        />
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={ar.assessments.empty} description={ar.assessments.emptyHint} />
      ) : (
        <ul className="space-y-2">
          {list.rows.map((row) => (
            <li key={row.id}>
              <Row row={row} list={list} basePath={basePath} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ row, list, basePath }: { row: AssessmentListRow; list: AssessmentList; basePath: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 pt-4">
        <div className="min-w-0 flex-1">
          <Link href={`${basePath}/${row.id}`} className="font-medium hover:underline">
            {row.name}
          </Link>
          <p className="text-muted-foreground text-sm">
            {row.className} · {row.subjectName} · {ar.assessments.kinds[row.kind]}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatDisplayDate(row.assessedOn)} · {ar.assessments.outOf}{" "}
            <span dir="ltr">{formatScore(row.maxScoreHundredths)}</span> · {row.teacherName}
          </p>
        </div>

        <Badge variant={row.markedCount > 0 ? "secondary" : "outline"} dir="ltr">
          {row.markedCount > 0 ? `${row.markedCount} ${ar.assessments.marked}` : ar.assessments.unmarked}
        </Badge>

        {/* The consequential one: whether this has left the building. */}
        <Badge variant={row.state === "published" ? "default" : "outline"}>
          {row.state === "published" ? ar.assessments.publishedBadge : ar.assessments.draftBadge}
        </Badge>

        {list.canPublish ? (
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`${row.state === "published" ? ar.assessments.unpublish : ar.assessments.publish} — ${row.name}`}
              >
                {row.state === "published" ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </Button>
            }
            title={row.state === "published" ? ar.assessments.unpublishTitle : ar.assessments.publishTitle}
            description={
              row.state === "published"
                ? ar.assessments.unpublishDescription
                : ar.assessments.publishDescription
            }
            confirmLabel={row.state === "published" ? ar.assessments.unpublish : ar.assessments.publish}
            successMessage={row.state === "published" ? ar.assessments.unpublished : ar.assessments.published}
            onConfirm={async () => {
              setBusy(true);
              const result = await publishAssessment({
                assessmentId: row.id,
                publish: row.state !== "published",
              });
              setBusy(false);
              if (result.ok) router.refresh();
              return result;
            }}
          />
        ) : null}

        {list.canManage ? (
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                disabled={busy}
                aria-label={`${ar.assessments.archive} — ${row.name}`}
              >
                <Archive className="size-4" aria-hidden />
              </Button>
            }
            title={ar.assessments.archiveTitle}
            description={ar.assessments.archiveDescription}
            confirmLabel={ar.assessments.archive}
            successMessage={ar.assessments.archived}
            destructive
            onConfirm={async () => {
              const result = await archiveAssessment({ assessmentId: row.id });
              if (result.ok) {
                toast.success(ar.assessments.archived);
                router.refresh();
              }
              return result;
            }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
