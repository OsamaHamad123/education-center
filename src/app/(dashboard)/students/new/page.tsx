import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listClassOptions } from "@/modules/classes";
import { StudentForm } from "@/modules/students";
import { resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.students.add };

export default async function NewStudentPage() {
  const ctx = await resolveTenantContext();
  const classes = await listClassOptions();
  if (!ctx || !classes.ok) notFound();

  // Enrolling writes to one branch, so "كافة الفروع" has nowhere to put them.
  if (!ctx.branchId) {
    return (
      <>
        <PageHeader title={ar.students.add} />
        <EmptyState title={ar.errors.BRANCH_REQUIRED} />
      </>
    );
  }

  if (classes.data.length === 0) {
    return (
      <>
        <PageHeader title={ar.students.add} />
        <EmptyState title={ar.classes.empty} description={ar.classes.emptyHint} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={ar.students.add} description={ar.students.description} />
      <StudentForm classes={classes.data} />
    </>
  );
}
