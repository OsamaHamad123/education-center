"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Printer } from "lucide-react";
import { ar, weekdayName } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { cellKey } from "../domain/copy-timetable";
import type { ClassPickerOption, ClassTimetable, GridCell } from "../application/queries/get-class-timetable";
import { CopyTimetableDialog } from "./copy-timetable-dialog";
import { SlotDialog, type CellTarget } from "./slot-dialog";

/**
 * The weekly grid (PROJECT_PLAN 10.4). Rows are days Saturday → Thursday, columns are
 * periods, and a cell is a subject plus a teacher.
 *
 * Below `md` the same data becomes one card per day: a six-by-six table on a 360px
 * screen cannot be read, let alone tapped accurately, and this screen is used on a
 * phone in a corridor.
 */
export function TimetableGrid({
  timetable,
  classes,
  selectedClassId,
  copySources,
  canWrite,
}: {
  timetable: ClassTimetable;
  classes: ClassPickerOption[];
  selectedClassId: string;
  copySources: ClassPickerOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<CellTarget | null>(null);

  const openCell = (dayOfWeek: number, periodNumber: number) => {
    if (!canWrite) return;
    const period = timetable.periods.find((item) => item.periodNumber === periodNumber);
    if (!period) return;

    setTarget({
      dayOfWeek,
      periodNumber,
      startTime: period.startTime,
      endTime: period.endTime,
      cell: timetable.cells[cellKey(dayOfWeek, periodNumber)] ?? null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedClassId} onValueChange={(value) => router.push(`/timetable?classId=${value}`)}>
          <SelectTrigger className="w-full sm:w-64" aria-label={ar.timetable.classLabel}>
            <SelectValue placeholder={ar.timetable.chooseClass} />
          </SelectTrigger>
          <SelectContent>
            {classes.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="secondary">
          {ar.timetable.weeklyTotal}: {timetable.slotCount}
        </Badge>

        <div className="ms-auto flex gap-2">
          {canWrite ? <CopyTimetableDialog targetClassId={selectedClassId} sources={copySources} /> : null}
          <Button asChild variant="outline">
            <Link href={`/print/timetable/class/${selectedClassId}`} target="_blank">
              <Printer className="size-4" aria-hidden />
              {ar.common.print}
            </Link>
          </Button>
        </div>
      </div>

      {!timetable.configured ? (
        <EmptyState title={ar.timetable.notConfigured} description={ar.timetable.notConfiguredHint} />
      ) : timetable.days.length === 0 ? (
        <EmptyState title={ar.timetable.notConfigured} description={ar.timetable.notConfiguredHint} />
      ) : (
        <>
          <DesktopGrid timetable={timetable} onOpen={openCell} canWrite={canWrite} />
          <MobileDays timetable={timetable} onOpen={openCell} canWrite={canWrite} />
        </>
      )}

      {canWrite ? (
        <SlotDialog
          classId={selectedClassId}
          target={target}
          teachers={timetable.teachers}
          subjects={timetable.subjects}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </div>
  );
}

type GridProps = {
  timetable: ClassTimetable;
  onOpen: (dayOfWeek: number, periodNumber: number) => void;
  canWrite: boolean;
};

function DesktopGrid({ timetable, onOpen, canWrite }: GridProps) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="bg-muted/50 border p-2 text-start font-medium">
              {ar.timetable.day}
            </th>
            {timetable.periods.map((period) => (
              <th key={period.periodNumber} scope="col" className="bg-muted/50 border p-2 font-medium">
                <div>
                  {ar.timetable.period} {period.periodNumber}
                </div>
                <div className="text-muted-foreground text-xs font-normal" dir="ltr">
                  {period.startTime} – {period.endTime}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timetable.days.map((day) => (
            <tr key={day}>
              <th scope="row" className="bg-muted/50 border p-2 text-start font-medium whitespace-nowrap">
                {weekdayName(day)}
              </th>
              {timetable.periods.map((period) => {
                const cell = timetable.cells[cellKey(day, period.periodNumber)];
                return (
                  <td key={period.periodNumber} className="border p-0 align-top">
                    <CellButton
                      cell={cell}
                      canWrite={canWrite}
                      label={`${weekdayName(day)} — ${ar.timetable.period} ${period.periodNumber}`}
                      onClick={() => onOpen(day, period.periodNumber)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileDays({ timetable, onOpen, canWrite }: GridProps) {
  return (
    <div className="space-y-3 md:hidden">
      {timetable.days.map((day) => (
        <Card key={day}>
          <CardContent className="space-y-2 pt-4">
            <h2 className="font-medium">{weekdayName(day)}</h2>
            <ul className="divide-y">
              {timetable.periods.map((period) => {
                const cell = timetable.cells[cellKey(day, period.periodNumber)];
                return (
                  <li key={period.periodNumber} className="flex items-center gap-2 py-1.5">
                    <span className="text-muted-foreground w-24 shrink-0 text-xs" dir="ltr">
                      {period.startTime} – {period.endTime}
                    </span>
                    <div className="min-w-0 flex-1">
                      <CellButton
                        cell={cell}
                        canWrite={canWrite}
                        label={`${weekdayName(day)} — ${ar.timetable.period} ${period.periodNumber}`}
                        onClick={() => onOpen(day, period.periodNumber)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CellButton({
  cell,
  canWrite,
  label,
  onClick,
}: {
  cell: GridCell | undefined;
  canWrite: boolean;
  label: string;
  onClick: () => void;
}) {
  const content = cell ? (
    <>
      <span className="block truncate font-medium">{cell.subjectName}</span>
      <span className="text-muted-foreground block truncate text-xs">{cell.teacherName}</span>
    </>
  ) : (
    <span className="text-muted-foreground flex items-center gap-1 text-xs">
      {canWrite ? <Plus className="size-3" aria-hidden /> : null}
      {ar.timetable.emptyCell}
    </span>
  );

  if (!canWrite) {
    return <div className="min-h-12 p-2 text-start">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${cell ? ar.timetable.editSlot : ar.timetable.addSlot} — ${label}`}
      className="hover:bg-accent focus-visible:ring-ring min-h-12 w-full p-2 text-start focus-visible:ring-2 focus-visible:outline-none"
    >
      {content}
    </button>
  );
}
