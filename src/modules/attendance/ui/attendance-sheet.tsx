"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCheck, Loader2, MessageSquarePlus, Printer } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { UnsavedGuard } from "@/shared/ui/unsaved-guard";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { EmptyState } from "@/shared/ui/empty-state";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { nextStatus, summarize, type AttendanceStatus } from "../domain/roster";
import type { AttendanceSheet } from "../application/queries/get-attendance-board";
import { saveAttendance } from "../application/use-cases/save-attendance";
import { useAction } from "@/shared/ui/use-action";

/**
 * The register (PROJECT_PLAN 10.5, section 12).
 *
 * Built for a phone held in one hand in a corridor. Everyone starts as حاضر, so the
 * common case is open → حفظ; only absentees need a tap, and absent is the FIRST stop
 * in the cycle. The status control is the whole row height so it can be hit without
 * looking, and the save button is fixed to the bottom of the viewport rather than at
 * the end of a list of thirty students.
 */

type Marks = Record<string, { status: AttendanceStatus; notes: string | null }>;

export function AttendanceSheetView({ sheet, backHref }: { sheet: AttendanceSheet; backHref: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useAction();
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const initial = useMemo(
    () => Object.fromEntries(sheet.students.map((s) => [s.studentId, { status: s.status, notes: s.notes }])),
    [sheet.students],
  );
  const [marks, setMarks] = useState<Marks>(initial);
  // What the server last confirmed. A failed save rolls back to exactly this.
  const [committed, setCommitted] = useState<Marks>(initial);

  const readOnly = sheet.blockedBy !== null || sheet.cancelled;
  const summary = summarize(sheet.students.map((s) => marks[s.studentId]?.status ?? "present"));
  const dirty = JSON.stringify(marks) !== JSON.stringify(committed);

  function cycle(studentId: string) {
    if (readOnly) return;
    setMarks((current) => {
      const mark = current[studentId] ?? { status: "present" as const, notes: null };
      return { ...current, [studentId]: { ...mark, status: nextStatus(mark.status) } };
    });
  }

  function markAllPresent() {
    if (readOnly) return;
    setMarks((current) =>
      Object.fromEntries(Object.entries(current).map(([id, mark]) => [id, { ...mark, status: "present" }])),
    );
  }

  function onSave() {
    const optimistic = marks;

    startTransition(async () => {
      const result = await saveAttendance({
        classId: sheet.classRef.id,
        sessionDate: sheet.sessionDate,
        periodNumber: sheet.periodNumber,
        // Only what differs from the default travels; the server fills in the rest.
        marks: Object.entries(optimistic)
          .filter(([, mark]) => mark.status !== "present" || mark.notes)
          .map(([studentId, mark]) => ({ studentId, status: mark.status, notes: mark.notes })),
      });

      if (!result.ok) {
        // Safe rollback: put the screen back to what the server last confirmed, so a
        // failed save never leaves a register that looks saved but is not.
        setMarks(committed);
        toast.error(result.error.message);
        return;
      }

      setCommitted(optimistic);
      toast.success(ar.attendance.saved);
      router.refresh();
    });
  }

  if (sheet.students.length === 0) {
    return (
      <div className="space-y-4">
        <SheetHeader sheet={sheet} backHref={backHref} />
        <EmptyState title={ar.attendance.noStudents} description={ar.attendance.noStudentsHint} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <SheetHeader sheet={sheet} backHref={backHref} dirty={dirty} />
      <UnsavedGuard when={dirty} />

      {sheet.blockedBy ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {ar.attendance.violations[sheet.blockedBy]}
        </p>
      ) : null}
      {sheet.cancelled ? (
        <p role="alert" className="rounded-md border p-3 text-sm">
          {ar.attendance.sessionCancelled}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={markAllPresent} disabled={readOnly || isPending}>
          <CheckCheck className="size-4" aria-hidden />
          {ar.attendance.markAllPresent}
        </Button>
        <Counters summary={summary} />
      </div>

      <ul className="divide-y rounded-md border" aria-label={ar.attendance.sheetTitle}>
        {sheet.students.map((student) => {
          const mark = marks[student.studentId] ?? { status: "present" as const, notes: null };
          return (
            <li key={student.studentId} className="flex items-stretch gap-2 ps-3">
              <div className="min-w-0 flex-1 self-center py-2">
                <p className="truncate font-medium">{student.fullName}</p>
                <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                  {student.studentCode}
                </p>
                {mark.notes ? <p className="text-muted-foreground truncate text-xs">{mark.notes}</p> : null}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="self-center"
                aria-label={`${ar.attendance.notesFor} ${student.fullName}`}
                onClick={() => setNoteFor(student.studentId)}
                disabled={readOnly || isPending}
              >
                <MessageSquarePlus className="size-4" aria-hidden />
              </Button>

              <button
                type="button"
                onClick={() => cycle(student.studentId)}
                disabled={readOnly || isPending}
                // A 4.5rem-wide, full-height target: hittable with a thumb, without
                // looking, while standing in front of the class.
                className={`w-[4.5rem] shrink-0 text-sm font-medium transition-colors ${statusClass(mark.status)} disabled:opacity-60`}
                aria-label={`${student.fullName}: ${ar.attendanceStatus[mark.status]}`}
              >
                {ar.attendanceStatus[mark.status]}
              </button>
            </li>
          );
        })}
      </ul>

      {sheet.savedBy ? (
        <p className="text-muted-foreground text-xs">
          {ar.attendance.savedBy}: {sheet.savedBy}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="bg-background/95 fixed inset-x-0 bottom-0 border-t p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <Counters summary={summary} className="hidden sm:flex" />
            <Button className="h-12 flex-1 text-base" onClick={onSave} disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {ar.attendance.save}
              {dirty ? " •" : null}
            </Button>
          </div>
        </div>
      ) : null}

      <NoteDialog
        student={sheet.students.find((s) => s.studentId === noteFor) ?? null}
        value={noteFor ? (marks[noteFor]?.notes ?? "") : ""}
        onClose={() => setNoteFor(null)}
        onSave={(notes) => {
          if (!noteFor) return;
          setMarks((current) => {
            const mark = current[noteFor] ?? { status: "present" as const, notes: null };
            return { ...current, [noteFor]: { ...mark, notes: notes.trim() || null } };
          });
          setNoteFor(null);
        }}
      />
    </div>
  );
}

function SheetHeader({
  sheet,
  backHref,
  dirty,
}: {
  sheet: AttendanceSheet;
  backHref: string;
  dirty?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button asChild variant="ghost" size="icon" aria-label={ar.common.back}>
        {/*
          The register knows it has unsaved marks and used to let you walk away from
          them without a word (docs/UX-AUDIT-2026-09.md, finding 5). Fifteen taps is a
          lot to lose to one mis-aimed thumb on a phone.
        */}
        <Link
          href={backHref}
          onClick={(event) => {
            if (dirty && !window.confirm(ar.attendance.discardChanges)) event.preventDefault();
          }}
        >
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold tracking-tight">
          {sheet.subjectName} — {ar.attendance.period} {sheet.periodNumber}
        </h1>
        <p className="text-muted-foreground text-sm">
          {sheet.classRef.name} · {sheet.teacherName} ·{" "}
          <span dir="ltr">
            {sheet.startTime} – {sheet.endTime}
          </span>{" "}
          · {formatDisplayDate(sheet.sessionDate)}
        </p>
      </div>

      {sheet.sessionId ? (
        <Button asChild variant="outline" size="icon" aria-label={ar.common.print}>
          <Link href={`/print/attendance/${sheet.sessionId}`} target="_blank">
            <Printer className="size-4" aria-hidden />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function Counters({ summary, className }: { summary: ReturnType<typeof summarize>; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      <Badge variant="secondary">
        {ar.attendanceStatus.present} {summary.present}
      </Badge>
      {summary.absent > 0 ? (
        <Badge variant="destructive">
          {ar.attendanceStatus.absent} {summary.absent}
        </Badge>
      ) : null}
      {summary.late > 0 ? (
        <Badge variant="outline">
          {ar.attendanceStatus.late} {summary.late}
        </Badge>
      ) : null}
      {summary.excused > 0 ? (
        <Badge variant="outline">
          {ar.attendanceStatus.excused} {summary.excused}
        </Badge>
      ) : null}
    </div>
  );
}

/** Colour carries the status at a glance; the label carries it for everyone else. */
function statusClass(status: AttendanceStatus): string {
  switch (status) {
    case "present":
      return "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100";
    case "absent":
      return "bg-red-100 text-red-900 hover:bg-red-200 dark:bg-red-950 dark:text-red-100";
    case "late":
      return "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100";
    case "excused":
      return "bg-sky-100 text-sky-900 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-100";
  }
}

function NoteDialog({
  student,
  value,
  onClose,
  onSave,
}: {
  student: { studentId: string; fullName: string } | null;
  value: string;
  onClose: () => void;
  onSave: (notes: string) => void;
}) {
  return (
    <Dialog open={student !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {student ? (
          <NoteForm
            key={student.studentId}
            student={student}
            value={value}
            onClose={onClose}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NoteForm({
  student,
  value,
  onClose,
  onSave,
}: {
  student: { fullName: string };
  value: string;
  onClose: () => void;
  onSave: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(value);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{ar.attendance.notes}</DialogTitle>
        <DialogDescription>
          {ar.attendance.notesFor} {student.fullName}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="attendance-note">{ar.attendance.notes}</Label>
        <Input
          id="attendance-note"
          value={notes}
          maxLength={300}
          onChange={(event) => setNotes(event.target.value)}
          autoFocus
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {ar.common.cancel}
        </Button>
        <Button onClick={() => onSave(notes)}>{ar.common.save}</Button>
      </DialogFooter>
    </>
  );
}
