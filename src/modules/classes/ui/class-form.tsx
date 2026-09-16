"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { validate } from "@/shared/lib/validate";
import { readText } from "@/shared/lib/form-data";
import type { AppError } from "@/shared/lib/result";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { createClass, editClass } from "../application/use-cases/manage-class";
import type { ClassWithCounts } from "../application/queries/list-classes";
import { useAction } from "@/shared/ui/use-action";
import { createClassSchema, updateClassSchema } from "../application/schemas";

export function ClassFormDialog({ trigger, klass }: { trigger: React.ReactNode; klass?: ClassWithCounts }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<AppError | null>(null);
  const [track, setTrack] = useState<string>(klass?.track ?? "scientific");
  const [gender, setGender] = useState<string>(klass?.gender ?? "mixed");

  const isEdit = Boolean(klass);
  // Rule 10.2: the track is frozen once sessions have snapshotted it.
  const trackLocked = isEdit && (klass?.sessionCount ?? 0) > 0;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      name: readText(data, "name"),
      track: trackLocked ? (klass?.track ?? "scientific") : track,
      gender,
      gradeLevel: readText(data, "gradeLevel"),
    };

    setError(null);

    // Checked here before the round trip, with the SAME schema the server runs
    // (docs/UX-AUDIT-2026-09.md, finding 6). The server still validates; this only
    // spares the person at the desk a wait to be told about a typo.
    const parsed = validate(
      klass ? updateClassSchema : createClassSchema,
      klass ? { ...payload, id: klass.id } : payload,
    );
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    startTransition(async () => {
      const result = klass ? await editClass({ ...payload, id: klass.id }) : await createClass(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? ar.classes.updated : ar.classes.created);
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
          <DialogTitle>{isEdit ? ar.classes.edit : ar.classes.add}</DialogTitle>
        </DialogHeader>

        <form id="class-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="class-name">{ar.classes.name}</Label>
            <Input id="class-name" name="name" defaultValue={klass?.name} required disabled={isPending} />
            <FieldError message={fieldError("name")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="class-grade">{ar.classes.gradeLevel}</Label>
            <Input
              id="class-grade"
              name="gradeLevel"
              defaultValue={klass?.gradeLevel ?? "الصف الثالث الثانوي"}
              required
              disabled={isPending}
            />
            <FieldError message={fieldError("gradeLevel")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="class-track">{ar.classes.track}</Label>
              <Select value={track} onValueChange={setTrack} disabled={isPending || trackLocked}>
                <SelectTrigger id="class-track" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scientific">{ar.tracks.scientific}</SelectItem>
                  <SelectItem value="literary">{ar.tracks.literary}</SelectItem>
                </SelectContent>
              </Select>
              {trackLocked ? (
                <p className="text-muted-foreground text-xs">{ar.classes.trackLocked}</p>
              ) : (
                <FieldError message={fieldError("track")} />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-gender">{ar.classes.gender}</Label>
              <Select value={gender} onValueChange={setGender} disabled={isPending}>
                <SelectTrigger id="class-gender" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{ar.classes.genders.male}</SelectItem>
                  <SelectItem value="female">{ar.classes.genders.female}</SelectItem>
                  <SelectItem value="mixed">{ar.classes.genders.mixed}</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={fieldError("gender")} />
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
          <Button type="submit" form="class-form" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
