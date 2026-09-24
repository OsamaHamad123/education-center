import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getScoreSheet, ScoreSheetScreen } from "@/modules/assessments";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/date-display";
import { formatScore } from "@/shared/lib/score";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.assessments.title };

/**
 * A teacher entering their own marks.
 *
 * Another teacher's paper is invisible to `assessments_select`, so this is a 404 for
 * them — and `getScoreSheet` marks the sheet read-only for anything a teacher may read
 * but not write, which is the belt to the database's braces.
 *
 * No print button: the marks sheet carries every child in the class and printing is
 * the office's act, the same call `consistency.spec.ts` made about the payroll sheet.
 */
export default async function TeacherScoreSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sheet = await getScoreSheet(id);
  if (!sheet.ok) notFound();

  const { assessment, state } = sheet.data;

  return (
    <>
      <PageHeader
        title={assessment.name}
        description={`${assessment.className} · ${assessment.subjectName} · ${formatDisplayDate(assessment.assessedOn)} · ${ar.assessments.outOf} ${formatScore(assessment.maxScoreHundredths)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={state === "published" ? "default" : "outline"}>
              {state === "published" ? ar.assessments.publishedBadge : ar.assessments.draftBadge}
            </Badge>
            <Button asChild variant="outline">
              <Link href="/teacher/assessments">
                <ArrowRight className="size-4" aria-hidden />
                {ar.assessments.title}
              </Link>
            </Button>
          </div>
        }
      />
      <ScoreSheetScreen sheet={sheet.data} />
    </>
  );
}
