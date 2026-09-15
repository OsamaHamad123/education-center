"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ar, weekdayName } from "@/shared/i18n/ar";
import type { AppError } from "@/shared/lib/result";
import { WEEK_DISPLAY_ORDER } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { computePeriods, type BellBreak } from "../domain/compute-periods";
import {
  saveScheduleSettings,
  type ScheduleSaveReport,
} from "../application/use-cases/manage-schedule-settings";
import type { TrackSchedule } from "../application/queries/get-schedule-settings";

/**
 * The bell schedule, one tab per track (PROJECT_PLAN 7.10).
 *
 * The preview beside the form is not decoration: period times are DERIVED, so without
 * it an admin is typing four numbers and hoping. It runs the very same
 * `computePeriods` the server will run, so what they see is what gets stored.
 */
export function ScheduleSettingsForm({ schedules }: { schedules: TrackSchedule[] }) {
  const first = schedules[0]?.track ?? "scientific";

  return (
    <Tabs defaultValue={first}>
      <TabsList>
        {schedules.map((schedule) => (
          <TabsTrigger key={schedule.track} value={schedule.track}>
            {ar.tracks[schedule.track]}
          </TabsTrigger>
        ))}
      </TabsList>

      {schedules.map((schedule) => (
        <TabsContent key={schedule.track} value={schedule.track} className="mt-4">
          <TrackForm schedule={schedule} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TrackForm({ schedule }: { schedule: TrackSchedule }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);
  const [report, setReport] = useState<ScheduleSaveReport | null>(null);

  const [dayStartTime, setDayStartTime] = useState(schedule.dayStartTime);
  const [periodDurationMin, setPeriodDuration] = useState(String(schedule.periodDurationMin));
  const [periodsCount, setPeriodsCount] = useState(String(schedule.periodsCount));
  const [workingDays, setWorkingDays] = useState<number[]>(schedule.workingDays);
  const [breaks, setBreaks] = useState<BellBreak[]>(schedule.breaks);

  // The same pure function the server uses, so the preview cannot drift from reality.
  const preview = safePreview({
    dayStartTime,
    periodDurationMin: Number(periodDurationMin),
    periodsCount: Number(periodsCount),
    breaks,
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReport(null);

    startTransition(async () => {
      const result = await saveScheduleSettings({
        track: schedule.track,
        dayStartTime,
        periodDurationMin,
        periodsCount,
        workingDays,
        breaks,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(ar.timetable.settingsSaved);
      setReport(result.data);
      router.refresh();
    });
  }

  const toggleDay = (day: number) =>
    setWorkingDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );

  return (
    <form className="grid gap-6 lg:grid-cols-2" onSubmit={onSubmit}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`start-${schedule.track}`}>{ar.timetable.dayStartTime}</Label>
            <Input
              id={`start-${schedule.track}`}
              type="time"
              value={dayStartTime}
              onChange={(event) => setDayStartTime(event.target.value)}
              disabled={isPending}
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`duration-${schedule.track}`}>{ar.timetable.periodDuration}</Label>
            <Input
              id={`duration-${schedule.track}`}
              type="number"
              min="20"
              max="180"
              value={periodDurationMin}
              onChange={(event) => setPeriodDuration(event.target.value)}
              disabled={isPending}
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`count-${schedule.track}`}>{ar.timetable.periodsCount}</Label>
            <Input
              id={`count-${schedule.track}`}
              type="number"
              min="1"
              max="12"
              value={periodsCount}
              onChange={(event) => setPeriodsCount(event.target.value)}
              disabled={isPending}
              dir="ltr"
              required
            />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{ar.timetable.workingDays}</legend>
          <div className="flex flex-wrap gap-2">
            {WEEK_DISPLAY_ORDER.map((day) => (
              <label
                key={day}
                className="hover:bg-accent flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={workingDays.includes(day)}
                  onChange={() => toggleDay(day)}
                  disabled={isPending}
                  className="size-4"
                />
                {weekdayName(day)}
              </label>
            ))}
          </div>
        </fieldset>

        <BreaksEditor
          breaks={breaks}
          onChange={setBreaks}
          disabled={isPending}
          track={schedule.track}
          maxPeriod={Number(periodsCount) || 1}
        />

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error.message}
          </p>
        ) : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {ar.common.save}
        </Button>

        {report ? <SaveReport report={report} /> : null}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>{ar.timetable.preview}</CardTitle>
          <CardDescription>{ar.timetable.previewHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="divide-y text-sm">
            {preview.map((period) => (
              <li key={period.periodNumber}>
                <div className="flex items-center justify-between py-1.5">
                  <span>
                    {ar.timetable.period} {period.periodNumber}
                  </span>
                  <span className="font-mono" dir="ltr">
                    {period.startTime} – {period.endTime}
                  </span>
                </div>
                {period.breakAfter && period.periodNumber < preview.length ? (
                  <div className="text-muted-foreground flex items-center justify-between py-1 text-xs">
                    <span>{period.breakAfter.label ?? ar.timetable.breakDefaultLabel}</span>
                    <span dir="ltr">
                      {period.breakAfter.durationMin} {ar.units.minute}
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </form>
  );
}

function BreaksEditor({
  breaks,
  onChange,
  disabled,
  track,
  maxPeriod,
}: {
  breaks: BellBreak[];
  onChange: (next: BellBreak[]) => void;
  disabled: boolean;
  track: string;
  maxPeriod: number;
}) {
  const update = (index: number, patch: Partial<BellBreak>) =>
    onChange(breaks.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{ar.timetable.breaks}</legend>

      {breaks.map((item, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`break-after-${track}-${index}`} className="text-xs">
              {ar.timetable.breakAfter}
            </Label>
            <Input
              id={`break-after-${track}-${index}`}
              type="number"
              min="1"
              max={Math.max(maxPeriod - 1, 1)}
              className="w-24"
              dir="ltr"
              value={item.afterPeriod}
              onChange={(event) => update(index, { afterPeriod: Number(event.target.value) })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`break-duration-${track}-${index}`} className="text-xs">
              {ar.timetable.breakDuration}
            </Label>
            <Input
              id={`break-duration-${track}-${index}`}
              type="number"
              min="1"
              max="240"
              className="w-24"
              dir="ltr"
              value={item.durationMin}
              onChange={(event) => update(index, { durationMin: Number(event.target.value) })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`break-label-${track}-${index}`} className="text-xs">
              {ar.timetable.breakLabel}
            </Label>
            <Input
              id={`break-label-${track}-${index}`}
              className="w-40"
              value={item.label ?? ""}
              onChange={(event) => update(index, { label: event.target.value || null })}
              disabled={disabled}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={ar.timetable.removeBreak}
            onClick={() => onChange(breaks.filter((_, i) => i !== index))}
            disabled={disabled}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || maxPeriod < 2}
        onClick={() =>
          onChange([
            ...breaks,
            {
              afterPeriod: nextFreePeriod(breaks, maxPeriod),
              durationMin: 15,
              label: ar.timetable.breakDefaultLabel,
            },
          ])
        }
      >
        <Plus className="size-4" aria-hidden />
        {ar.timetable.addBreak}
      </Button>
    </fieldset>
  );
}

function SaveReport({ report }: { report: ScheduleSaveReport }) {
  const nothingHappened =
    report.retimed === 0 && report.deactivated.length === 0 && report.conflicted.length === 0;

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      {nothingHappened ? <p className="text-muted-foreground">{ar.timetable.recomputeNone}</p> : null}

      {report.retimed > 0 ? (
        <Badge variant="secondary">
          {report.retimed} {ar.timetable.recomputeRetimed}
        </Badge>
      ) : null}

      {report.deactivated.length > 0 ? (
        <div>
          <p className="font-medium">
            {report.deactivated.length} {ar.timetable.recomputeDeactivated}
          </p>
          <ul className="text-muted-foreground max-h-40 overflow-y-auto">
            {report.deactivated.map((slot, index) => (
              <li key={index}>
                {slot.className} — {weekdayName(slot.dayOfWeek)}، {ar.timetable.period} {slot.periodNumber} (
                {ar.timetable.recomputeReasons[slot.reason]})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.conflicted.length > 0 ? (
        <div>
          <p className="text-destructive font-medium">
            {report.conflicted.length} {ar.timetable.recomputeConflicts}
          </p>
          <ul className="text-muted-foreground max-h-40 overflow-y-auto">
            {report.conflicted.map((slot, index) => (
              <li key={index}>
                {slot.className} — {weekdayName(slot.dayOfWeek)}، {ar.timetable.period} {slot.periodNumber}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The preview must survive a half-typed number without throwing. */
function safePreview(schedule: {
  dayStartTime: string;
  periodDurationMin: number;
  periodsCount: number;
  breaks: BellBreak[];
}) {
  if (!/^\d{2}:\d{2}$/.test(schedule.dayStartTime)) return [];
  if (!Number.isFinite(schedule.periodDurationMin) || schedule.periodDurationMin < 1) return [];
  if (!Number.isFinite(schedule.periodsCount) || schedule.periodsCount < 1) return [];
  if (schedule.periodsCount > 12) return [];

  try {
    return computePeriods(schedule);
  } catch {
    return [];
  }
}

function nextFreePeriod(breaks: readonly BellBreak[], maxPeriod: number): number {
  const taken = new Set(breaks.map((item) => item.afterPeriod));
  for (let period = 1; period < maxPeriod; period++) {
    if (!taken.has(period)) return period;
  }
  return 1;
}
