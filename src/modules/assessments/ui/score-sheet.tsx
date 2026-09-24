"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { formatScore, parseScore, scorePercent } from "@/shared/lib/score";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useAction } from "@/shared/ui/use-action";
import type { ScoreSheet } from "../application/queries/get-assessments";
import { saveScores } from "../application/use-cases/save-scores";

type Draft = { score: string; didNotSit: boolean };

/**
 * Entering a sheet of marks (`drizzle/0021`).
 *
 * The register's shape, deliberately: one row per student, thumb-sized controls, and a
 * single save at the end — a teacher marks forty papers at a desk and enters them in
 * one sitting, and a screen that saved on every keystroke would be a screen that loses
 * half of them on a bad connection.
 *
 * The one place it differs from the register is the default. An untouched field stays
 * EMPTY and that student is left unmarked; the register defaults everybody to present.
 * An exam has no equivalent of present, and a zero invented here is a result a parent
 * would read.
 */
export function ScoreSheetScreen({ sheet }: { sheet: ScoreSheet }) {
  const router = useRouter();
  const [isPending, startTransition] = useAction();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      sheet.students.map((student) => [
        student.studentId,
        {
          score: student.scoreHundredths === null ? "" : formatScore(student.scoreHundredths),
          didNotSit: student.didNotSit,
        },
      ]),
    ),
  );

  const max = sheet.assessment.maxScoreHundredths;

  function set(studentId: string, next: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [studentId]: { score: "", didNotSit: false, ...current[studentId], ...next },
    }));
  }

  function save() {
    // Only the rows that say something. An untouched student is not sent, so they stay
    // unmarked rather than being written as a zero.
    const scores = sheet.students
      .map((student) => ({ student, draft: drafts[student.studentId] }))
      .filter(({ draft }) => draft && (draft.didNotSit || draft.score.trim() !== ""))
      .map(({ student, draft }) => ({
        studentId: student.studentId,
        score: draft?.didNotSit ? "" : (draft?.score ?? ""),
        didNotSit: draft?.didNotSit ?? false,
        notes: null,
      }));

    if (scores.length === 0) {
      toast.error(ar.assessments.nothingToSave);
      return;
    }

    startTransition(async () => {
      const result = await saveScores({ assessmentId: sheet.assessment.id, scores });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(ar.assessments.saved(result.data.saved, result.data.unmarked));
      router.refresh();
    });
  }

  if (sheet.students.length === 0) {
    return <p className="text-muted-foreground text-sm">{ar.assessments.noStudents}</p>;
  }

  return (
    <div className="space-y-4 pb-24">
      <Summary sheet={sheet} />

      <ul className="space-y-2">
        {sheet.students.map((student) => {
          const draft = drafts[student.studentId] ?? { score: "", didNotSit: false };
          const parsed = draft.didNotSit ? null : parseScore(draft.score);
          // Shown live so a slip of 25 out of 20 is caught at the desk rather than by
          // the server after forty rows have been typed.
          const tooHigh = parsed !== null && parsed > max;

          return (
            <li key={student.studentId}>
              <Card className={tooHigh ? "border-destructive" : undefined}>
                <CardContent className="flex flex-wrap items-center gap-3 pt-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{student.fullName}</p>
                    <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                      {student.studentCode}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label htmlFor={`score-${student.studentId}`} className="sr-only">
                      {`${ar.assessments.score} — ${student.fullName}`}
                    </Label>
                    <Input
                      id={`score-${student.studentId}`}
                      value={draft.score}
                      onChange={(event) => set(student.studentId, { score: event.target.value })}
                      disabled={isPending || sheet.readOnly || draft.didNotSit}
                      inputMode="decimal"
                      dir="ltr"
                      className="w-20 text-center"
                      aria-invalid={tooHigh ? true : undefined}
                    />
                    <span className="text-muted-foreground text-sm" dir="ltr">
                      / {formatScore(max)}
                    </span>
                  </div>

                  {parsed !== null && !tooHigh ? (
                    <Badge variant="secondary" dir="ltr">
                      {scorePercent(parsed, max)}%
                    </Badge>
                  ) : null}

                  <Button
                    type="button"
                    size="sm"
                    variant={draft.didNotSit ? "destructive" : "outline"}
                    disabled={isPending || sheet.readOnly}
                    aria-pressed={draft.didNotSit}
                    onClick={() => set(student.studentId, { didNotSit: !draft.didNotSit, score: "" })}
                  >
                    {ar.assessments.didNotSit}
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {sheet.readOnly ? (
        <p role="status" className="bg-muted rounded-md p-3 text-sm">
          {ar.assessments.readOnlyHint}
        </p>
      ) : (
        // Fixed to the bottom, like the register's: a teacher scrolling forty names
        // should never have to scroll back up to save.
        <div className="bg-background/95 fixed inset-x-0 bottom-0 border-t p-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl justify-end">
            <Button onClick={save} disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              {ar.assessments.save}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The spread, for the person who just typed it.
 *
 * A row of eighty-percents with one four-percent in it is usually a typo rather than a
 * child, and this is where that shows. It is NOT what a parent sees — the centre chose
 * on 2026-09-24 that the portal shows a child's own mark and no comparison.
 */
function Summary({ sheet }: { sheet: ScoreSheet }) {
  const { summary } = sheet;
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm">
        <Figure
          label={ar.assessments.marked}
          value={ar.assessments.markedOf(summary.marked, summary.total)}
        />
        <Figure label={ar.assessments.sat} value={String(summary.sat)} />
        {summary.didNotSit > 0 ? (
          <Figure label={ar.assessments.didNotSitShort} value={String(summary.didNotSit)} />
        ) : null}
        {summary.averagePercent !== null ? (
          <>
            <Figure label={ar.assessments.average} value={`${summary.averagePercent}%`} />
            <Figure label={ar.assessments.highest} value={`${summary.highestPercent}%`} />
            <Figure label={ar.assessments.lowest} value={`${summary.lowestPercent}%`} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-bold" dir="ltr">
        {value}
      </span>
    </span>
  );
}
