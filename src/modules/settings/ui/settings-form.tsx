"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { CenterSettings } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import type { AppError } from "@/shared/lib/result";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { updateCenterSettings, uploadCenterLogo } from "../application/use-cases/update-settings";

export function SettingsForm({ settings }: { settings: CenterSettings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);
  const [lookupEnabled, setLookupEnabled] = useState(settings.lookupEnabled);
  const [teacherCanMark, setTeacherCanMark] = useState(settings.teacherCanMarkAttendance);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await updateCenterSettings({
        centerName: readText(data, "centerName"),
        lookupEnabled,
        teacherCanMarkAttendance: teacherCanMark,
        attendanceEditWindowDays: readText(data, "attendanceEditWindowDays"),
        absenceAlertThresholdPercent: readText(data, "absenceAlertThresholdPercent"),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(ar.settings.saved);
      router.refresh();
    });
  }

  const fieldError = (name: string) => error?.fieldErrors?.[name]?.[0];

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{ar.settings.logo}</CardTitle>
          <CardDescription>{ar.settings.logoHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <LogoUploader currentPath={settings.logoPath} />
        </CardContent>
      </Card>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>{ar.settings.general}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="centerName">{ar.settings.centerName}</Label>
              <Input
                id="centerName"
                name="centerName"
                defaultValue={settings.centerName}
                required
                disabled={isPending}
              />
              <FieldError message={fieldError("centerName")} />
            </div>

            <Toggle
              id="lookupEnabled"
              label={ar.settings.lookupEnabled}
              description={ar.settings.lookupEnabledHint}
              checked={lookupEnabled}
              onChange={setLookupEnabled}
              disabled={isPending}
            />

            <Toggle
              id="teacherCanMark"
              label={ar.settings.teacherCanMark}
              description={ar.settings.teacherCanMarkHint}
              checked={teacherCanMark}
              onChange={setTeacherCanMark}
              disabled={isPending}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="attendanceEditWindowDays">{ar.settings.editWindow}</Label>
                <Input
                  id="attendanceEditWindowDays"
                  name="attendanceEditWindowDays"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={settings.attendanceEditWindowDays}
                  required
                  dir="ltr"
                  className="text-start"
                  disabled={isPending}
                />
                <p className="text-muted-foreground text-xs">{ar.settings.editWindowHint}</p>
                <FieldError message={fieldError("attendanceEditWindowDays")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="absenceAlertThresholdPercent">{ar.settings.absenceThreshold}</Label>
                <Input
                  id="absenceAlertThresholdPercent"
                  name="absenceAlertThresholdPercent"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={settings.absenceAlertThresholdPercent}
                  required
                  dir="ltr"
                  className="text-start"
                  disabled={isPending}
                />
                <p className="text-muted-foreground text-xs">{ar.settings.absenceThresholdHint}</p>
                <FieldError message={fieldError("absenceAlertThresholdPercent")} />
              </div>
            </div>

            {error && !error.fieldErrors ? (
              <p role="alert" className="text-destructive text-sm">
                {error.message}
              </p>
            ) : null}

            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {ar.common.save}
            </Button>
          </CardContent>
        </Card>
      </form>
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

/** A plain checkbox rather than a switch: shadcn's switch is not installed, and this
 * is keyboard- and screen-reader-correct with no extra dependency. */
function Toggle(props: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={props.id}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        disabled={props.disabled}
        className="mt-1 size-4 shrink-0"
      />
      <div className="space-y-0.5">
        <Label htmlFor={props.id}>{props.label}</Label>
        <p className="text-muted-foreground text-xs">{props.description}</p>
      </div>
    </div>
  );
}

function LogoUploader({ currentPath }: { currentPath: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const data = new FormData();
    data.set("logo", file);

    startTransition(async () => {
      const result = await uploadCenterLogo(data);
      if (inputRef.current) inputRef.current.value = "";
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(ar.settings.logoUploaded);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {currentPath ? (
        <Image
          src={currentPath}
          alt={ar.settings.logo}
          width={64}
          height={64}
          className="rounded-md border object-contain"
          unoptimized
        />
      ) : (
        <div className="text-muted-foreground flex size-16 items-center justify-center rounded-md border border-dashed text-xs">
          —
        </div>
      )}

      <div>
        <input
          ref={inputRef}
          id="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={onFileChosen}
          disabled={isPending}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          {ar.settings.uploadLogo}
        </Button>
      </div>
    </div>
  );
}
