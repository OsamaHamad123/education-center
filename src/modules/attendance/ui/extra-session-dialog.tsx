"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import type { AppError } from "@/shared/lib/result";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { formatDisplayDate } from "@/shared/lib/date-display";
import type { MakeUpCandidate } from "../infrastructure/attendance.repository";
import { createExtraSession } from "../application/use-cases/manage-session";
import { useAction } from "@/shared/ui/use-action";

/**
 * A lesson that was never on the weekly plan — a make-up or a revision session
 * (rule 10.5). It carries no `timetable_slot_id`, which is exactly what `is_extra`
 * means, and it is paid like any other session.
 *
 * Since `drizzle/0020` it can also SAY which missed lesson it makes up for, and that
 * is the difference between a lesson added and a lesson moved. Adding one pays for
 * one; moving one paid for both, until the two were linked — the teacher taught
 * Sunday's period on Wednesday and the centre paid for Sunday as well.
 *
 * Choosing one cancels the original in the same transaction. The dialog says so before
 * the press, because cancelling a lesson is not what somebody thinks they are doing
 * when they record an extra one.
 */
export function ExtraSessionDialog({
  classId,
  sessionDate,
  teachers,
  subjects,
  makeUpCandidates,
  trigger,
}: {
  classId: string;
  sessionDate: string;
  teachers: { id: string; fullName: string }[];
  subjects: { id: string; name: string }[];
  /** Cancelled lessons of this class that nothing has made up for yet. */
  makeUpCandidates: MakeUpCandidate[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  // NONE rather than "": Radix's Select treats an empty string as "no item" and
  // refuses to render an option with that value.
  const [makesUpSessionId, setMakesUpSessionId] = useState(NONE);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await createExtraSession({
        classId,
        sessionDate,
        teacherId,
        subjectId,
        makesUpSessionId: makesUpSessionId === NONE ? "" : makesUpSessionId,
        periodNumber: readText(data, "periodNumber"),
        startTime: readText(data, "startTime"),
        endTime: readText(data, "endTime"),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(ar.attendance.extraCreated);
      setOpen(false);
      router.refresh();
    });
  }

  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.attendance.extraTitle}</DialogTitle>
          <DialogDescription>{ar.attendance.extraDescription}</DialogDescription>
        </DialogHeader>

        <form id="extra-session-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="extra-subject">{ar.attendance.subject}</Label>
            <Select value={subjectId} onValueChange={setSubjectId} disabled={isPending}>
              <SelectTrigger id="extra-subject" className="w-full">
                <SelectValue placeholder={ar.attendance.subject} />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="extra-teacher">{ar.attendance.teacher}</Label>
            <Select value={teacherId} onValueChange={setTeacherId} disabled={isPending}>
              <SelectTrigger id="extra-teacher" className="w-full">
                <SelectValue placeholder={ar.attendance.teacher} />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {makeUpCandidates.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="extra-makes-up">{ar.attendance.makesUpLabel}</Label>
              <Select value={makesUpSessionId} onValueChange={setMakesUpSessionId} disabled={isPending}>
                <SelectTrigger id="extra-makes-up" className="w-full">
                  <SelectValue placeholder={ar.attendance.makesUpNone} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{ar.attendance.makesUpNone}</SelectItem>
                  {makeUpCandidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {formatDisplayDate(candidate.sessionDate)} · {ar.attendance.period}{" "}
                      {candidate.periodNumber} · {candidate.subjectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">{ar.attendance.makesUpHint}</p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              name="periodNumber"
              label={ar.attendance.period}
              type="number"
              min="1"
              max="12"
              defaultValue="7"
              disabled={isPending}
              error={fieldError("periodNumber")}
            />
            <Field
              name="startTime"
              label={ar.attendance.startTime}
              type="time"
              defaultValue="14:00"
              disabled={isPending}
              error={fieldError("startTime")}
            />
            <Field
              name="endTime"
              label={ar.attendance.endTime}
              type="time"
              defaultValue="14:45"
              disabled={isPending}
              error={fieldError("endTime")}
            />
          </div>

          {error && !error.fieldErrors ? (
            <p role="alert" className="text-destructive text-sm">
              {error.message}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button type="submit" form="extra-session-form" disabled={isPending || !teacherId || !subjectId}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Radix refuses an item with an empty value, so "none" needs a name of its own. */
const NONE = "none";

function Field(props: {
  name: string;
  label: string;
  type: string;
  min?: string;
  max?: string;
  defaultValue: string;
  disabled: boolean;
  error?: string | undefined;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Input
        id={props.name}
        name={props.name}
        type={props.type}
        min={props.min}
        max={props.max}
        defaultValue={props.defaultValue}
        disabled={props.disabled}
        dir="ltr"
        required
        aria-invalid={props.error ? true : undefined}
      />
      {props.error ? (
        <p role="alert" className="text-destructive text-sm">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}
