"use client";

import { useRouter } from "next/navigation";
import { Link2, Unlink } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { setTeacherBranchLink } from "../application/use-cases/manage-teacher";

/** Unlinking hides the teacher from a branch's lists; their timetable and past sessions stay. */
export function BranchLinkToggle({
  teacherId,
  branchId,
  isActive,
}: {
  teacherId: string;
  branchId: string;
  isActive: boolean;
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          {isActive ? <Unlink className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
          {isActive ? ar.teachers.unlink : ar.teachers.relink}
        </Button>
      }
      title={isActive ? ar.teachers.unlinkTitle : ar.teachers.linkTitle}
      description={isActive ? ar.teachers.unlinkDescription : ar.teachers.linkDescription}
      confirmLabel={isActive ? ar.teachers.unlink : ar.teachers.relink}
      destructive={isActive}
      successMessage={ar.teachers.unlinked}
      onConfirm={async () => {
        const result = await setTeacherBranchLink({ id: teacherId, branchId, isActive: !isActive });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
