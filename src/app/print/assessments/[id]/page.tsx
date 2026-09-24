import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { getScoreSheet, ScoreSheetPrint } from "@/modules/assessments";
import { listVisibleBranches } from "@/modules/branches";
import { getCenterIdentity } from "@/modules/settings";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.assessments.title };

/**
 * كشف درجات for one paper.
 *
 * Addressed by assessment id and read through `getScoreSheet`, so the same RLS that
 * decides who may see the screen decides who may print it — a paper in another branch
 * is a 404 here exactly as it is there.
 */
export default async function PrintScoreSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [sheet, identity, branches] = await Promise.all([
    getScoreSheet(id),
    getCenterIdentity(),
    listVisibleBranches(),
  ]);
  if (!sheet.ok || !identity.ok) notFound();

  const branchName =
    (branches.ok ? branches.data.find((branch) => branch.id === sheet.data.assessment.branchId) : null)
      ?.name ?? null;

  return (
    <ScoreSheetPrint
      sheet={sheet.data}
      centerName={identity.data.centerName}
      logoPath={identity.data.logoPath}
      branchName={branchName}
    />
  );
}
