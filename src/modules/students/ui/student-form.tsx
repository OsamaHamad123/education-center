"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ClassOption } from "@/modules/classes";
import type { Student } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { validate } from "@/shared/lib/validate";
import { readText } from "@/shared/lib/form-data";
import type { AppError } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { createStudent, editStudent } from "../application/use-cases/manage-student";
import { useAction } from "@/shared/ui/use-action";
import { createStudentSchema, updateStudentSchema } from "../application/schemas";
import { DateField } from "@/shared/ui/date-field";

/**
 * One form for enrolling and for editing. Class and join date appear only when
 * enrolling: afterwards they move through the enrollment transitions instead, so that
 * every move leaves a trail.
 */
export function StudentForm({ classes, student }: { classes: ClassOption[]; student?: Student }) {
  const router = useRouter();
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);
  const [classId, setClassId] = useState(student?.classId ?? classes[0]?.id ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  // Carries "yes, I saw the duplicates, enrol anyway" into the next submit without
  // making the whole form re-render or faking an event object.
  const confirmRef = useRef(false);

  const isEdit = Boolean(student);
  const duplicates = error?.fieldErrors?._duplicates ?? null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmDuplicate = confirmRef.current;
    confirmRef.current = false;
    const data = new FormData(event.currentTarget);
    const common = {
      fullName: readText(data, "fullName"),
      parentPhone: readText(data, "parentPhone"),
      parentWhatsapp: readText(data, "parentWhatsapp") || undefined,
      studentPhone: readText(data, "studentPhone") || undefined,
      studentWhatsapp: readText(data, "studentWhatsapp") || undefined,
      nationalId: readText(data, "nationalId") || undefined,
    };

    setError(null);

    // Checked here before the round trip, with the SAME schema the server runs
    // (docs/UX-AUDIT-2026-09.md, finding 6). The server still validates; this only
    // spares the person at the desk a wait to be told about a typo.
    const parsed = validate(
      student ? updateStudentSchema : createStudentSchema,
      student
        ? { ...common, id: student.id }
        : { ...common, classId, joinDate: readText(data, "joinDate"), confirmDuplicate },
    );
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    startTransition(async () => {
      const result = student
        ? await editStudent({ ...common, id: student.id })
        : await createStudent({
            ...common,
            classId,
            joinDate: readText(data, "joinDate"),
            confirmDuplicate,
          });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? ar.students.updated : ar.students.created);
      router.push(student ? `/students/${student.id}` : `/students/${result.data.id}`);
      router.refresh();
    });
  }

  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  return (
    <form ref={formRef} id="student-form" className="max-w-2xl space-y-5" onSubmit={onSubmit}>
      <Field
        name="fullName"
        label={ar.students.fullName}
        hint={ar.students.fullNameHint}
        defaultValue={student?.fullName}
        required
        disabled={isPending}
        error={fieldError("fullName")}
      />

      {!isEdit ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="classId">{ar.students.class}</Label>
            <Select value={classId} onValueChange={setClassId} disabled={isPending}>
              <SelectTrigger id="classId" className="w-full">
                <SelectValue placeholder={ar.students.class} />
              </SelectTrigger>
              <SelectContent>
                {classes.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldError("classId")} />
          </div>

          <Field
            name="joinDate"
            label={ar.students.joinDate}
            type="date"
            defaultValue={todayInCairo()}
            required
            disabled={isPending}
            error={fieldError("joinDate")}
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="parentPhone"
          inputMode="numeric"
          label={ar.students.parentPhone}
          defaultValue={student?.parentPhone ?? ""}
          required
          dir="ltr"
          placeholder="01xxxxxxxxx"
          disabled={isPending}
          error={fieldError("parentPhone")}
        />
        <Field
          name="parentWhatsapp"
          inputMode="numeric"
          label={ar.students.parentWhatsapp}
          defaultValue={student?.parentWhatsapp ?? ""}
          dir="ltr"
          disabled={isPending}
          error={fieldError("parentWhatsapp")}
        />
        <Field
          name="studentPhone"
          inputMode="numeric"
          label={ar.students.studentPhone}
          defaultValue={student?.studentPhone ?? ""}
          dir="ltr"
          disabled={isPending}
          error={fieldError("studentPhone")}
        />
        <Field
          name="studentWhatsapp"
          inputMode="numeric"
          label={ar.students.studentWhatsapp}
          defaultValue={student?.studentWhatsapp ?? ""}
          dir="ltr"
          disabled={isPending}
          error={fieldError("studentWhatsapp")}
        />
      </div>

      <Field
        name="nationalId"
        inputMode="numeric"
        label={ar.students.nationalId}
        defaultValue={student?.nationalId ?? ""}
        dir="ltr"
        disabled={isPending}
        error={fieldError("nationalId")}
      />

      {/* A warning, not a wall: siblings share a phone and a surname (rule 10.3). */}
      {duplicates ? (
        <Card className="border-amber-400">
          <CardContent className="space-y-3 pt-4">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4 text-amber-500" aria-hidden />
              {ar.students.duplicateWarning}
            </p>
            <ul className="text-muted-foreground space-y-1 text-sm">
              {duplicates.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                confirmRef.current = true;
                formRef.current?.requestSubmit();
              }}
            >
              {ar.students.duplicateContinue}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error && !error.fieldErrors ? (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {ar.common.save}
      </Button>
    </form>
  );
}

function Field(props: {
  name: string;
  label: string;
  hint?: string;
  type?: string;
  inputMode?: "numeric" | "decimal" | "tel";
  defaultValue?: string | undefined;
  required?: boolean;
  dir?: "ltr";
  placeholder?: string;
  disabled?: boolean;
  error?: string | undefined;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      {props.type === "date" ? (
        // dd/MM/yyyy, because the native input renders in the BROWSER's locale and this
        // product is read in one order only (docs/PRODUCT-REVIEW-2026-09.md, finding 1).
        <DateField
          id={props.name}
          name={props.name}
          defaultValue={props.defaultValue}
          required={props.required}
          disabled={props.disabled}
        />
      ) : (
        <Input
          id={props.name}
          name={props.name}
          type={props.type}
          defaultValue={props.defaultValue}
          required={props.required}
          disabled={props.disabled}
          dir={props.dir}
          // A field whose schema is digits should open the number pad. Four phone
          // numbers per student, all day (docs/PRODUCT-REVIEW-2026-09.md, finding 5).
          inputMode={props.inputMode}
          placeholder={props.placeholder}
          className={props.dir === "ltr" ? "text-start" : undefined}
          aria-invalid={props.error ? true : undefined}
        />
      )}
      {props.error ? (
        <FieldError message={props.error} />
      ) : props.hint ? (
        <p className="text-muted-foreground text-xs">{props.hint}</p>
      ) : null}
    </div>
  );
}

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}
