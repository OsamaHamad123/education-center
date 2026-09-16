"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ar, weekdayNameOf } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { AttendanceBoard, BoardPeriod } from "../application/queries/get-attendance-board";
import { ExtraSessionDialog } from "./extra-session-dialog";
import { useNavPending } from "@/shared/ui/use-nav-pending";

/**
 * Step two of the flow (rule 10.5): the day's periods, each saying whether it has
 * been marked. Tapping one opens the register.
 *
 * Everything on this screen is a link or a large row — no table, because on a phone
 * this is the screen somebody opens between two lessons.
 */
export function AttendanceBoardView({
  board,
  teachers,
  subjects,
  canManage,
}: {
  board: AttendanceBoard;
  teachers: { id: string; fullName: string }[];
  subjects: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [isNavigating, navigate] = useNavPending();

  const go = (params: { classId?: string; date?: string }) => {
    const classId = params.classId ?? board.classRef.id;
    const date = params.date ?? board.sessionDate;
    navigate(`/attendance?classId=${classId}&date=${date}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={board.classRef.id}
          onValueChange={(classId) => go({ classId })}
          disabled={isNavigating}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label={ar.attendance.classLabel}>
            <SelectValue placeholder={ar.attendance.chooseClass} />
          </SelectTrigger>
          <SelectContent>
            {board.classes.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={ar.attendance.previousDay}
            // Disabled while the next day is being fetched: this is the control that
            // looked like it had done nothing, so it got tapped twice.
            disabled={isNavigating}
            onClick={() => go({ date: shiftDays(board.sessionDate, -1) })}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>

          <Input
            type="date"
            value={board.sessionDate}
            max={board.today}
            aria-label={ar.attendance.date}
            dir="ltr"
            className="w-40 text-center"
            disabled={isNavigating}
            onChange={(event) => event.target.value && go({ date: event.target.value })}
          />

          <Button
            variant="outline"
            size="icon"
            aria-label={ar.attendance.nextDay}
            disabled={isNavigating || board.sessionDate >= board.today}
            onClick={() => go({ date: shiftDays(board.sessionDate, 1) })}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        </div>

        {board.sessionDate !== board.today ? (
          <Button variant="ghost" disabled={isNavigating} onClick={() => go({ date: board.today })}>
            <CalendarDays className="size-4" aria-hidden />
            {ar.attendance.today}
          </Button>
        ) : null}

        {canManage ? (
          <div className="ms-auto">
            <ExtraSessionDialog
              classId={board.classRef.id}
              sessionDate={board.sessionDate}
              teachers={teachers}
              subjects={subjects}
              trigger={
                <Button variant="outline">
                  <Plus className="size-4" aria-hidden />
                  {ar.attendance.extra}
                </Button>
              }
            />
          </div>
        ) : null}
      </div>

      <p className="text-muted-foreground text-sm">
        {weekdayNameOf(board.sessionDate)} · {formatDisplayDate(board.sessionDate)} · {board.rosterSize}{" "}
        {ar.attendance.students}
      </p>

      {board.blockedBy ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {ar.attendance.violations[board.blockedBy]}
        </p>
      ) : null}

      {board.periods.length === 0 ? (
        <EmptyState title={ar.attendance.noPeriods} description={ar.attendance.noPeriodsHint} />
      ) : (
        <ul className="space-y-2">
          {board.periods.map((period) => (
            <li key={period.periodNumber}>
              <PeriodRow board={board} period={period} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PeriodRow({ board, period }: { board: AttendanceBoard; period: BoardPeriod }) {
  return (
    <Card className="hover:bg-accent/40 transition-colors">
      <CardContent className="p-0">
        <Link
          href={`/attendance/mark?classId=${board.classRef.id}&date=${board.sessionDate}&period=${period.periodNumber}`}
          className="flex items-center gap-3 p-3"
          aria-label={`${ar.attendance.open} ${ar.attendance.period} ${period.periodNumber} — ${period.subjectName}`}
        >
          <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md text-sm font-bold">
            {period.periodNumber}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{period.subjectName}</span>
            <span className="text-muted-foreground block truncate text-sm">
              {period.teacherName} ·{" "}
              <span dir="ltr">
                {period.startTime} – {period.endTime}
              </span>
            </span>
          </span>

          <span className="flex shrink-0 flex-col items-end gap-1">
            <StatusBadge period={period} rosterSize={board.rosterSize} />
            {period.isExtra ? <Badge variant="outline">{ar.attendance.extraBadge}</Badge> : null}
          </span>
        </Link>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ period, rosterSize }: { period: BoardPeriod; rosterSize: number }) {
  if (period.status === "cancelled") {
    return <Badge variant="destructive">{ar.attendance.cancelledBadge}</Badge>;
  }
  if (period.status === "unmarked") {
    return <Badge variant="outline">{ar.attendance.unmarked}</Badge>;
  }
  return (
    <Badge variant="secondary" dir="ltr">
      {period.markedCount}/{rosterSize}
      {period.absentCount > 0 ? ` · ${ar.attendanceStatus.absent} ${period.absentCount}` : ""}
    </Badge>
  );
}

function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
