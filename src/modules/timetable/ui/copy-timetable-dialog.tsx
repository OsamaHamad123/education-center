"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
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
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { copyTimetable, type CopyResult } from "../application/use-cases/manage-slot";
import type { ClassPickerOption } from "../application/queries/get-class-timetable";

/**
 * Copying another class's week. The result is deliberately a REPORT, not a toast:
 * a copy across tracks silently drops periods that do not exist in the target's bell
 * schedule, and an admin who is not told will find the gap in the middle of a lesson.
 */
export function CopyTimetableDialog({
  targetClassId,
  sources,
}: {
  targetClassId: string;
  sources: ClassPickerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);
  const [sourceClassId, setSourceClassId] = useState("");
  const [report, setReport] = useState<CopyResult | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReport(null);

    startTransition(async () => {
      const result = await copyTimetable({ sourceClassId, targetClassId });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setReport(result.data);
      if (result.data.created > 0) toast.success(ar.timetable.copied);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReport(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={sources.length === 0}>
          <Copy className="size-4" aria-hidden />
          {ar.timetable.copy}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.timetable.copyTitle}</DialogTitle>
          <DialogDescription>{ar.timetable.copyDescription}</DialogDescription>
        </DialogHeader>

        <form id="copy-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="copy-source">{ar.timetable.copySource}</Label>
            <Select value={sourceClassId} onValueChange={setSourceClassId} disabled={isPending}>
              <SelectTrigger id="copy-source" className="w-full">
                <SelectValue placeholder={ar.timetable.chooseClass} />
              </SelectTrigger>
              <SelectContent>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error.message}
            </p>
          ) : null}

          {report ? <CopyReport report={report} /> : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {report ? ar.common.close : ar.common.cancel}
          </Button>
          <Button type="submit" form="copy-form" disabled={isPending || !sourceClassId}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.timetable.copy}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyReport({ report }: { report: CopyResult }) {
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p className="font-medium">
        {report.created > 0 ? `${report.created} ${ar.timetable.copiedCount}` : ar.timetable.copyNothing}
      </p>

      {report.skipped.length > 0 ? (
        <ul className="text-muted-foreground max-h-48 space-y-1 overflow-y-auto">
          {report.skipped.map((skip, index) => (
            <li key={`${skip.dayOfWeek}-${skip.periodNumber}-${index}`}>
              {ar.timetable.copySkipped}: {skip.subjectName} — {weekdayName(skip.dayOfWeek)}،{" "}
              {ar.timetable.period} {skip.periodNumber} ({ar.timetable.copySkipReasons[skip.reason]})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
