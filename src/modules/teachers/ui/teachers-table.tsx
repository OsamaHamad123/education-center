"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, Pencil, Power, PowerOff } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import type { BranchOption } from "@/modules/branches";
import { formatEGP } from "@/shared/lib/money";
import { formatPhoneForDisplay } from "@/shared/lib/phone";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DataTable } from "@/shared/ui/data-table";
import type { AppColumnDef } from "@/shared/ui/table-hook";
import { resetTeacherAccessCode, setTeacherStatus } from "../application/use-cases/manage-teacher";
import type { TeacherRow } from "../application/queries/list-teachers";
import { AccessCodeDialog } from "./access-code-dialog";
import { TeacherFormDialog } from "./teacher-form";

export function TeachersTable({
  teachers,
  branches,
  canManage,
}: {
  teachers: TeacherRow[];
  branches: BranchOption[];
  /** Rates and the access code are super-admin only (section 3). */
  canManage: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState<{ phone: string; accessCode: string } | null>(null);

  const columns: AppColumnDef<TeacherRow>[] = [
    {
      accessorKey: "fullName",
      header: ar.teachers.fullName,
      cell: ({ row }) => (
        <Link href={`/teachers/${row.original.id}`} className="font-medium hover:underline">
          {row.original.fullName}
        </Link>
      ),
    },
    {
      accessorKey: "phone",
      header: ar.teachers.phone,
      cell: ({ row }) => (
        <span className="font-mono text-xs" dir="ltr">
          {formatPhoneForDisplay(row.original.phone)}
        </span>
      ),
    },
    { accessorKey: "specialization", header: ar.teachers.specialization },
    ...(canManage
      ? ([
          {
            id: "rates",
            header: ar.teachers.rates,
            cell: ({ row }) => (
              <span className="text-sm" dir="ltr">
                {formatEGP(row.original.ratePiastersScientific)} /{" "}
                {formatEGP(row.original.ratePiastersLiterary)}
              </span>
            ),
          },
        ] satisfies AppColumnDef<TeacherRow>[])
      : []),
    { accessorKey: "branchCount", header: ar.teachers.branchCount },
    {
      accessorKey: "status",
      header: ar.teachers.status,
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "secondary" : "outline"}>
          {row.original.status === "active" ? ar.common.active : ar.common.inactive}
        </Badge>
      ),
    },
    ...(canManage
      ? ([
          {
            id: "actions",
            header: "",
            cell: ({ row }) => (
              <RowActions
                teacher={row.original}
                branches={branches}
                onCode={setCode}
                onDone={() => router.refresh()}
              />
            ),
          },
        ] satisfies AppColumnDef<TeacherRow>[])
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={teachers}
        getRowId={(teacher) => teacher.id}
        searchColumn="fullName"
        searchPlaceholder={ar.teachers.fullName}
        emptyTitle={ar.teachers.empty}
        emptyDescription={ar.teachers.emptyHint}
        renderCard={(teacher) => (
          <Card>
            <CardContent className="flex items-start justify-between gap-3 pt-4">
              <div className="min-w-0 space-y-1">
                <Link href={`/teachers/${teacher.id}`} className="font-medium hover:underline">
                  {teacher.fullName}
                </Link>
                <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                  {formatPhoneForDisplay(teacher.phone)}
                </p>
                <p className="text-muted-foreground text-sm">
                  {teacher.specialization} · {ar.teachers.branchCount}: {teacher.branchCount}
                </p>
                {canManage ? (
                  <p className="text-muted-foreground text-sm" dir="ltr">
                    {formatEGP(teacher.ratePiastersScientific)} / {formatEGP(teacher.ratePiastersLiterary)}
                  </p>
                ) : null}
              </div>
              {canManage ? (
                <RowActions
                  teacher={teacher}
                  branches={branches}
                  onCode={setCode}
                  onDone={() => router.refresh()}
                />
              ) : null}
            </CardContent>
          </Card>
        )}
      />

      <AccessCodeDialog value={code} onClose={() => setCode(null)} />
    </>
  );
}

function RowActions({
  teacher,
  branches,
  onCode,
  onDone,
}: {
  teacher: TeacherRow;
  branches: BranchOption[];
  onCode: (value: { phone: string; accessCode: string }) => void;
  onDone: () => void;
}) {
  const isActive = teacher.status === "active";
  const toggleLabel = isActive ? ar.branches.deactivate : ar.branches.activate;

  return (
    <div className="flex shrink-0 gap-1">
      <TeacherFormDialog
        teacher={teacher}
        branches={branches}
        trigger={
          <Button variant="ghost" size="icon" aria-label={ar.common.edit + " " + teacher.fullName}>
            <Pencil className="size-4" aria-hidden />
          </Button>
        }
      />

      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={ar.teachers.resetAccessCode + " " + teacher.fullName}
          >
            <KeyRound className="size-4" aria-hidden />
          </Button>
        }
        title={ar.teachers.resetTitle}
        description={ar.teachers.resetDescription}
        confirmLabel={ar.teachers.resetAccessCode}
        successMessage={ar.teachers.codeReset}
        onConfirm={async () => {
          const result = await resetTeacherAccessCode({ id: teacher.id });
          if (result.ok) {
            onCode({ phone: result.data.phone, accessCode: result.data.accessCode });
            onDone();
          }
          return result;
        }}
      />

      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon" aria-label={toggleLabel + " " + teacher.fullName}>
            {isActive ? (
              <PowerOff className="size-4" aria-hidden />
            ) : (
              <Power className="size-4" aria-hidden />
            )}
          </Button>
        }
        title={isActive ? ar.users.deactivateTitle : ar.users.activateTitle}
        description={isActive ? ar.users.deactivateDescription : ar.users.activateDescription}
        confirmLabel={toggleLabel}
        destructive={isActive}
        successMessage={ar.teachers.statusChanged}
        onConfirm={async () => {
          const result = await setTeacherStatus({
            id: teacher.id,
            status: isActive ? "inactive" : "active",
          });
          if (result.ok) onDone();
          return result;
        }}
      />
    </div>
  );
}
