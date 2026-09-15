"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Loader2, RotateCcw, UserCog } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import type { AppError } from "@/shared/lib/result";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DataTable } from "@/shared/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { AppColumnDef } from "@/shared/ui/table-hook";
import type { SessionLogRow } from "../application/queries/list-sessions";
import { cancelSession, restoreSession, setSubstituteTeacher } from "../application/use-cases/manage-session";

/**
 * The sessions log (`/attendance/sessions`). What actually ran, and the three things
 * an admin does to it afterwards: cancel, substitute, restore.
 */
export function SessionsTable({
  rows,
  teachers,
  canManage,
}: {
  rows: SessionLogRow[];
  teachers: { id: string; fullName: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [substituteFor, setSubstituteFor] = useState<SessionLogRow | null>(null);

  const columns: AppColumnDef<SessionLogRow>[] = [
    {
      accessorKey: "sessionDate",
      header: ar.attendance.date,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDisplayDate(row.original.sessionDate)}</span>
      ),
    },
    {
      accessorKey: "className",
      header: ar.attendance.classLabel,
      cell: ({ row }) => (
        <Link
          href={`/attendance?classId=${row.original.classId}&date=${row.original.sessionDate}`}
          className="font-medium hover:underline"
        >
          {row.original.className}
        </Link>
      ),
    },
    { accessorKey: "subjectName", header: ar.attendance.subject },
    { accessorKey: "teacherName", header: ar.attendance.teacher },
    {
      id: "period",
      header: ar.attendance.period,
      cell: ({ row }) => (
        <span dir="ltr" className="whitespace-nowrap">
          {row.original.periodNumber} · {row.original.startTime.slice(0, 5)}
        </span>
      ),
    },
    {
      id: "marks",
      header: ar.attendance.marked,
      cell: ({ row }) => <MarksBadge row={row.original} />,
    },
    {
      accessorKey: "status",
      header: ar.attendance.status,
      cell: ({ row }) => <StatusBadge row={row.original} />,
    },
    ...(canManage
      ? ([
          {
            id: "actions",
            header: "",
            cell: ({ row }) => (
              <RowActions
                row={row.original}
                onSubstitute={() => setSubstituteFor(row.original)}
                onDone={() => router.refresh()}
              />
            ),
          },
        ] satisfies AppColumnDef<SessionLogRow>[])
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        searchColumn="className"
        searchPlaceholder={ar.attendance.classLabel}
        emptyTitle={ar.attendance.noSessions}
        emptyDescription={ar.attendance.noSessionsHint}
        renderCard={(row) => (
          <Card>
            <CardContent className="flex items-start justify-between gap-3 pt-4">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{row.subjectName}</p>
                <p className="text-muted-foreground text-sm">
                  {row.className} · {row.teacherName}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDisplayDate(row.sessionDate)} · {ar.attendance.period} {row.periodNumber}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <MarksBadge row={row} />
                  <StatusBadge row={row} />
                </div>
              </div>
              {canManage ? (
                <RowActions
                  row={row}
                  onSubstitute={() => setSubstituteFor(row)}
                  onDone={() => router.refresh()}
                />
              ) : null}
            </CardContent>
          </Card>
        )}
      />

      <SubstituteDialog
        session={substituteFor}
        teachers={teachers}
        onClose={() => setSubstituteFor(null)}
        onDone={() => {
          setSubstituteFor(null);
          router.refresh();
        }}
      />
    </>
  );
}

function MarksBadge({ row }: { row: SessionLogRow }) {
  if (row.markedCount === 0) return <Badge variant="outline">{ar.attendance.unmarked}</Badge>;
  return (
    <Badge variant="secondary" dir="ltr">
      {row.markedCount}
      {row.absentCount > 0 ? ` · ${ar.attendanceStatus.absent} ${row.absentCount}` : ""}
    </Badge>
  );
}

function StatusBadge({ row }: { row: SessionLogRow }) {
  if (row.status === "cancelled") {
    return (
      <Badge variant="destructive" title={row.cancelReason ?? undefined}>
        {ar.attendance.cancelledBadge}
      </Badge>
    );
  }
  return row.isExtra ? <Badge variant="outline">{ar.attendance.extraBadge}</Badge> : null;
}

function RowActions({
  row,
  onSubstitute,
  onDone,
}: {
  row: SessionLogRow;
  onSubstitute: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${ar.attendance.substitute} — ${row.subjectName}`}
        onClick={onSubstitute}
      >
        <UserCog className="size-4" aria-hidden />
      </Button>

      {row.status === "cancelled" ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon" aria-label={`${ar.attendance.restore} — ${row.subjectName}`}>
              <RotateCcw className="size-4" aria-hidden />
            </Button>
          }
          title={ar.attendance.restoreTitle}
          description={ar.attendance.restoreDescription}
          confirmLabel={ar.attendance.restore}
          successMessage={ar.attendance.restored}
          onConfirm={async () => {
            const result = await restoreSession({ sessionId: row.id });
            if (result.ok) onDone();
            return result;
          }}
        />
      ) : (
        <CancelSessionButton row={row} onDone={onDone} />
      )}
    </div>
  );
}

function CancelSessionButton({ row, onDone }: { row: SessionLogRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);
  const [reason, setReason] = useState("");

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelSession({ sessionId: row.id, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(ar.attendance.cancelled);
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${ar.attendance.cancel} — ${row.subjectName}`}
        onClick={() => setOpen(true)}
      >
        <Ban className="size-4" aria-hidden />
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.attendance.cancelTitle}</DialogTitle>
          <DialogDescription>{ar.attendance.cancelDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="cancel-reason">{ar.attendance.cancelReason}</Label>
          <Input
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isPending}
            maxLength={300}
            autoFocus
          />
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error.fieldErrors?.reason?.[0] ?? error.message}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending || reason.trim().length < 3}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.attendance.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubstituteDialog({
  session,
  teachers,
  onClose,
  onDone,
}: {
  session: SessionLogRow | null;
  teachers: { id: string; fullName: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);
  const [teacherId, setTeacherId] = useState("");

  function onConfirm() {
    if (!session) return;
    setError(null);
    startTransition(async () => {
      const result = await setSubstituteTeacher({ sessionId: session.id, teacherId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(ar.attendance.substituted);
      setTeacherId("");
      onDone();
    });
  }

  return (
    <Dialog open={session !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.attendance.substituteTitle}</DialogTitle>
          <DialogDescription>{ar.attendance.substituteDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="substitute-teacher">{ar.attendance.teacher}</Label>
          <Select value={teacherId} onValueChange={setTeacherId} disabled={isPending}>
            <SelectTrigger id="substitute-teacher" className="w-full">
              <SelectValue placeholder={ar.attendance.teacher} />
            </SelectTrigger>
            <SelectContent>
              {teachers
                .filter((teacher) => teacher.id !== session?.teacherId)
                .map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.fullName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error.message}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {ar.common.cancel}
          </Button>
          <Button onClick={onConfirm} disabled={isPending || !teacherId}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {ar.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
