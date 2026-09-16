"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BranchOption } from "@/modules/branches";
import { ar } from "@/shared/i18n/ar";
import { validate } from "@/shared/lib/validate";
import { readText } from "@/shared/lib/form-data";
import { piastersToPounds } from "@/shared/lib/money";
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
import { createTeacher, editTeacher } from "../application/use-cases/manage-teacher";
import type { TeacherRow } from "../application/queries/list-teachers";
import { AccessCodeDialog } from "./access-code-dialog";
import { useAction } from "@/shared/ui/use-action";
import { createTeacherSchema, updateTeacherSchema } from "../application/schemas";

/**
 * Super-admin only. Rates are entered in pounds and converted to piasters by the
 * schema, so nothing below the form ever handles a float.
 */
export function TeacherFormDialog({
  trigger,
  teacher,
  branches,
}: {
  trigger: React.ReactNode;
  teacher?: TeacherRow;
  branches: BranchOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);
  const [branchId, setBranchId] = useState("");
  const [code, setCode] = useState<{ phone: string; accessCode: string } | null>(null);

  const isEdit = Boolean(teacher);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    const common = {
      fullName: readText(data, "fullName"),
      specialization: readText(data, "specialization") || undefined,
      ratePiastersScientific: readText(data, "rateScientific"),
      ratePiastersLiterary: readText(data, "rateLiterary"),
    };
    const payload = teacher
      ? { ...common, id: teacher.id, effectiveFrom: readText(data, "effectiveFrom") }
      : { ...common, phone: readText(data, "phone"), ...(branchId ? { branchId } : {}) };

    // Checked here before the round trip, with the SAME schema the server runs
    // (docs/UX-AUDIT-2026-09.md, finding 6). The server still validates; this only
    // spares the person at the desk a wait to be told about a typo.
    const parsed = validate(teacher ? updateTeacherSchema : createTeacherSchema, payload);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    startTransition(async () => {
      const result = teacher ? await editTeacher(payload) : await createTeacher(payload);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(isEdit ? ar.teachers.updated : ar.teachers.created);
      setOpen(false);
      // A new teacher gets a login; the code is shown once, right now.
      if (!isEdit && "accessCode" in result.data) {
        setCode({ phone: result.data.phone, accessCode: result.data.accessCode });
      }
      router.refresh();
    });
  }

  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? ar.teachers.edit : ar.teachers.add}</DialogTitle>
            <DialogDescription>{ar.teachers.phoneHint}</DialogDescription>
          </DialogHeader>

          <form id="teacher-form" className="space-y-4" onSubmit={onSubmit}>
            <Field
              name="fullName"
              label={ar.teachers.fullName}
              defaultValue={teacher?.fullName}
              required
              disabled={isPending}
              error={fieldError("fullName")}
            />

            {!isEdit ? (
              <Field
                name="phone"
                label={ar.teachers.phone}
                dir="ltr"
                placeholder="01xxxxxxxxx"
                required
                disabled={isPending}
                error={fieldError("phone")}
              />
            ) : null}

            <Field
              name="specialization"
              label={ar.teachers.specialization}
              defaultValue={teacher?.specialization ?? ""}
              disabled={isPending}
              error={fieldError("specialization")}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="rateScientific"
                label={ar.teachers.rateScientific}
                type="number"
                step="0.01"
                min="0"
                dir="ltr"
                defaultValue={teacher ? String(piastersToPounds(teacher.ratePiastersScientific)) : "0"}
                required
                disabled={isPending}
                error={fieldError("ratePiastersScientific")}
              />
              <Field
                name="rateLiterary"
                label={ar.teachers.rateLiterary}
                type="number"
                step="0.01"
                min="0"
                dir="ltr"
                defaultValue={teacher ? String(piastersToPounds(teacher.ratePiastersLiterary)) : "0"}
                required
                disabled={isPending}
                error={fieldError("ratePiastersLiterary")}
              />
            </div>

            {isEdit ? (
              <Field
                name="effectiveFrom"
                label={ar.teachers.effectiveFrom}
                type="date"
                defaultValue={todayInCairo()}
                required
                disabled={isPending}
                error={fieldError("effectiveFrom")}
                hint={ar.teachers.rateHistoryHint}
              />
            ) : branches.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="teacher-branch">{ar.teachers.branches}</Label>
                <Select value={branchId} onValueChange={setBranchId} disabled={isPending}>
                  <SelectTrigger id="teacher-branch" className="w-full">
                    <SelectValue placeholder={ar.teachers.branches} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

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
            <Button type="submit" form="teacher-form" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {ar.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccessCodeDialog value={code} onClose={() => setCode(null)} />
    </>
  );
}

function Field(props: {
  name: string;
  label: string;
  type?: string;
  step?: string;
  min?: string;
  defaultValue?: string | undefined;
  required?: boolean;
  dir?: "ltr";
  placeholder?: string;
  disabled?: boolean;
  error?: string | undefined;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Input
        id={props.name}
        name={props.name}
        type={props.type}
        step={props.step}
        min={props.min}
        defaultValue={props.defaultValue}
        required={props.required}
        disabled={props.disabled}
        dir={props.dir}
        placeholder={props.placeholder}
        className={props.dir === "ltr" ? "text-start" : undefined}
        aria-invalid={props.error ? true : undefined}
      />
      {props.error ? (
        <p role="alert" className="text-destructive text-sm">
          {props.error}
        </p>
      ) : props.hint ? (
        <p className="text-muted-foreground text-xs">{props.hint}</p>
      ) : null}
    </div>
  );
}
