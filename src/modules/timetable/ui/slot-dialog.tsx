"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ar, weekdayName } from "@/shared/i18n/ar";
import type { AppError } from "@/shared/lib/result";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { clearSlot, setSlot } from "../application/use-cases/manage-slot";
import type { GridCell } from "../application/queries/get-class-timetable";
import type { SubjectOption, TeacherOption } from "../infrastructure/timetable.repository";

export type CellTarget = {
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  cell: GridCell | null;
};

/**
 * One cell of the grid. The teacher list is already narrowed to those linked to this
 * branch and active — a teacher from another branch is not disabled here, they are
 * simply not in the list, because listing them would say they exist.
 *
 * The form is a separate component with a `key`: moving to another cell should start
 * from that cell's values, and remounting is how React resets state without an effect
 * that writes state during render.
 */
export function SlotDialog({
  classId,
  target,
  teachers,
  subjects,
  onClose,
}: {
  classId: string;
  target: CellTarget | null;
  teachers: TeacherOption[];
  subjects: SubjectOption[];
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {target ? (
          <SlotForm
            key={`${target.dayOfWeek}:${target.periodNumber}:${target.cell?.slotId ?? "new"}`}
            classId={classId}
            target={target}
            teachers={teachers}
            subjects={subjects}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SlotForm({
  classId,
  target,
  teachers,
  subjects,
  onClose,
}: {
  classId: string;
  target: CellTarget;
  teachers: TeacherOption[];
  subjects: SubjectOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);
  const [subjectId, setSubjectId] = useState(target.cell?.subjectId ?? "");
  const [teacherId, setTeacherId] = useState(target.cell?.teacherId ?? "");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await setSlot({
        classId,
        ...(target.cell ? { slotId: target.cell.slotId } : {}),
        subjectId,
        teacherId,
        dayOfWeek: target.dayOfWeek,
        periodNumber: target.periodNumber,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(ar.timetable.saved);
      onClose();
      router.refresh();
    });
  }

  function onClear() {
    const slotId = target.cell?.slotId;
    if (!slotId) return;

    startTransition(async () => {
      const result = await clearSlot({ slotId });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(ar.timetable.cleared);
      onClose();
      router.refresh();
    });
  }

  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{target.cell ? ar.timetable.editSlot : ar.timetable.addSlot}</DialogTitle>
        <DialogDescription>
          {weekdayName(target.dayOfWeek)} — {ar.timetable.period} {target.periodNumber} ({target.startTime} –{" "}
          {target.endTime})
        </DialogDescription>
      </DialogHeader>

      <form id="slot-form" className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="slot-subject">{ar.timetable.subject}</Label>
          <Select value={subjectId} onValueChange={setSubjectId} disabled={isPending}>
            <SelectTrigger id="slot-subject" className="w-full">
              <SelectValue placeholder={ar.timetable.subject} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("subjectId") ? (
            <p role="alert" className="text-destructive text-sm">
              {fieldError("subjectId")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slot-teacher">{ar.timetable.teacher}</Label>
          <Select value={teacherId} onValueChange={setTeacherId} disabled={isPending}>
            <SelectTrigger id="slot-teacher" className="w-full">
              <SelectValue placeholder={ar.timetable.teacher} />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("teacherId") ? (
            <p role="alert" className="text-destructive text-sm">
              {fieldError("teacherId")}
            </p>
          ) : null}
          {teachers.length === 0 ? (
            <p className="text-muted-foreground text-xs">{ar.timetable.noTeachersHint}</p>
          ) : null}
        </div>

        {error && !error.fieldErrors ? (
          <p role="alert" className="text-destructive text-sm">
            {error.message}
          </p>
        ) : null}
      </form>

      <DialogFooter>
        {target.cell ? (
          <Button variant="outline" onClick={onClear} disabled={isPending} className="me-auto">
            <Trash2 className="size-4" aria-hidden />
            {ar.timetable.clear}
          </Button>
        ) : null}
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          {ar.common.cancel}
        </Button>
        <Button type="submit" form="slot-form" disabled={isPending || !subjectId || !teacherId}>
          {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {ar.common.save}
        </Button>
      </DialogFooter>
    </>
  );
}
