"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import type { AppError } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
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
import { useAction } from "@/shared/ui/use-action";
import type { AssessmentList } from "../application/queries/get-assessments";
import { createAssessment } from "../application/use-cases/manage-assessment";

const KINDS = ["quiz", "monthly", "final", "other"] as const;

/**
 * Recording a paper that has been marked (`drizzle/0021`).
 *
 * The teacher field is absent for a teacher: they may only ever create their own, the
 * use case refuses anything else, and `assessments_insert` refuses it again. A control
 * that can only hold one value is a control that should not be on the screen.
 *
 * The total is asked for ONCE and never editable afterwards, because every mark
 * snapshots it — an exam whose total changed halfway would be a sheet where half the
 * rows mean one thing and half mean another.
 */
export function AssessmentDialog({ list, trigger }: { list: AssessmentList; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState(list.myTeacherId ?? "");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("quiz");

  const isTeacher = list.myTeacherId !== null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await createAssessment({
        classId,
        subjectId,
        teacherId,
        kind,
        name: readText(data, "name"),
        assessedOn: readText(data, "assessedOn"),
        maxScore: readText(data, "maxScore"),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(ar.assessments.created);
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
          <DialogTitle>{ar.assessments.createTitle}</DialogTitle>
          <DialogDescription>{ar.assessments.createDescription}</DialogDescription>
        </DialogHeader>

        <form id="assessment-form" className="space-y-4" onSubmit={onSubmit}>
          <Picker
            id="assessment-class"
            label={ar.assessments.classLabel}
            value={classId}
            onChange={setClassId}
            options={list.classes.map((row) => ({ value: row.id, label: row.name }))}
            disabled={isPending}
          />

          <Picker
            id="assessment-subject"
            label={ar.assessments.subject}
            value={subjectId}
            onChange={setSubjectId}
            options={list.subjects.map((row) => ({ value: row.id, label: row.name }))}
            disabled={isPending}
          />

          {isTeacher ? null : (
            <Picker
              id="assessment-teacher"
              label={ar.assessments.teacher}
              value={teacherId}
              onChange={setTeacherId}
              options={list.teachers.map((row) => ({ value: row.id, label: row.fullName }))}
              disabled={isPending}
            />
          )}

          <Picker
            id="assessment-kind"
            label={ar.assessments.kindLabel}
            value={kind}
            onChange={(value) => setKind(value as (typeof KINDS)[number])}
            options={KINDS.map((value) => ({ value, label: ar.assessments.kinds[value] }))}
            disabled={isPending}
          />

          <div className="space-y-2">
            <Label htmlFor="name">{ar.assessments.name}</Label>
            <Input
              id="name"
              name="name"
              defaultValue=""
              placeholder={ar.assessments.namePlaceholder}
              disabled={isPending}
              required
              aria-invalid={fieldError("name") ? true : undefined}
            />
            {fieldError("name") ? (
              <p role="alert" className="text-destructive text-sm">
                {fieldError("name")}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assessedOn">{ar.assessments.assessedOn}</Label>
              <Input
                id="assessedOn"
                name="assessedOn"
                type="date"
                defaultValue={todayInCairo()}
                max={todayInCairo()}
                disabled={isPending}
                dir="ltr"
                required
                aria-invalid={fieldError("assessedOn") ? true : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxScore">{ar.assessments.maxScore}</Label>
              <Input
                id="maxScore"
                name="maxScore"
                defaultValue="20"
                inputMode="decimal"
                disabled={isPending}
                dir="ltr"
                required
                aria-invalid={fieldError("maxScore") ? true : undefined}
              />
              {fieldError("maxScore") ? (
                <p role="alert" className="text-destructive text-sm">
                  {fieldError("maxScore")}
                </p>
              ) : null}
            </div>
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
          <Button
            type="submit"
            form="assessment-form"
            disabled={isPending || !classId || !subjectId || !teacherId}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Picker({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
