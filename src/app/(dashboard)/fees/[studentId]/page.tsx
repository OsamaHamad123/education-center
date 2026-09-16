import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ArrowRight } from "lucide-react";
import { getStudentStatement, StatementView } from "@/modules/fees";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.fees.statement };

/** One student's money, month by month (P5c). */
export default async function StatementPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  // An id that is not a UUID never reaches the database (PROJECT_PLAN 13.1).
  if (!z.uuid().safeParse(studentId).success) notFound();

  const user = await getSessionUser();
  if (!user) notFound();

  const statement = await getStudentStatement(studentId);
  // A student in another branch is a 404, never an explanation.
  if (!statement.ok) notFound();

  return (
    <>
      <PageHeader
        title={statement.data.fullName}
        description={`${ar.fees.statement} · ${statement.data.studentCode}`}
        action={
          <Button asChild variant="outline">
            <Link href="/fees">
              <ArrowRight className="size-4" aria-hidden />
              {ar.fees.title}
            </Link>
          </Button>
        }
      />
      <StatementView statement={statement.data} canCollect={hasPermission(user.role, "fee.collect")} />
    </>
  );
}
