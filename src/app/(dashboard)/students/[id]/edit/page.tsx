import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listClassOptions } from "@/modules/classes";
import { getStudentProfile, StudentForm } from "@/modules/students";
import { ar } from "@/shared/i18n/ar";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.students.edit };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
