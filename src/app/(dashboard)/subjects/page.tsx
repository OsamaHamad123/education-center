import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listSubjectsForAdmin, SubjectFormDialog, SubjectsTable } from "@/modules/subjects";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.subjects.title };

export default async function SubjectsPage() {
  const result = await listSubjectsForAdmin();
  if (!result.ok) notFound();

  return (
    <>
      <PageHeader
        title={ar.subjects.title}
        description={ar.subjects.description}
        action={
          <SubjectFormDialog
            trigger={
              <Button>
                <Plus className="size-4" aria-hidden />
                {ar.subjects.add}
              </Button>
            }
          />
        }
      />
      <SubjectsTable subjects={result.data} />
    </>
  );
}
