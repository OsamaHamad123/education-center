"use client";

import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { ar, weekdayName } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import { formatDisplayDate, WEEK_DISPLAY_ORDER } from "@/shared/lib/time";
import type { AppError } from "@/shared/lib/result";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { lookupStudent, type LookupResult } from "../application/use-cases/lookup-student";

/**
 * The public lookup (PROJECT_PLAN 10.8), built for a parent on a phone.
 *
 * The result is held in component state and rendered into the same response — there
 * is deliberately no URL carrying the student's code. A shareable link would end up
 * in browser history, in a referrer header, and in whatever proxy sits between the
 * parent and the centre.
 */
export function LookupForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const response = await lookupStudent({
        studentCode: readText(data, "studentCode"),
        lastFour: readText(data, "lastFour"),
      });

      if (!response.ok) {
        setResult(null);
        setError(response.error);
        return;
      }

      setResult(response.data);
    });
  }

  if (result) {
    return <LookupResultView result={result} onReset={() => setResult(null)} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar.lookup.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="studentCode">{ar.lookup.studentCode}</Label>
            <Input
              id="studentCode"
              name="studentCode"
              dir="ltr"
              className="text-start"
              placeholder="NSR-26-00001"
              autoComplete="off"
              maxLength={40}
              required
              disabled={isPending}
            />
            <p className="text-muted-foreground text-xs">{ar.lookup.studentCodeHint}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastFour">{ar.lookup.lastFour}</Label>
            <Input
              id="lastFour"
              name="lastFour"
              dir="ltr"
              className="text-start"
              inputMode="numeric"
              placeholder="0000"
              autoComplete="off"
              maxLength={10}
              required
              disabled={isPending}
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error.message}
            </p>
          ) : null}

          <Button type="submit" className="h-12 w-full text-base" disabled={isPending}>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Search className="size-4" aria-hidden />
            )}
            {isPending ? ar.lookup.searching : ar.lookup.submit}
          </Button>

          <p className="text-muted-foreground text-xs">{ar.lookup.privacyNote}</p>
        </form>
      </CardContent>
    </Card>
  );
}

function LookupResultView({ result, onReset }: { result: LookupResult; onReset: () => void }) {
  const byDay = new Map<number, LookupResult["timetable"]>();
  for (const slot of result.timetable) {
    byDay.set(slot.dayOfWeek, [...(byDay.get(slot.dayOfWeek) ?? []), slot]);
  }
  const days = WEEK_DISPLAY_ORDER.filter((day) => (byDay.get(day)?.length ?? 0) > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 pt-6">
          <h2 className="text-xl font-bold">{result.displayName}</h2>
          <p className="text-muted-foreground text-sm">
            {result.branchName} · {result.className}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <RateCard title={ar.lookup.thisMonth} stats={result.month} />
        <RateCard title={ar.lookup.thisTerm} stats={result.term} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ar.lookup.timetable}</CardTitle>
        </CardHeader>
        <CardContent>
          {days.length === 0 ? (
            <p className="text-muted-foreground text-sm">{ar.lookup.noTimetable}</p>
          ) : (
            <div className="space-y-3">
              {days.map((day) => (
                <div key={day}>
                  <p className="font-medium">{weekdayName(day)}</p>
                  <ul className="divide-y text-sm">
                    {(byDay.get(day) ?? []).map((slot) => (
                      <li key={slot.periodNumber} className="flex items-center gap-3 py-1.5">
                        <span className="text-muted-foreground w-24 shrink-0 font-mono text-xs" dir="ltr">
                          {slot.startTime} – {slot.endTime}
                        </span>
                        <span className="min-w-0 truncate">{slot.subjectName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ar.lookup.absencesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {result.absences.length === 0 ? (
            <p className="text-muted-foreground text-sm">{ar.lookup.noAbsences}</p>
          ) : (
            <ul className="divide-y text-sm">
              {result.absences.map((absence, index) => (
                <li key={`${absence.date}-${index}`} className="flex items-center gap-2 py-2">
                  <span className="text-muted-foreground w-28 shrink-0 text-xs">
                    {formatDisplayDate(absence.date)}
                  </span>
                  <Badge variant={absence.status === "absent" ? "destructive" : "outline"}>
                    {ar.attendanceStatus[absence.status]}
                  </Badge>
                  <span className="min-w-0 truncate">{absence.subjectName}</span>
                  {absence.notes ? (
                    <span className="text-muted-foreground min-w-0 truncate text-xs">{absence.notes}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full" onClick={onReset}>
        {ar.lookup.again}
      </Button>
      <p className="text-muted-foreground text-xs">{ar.lookup.privacyNote}</p>
    </div>
  );
}

function RateCard({
  title,
  stats,
}: {
  title: string;
  stats: { present: number; absent: number; late: number; excused: number; attendancePercent: number };
}) {
  const recorded = stats.present + stats.absent + stats.late + stats.excused;

  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-muted-foreground text-sm">{title}</p>
        <p className="text-3xl font-bold" dir="ltr">
          {stats.attendancePercent}%
        </p>
        <p className="text-muted-foreground text-xs">
          {ar.lookup.recorded}: {recorded} · {ar.attendanceStatus.absent} {stats.absent} ·{" "}
          {ar.attendanceStatus.late} {stats.late}
        </p>
      </CardContent>
    </Card>
  );
}
