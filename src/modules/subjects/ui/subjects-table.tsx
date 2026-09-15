"use client";

import { useRouter } from "next/navigation";
import { Pencil, Power, PowerOff } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DataTable } from "@/shared/ui/data-table";
import type { AppColumnDef } from "@/shared/ui/table-hook";
import { setSubjectActive } from "../application/use-cases/manage-subject";
import type { SubjectWithUsage } from "../application/queries/list-subjects";
import { SubjectFormDialog } from "./subject-form";

export function SubjectsTable({ subjects }: { subjects: SubjectWithUsage[] }) {
  const router = useRouter();

  const columns: AppColumnDef<SubjectWithUsage>[] = [
    { accessorKey: "name", header: ar.subjects.name },
    { accessorKey: "slotCount", header: ar.subjects.inTimetable },
    { accessorKey: "sessionCount", header: ar.subjects.inSessions },
    {
      accessorKey: "isActive",
      header: ar.branches.status,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>
          {row.original.isActive ? ar.common.active : ar.common.inactive}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <RowActions subject={row.original} onDone={() => router.refresh()} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={subjects}
      getRowId={(subject) => subject.id}
      searchColumn="name"
      searchPlaceholder={ar.subjects.name}
      emptyTitle={ar.subjects.empty}
      renderCard={(subject) => (
        <Card>
          <CardContent className="flex items-start justify-between gap-3 pt-4">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{subject.name}</p>
              <p className="text-muted-foreground text-sm">
                {ar.subjects.inTimetable}: {subject.slotCount} · {ar.subjects.inSessions}:{" "}
                {subject.sessionCount}
              </p>
            </div>
            <RowActions subject={subject} onDone={() => router.refresh()} />
          </CardContent>
        </Card>
      )}
    />
  );
}

function RowActions({ subject, onDone }: { subject: SubjectWithUsage; onDone: () => void }) {
  const toggleLabel = subject.isActive ? ar.branches.deactivate : ar.branches.activate;

  return (
    <div className="flex shrink-0 gap-1">
      <SubjectFormDialog
        subject={subject}
        trigger={
          <Button variant="ghost" size="icon" aria-label={ar.common.edit + " " + subject.name}>
            <Pencil className="size-4" aria-hidden />
          </Button>
        }
      />
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon" aria-label={toggleLabel + " " + subject.name}>
            {subject.isActive ? (
              <PowerOff className="size-4" aria-hidden />
            ) : (
              <Power className="size-4" aria-hidden />
            )}
          </Button>
        }
        title={subject.isActive ? ar.subjects.deactivateTitle : ar.subjects.activateTitle}
        description={subject.isActive ? ar.subjects.deactivateDescription : ar.subjects.activateDescription}
        confirmLabel={toggleLabel}
        destructive={subject.isActive}
        successMessage={ar.subjects.statusChanged}
        onConfirm={async () => {
          const result = await setSubjectActive({ id: subject.id, isActive: !subject.isActive });
          if (result.ok) onDone();
          return result;
        }}
      />
    </div>
  );
}
