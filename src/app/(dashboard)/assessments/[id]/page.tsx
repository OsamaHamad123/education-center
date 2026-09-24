import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Printer } from "lucide-react";
import { getScoreSheet, ScoreSheetScreen } from "@/modules/assessments";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/date-display";
import { formatScore } from "@/shared/lib/score";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.assessments.title };

/** One paper's sheet of marks. A forged or foreign id is a 404, never a 403. */
export default async function ScoreSheetPage({ params }: { params: Promise<{ id: string }> }) {
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
              <Link href={`/print/assessments/${assessment.id}`} target="_blank">
                <Printer className="size-4" aria-hidden />
                {ar.print.print}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/assessments">
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
