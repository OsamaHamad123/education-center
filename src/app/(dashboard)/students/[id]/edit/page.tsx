import { notFound } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { listClassOptions } from "@/modules/classes";
import { getStudentProfile, StudentForm } from "@/modules/students";
import { ar } from "@/shared/i18n/ar";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.students.edit };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A non-UUID segment would reach Postgres, fail to cast and surface as a 500 —
  // an error page nobody wrote, and a difference an attacker can measure against
  // the 404 a foreign id gets (docs/SECURITY-REVIEW.md, finding 5).
  if (!z.uuid().safeParse(id).success) notFound();
  const profile = await getStudentProfile(id);
  if (!profile.ok) notFound();

  // A branch that no longer holds this student may read them, not edit them.
  if (profile.data.transferredOut) notFound();

  const classes = await listClassOptions(profile.data.student.branchId);

  return (
    <>
      <PageHeader title={ar.students.edit} description={profile.data.student.studentCode} />
      <StudentForm classes={classes.ok ? classes.data : []} student={profile.data.student} />
    </>
  );
}
