import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { listVisibleBranches } from "@/modules/branches";
import { getReceipt, ReceiptPrint } from "@/modules/fees";
import { getCenterIdentity } from "@/modules/settings";
import { resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.fees.receipt };

/** The paper a family is handed (P5c). */
export default async function PrintReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const ctx = await resolveTenantContext();
  if (!ctx) notFound();

  const [receipt, identity, branches] = await Promise.all([
    getReceipt(id),
    getCenterIdentity(),
    listVisibleBranches(),
  ]);
  // A receipt from another branch is invisible under RLS, so this is a 404.
  if (!receipt.ok || !identity.ok) notFound();

  const branchName =
    (ctx.branchId && branches.ok ? branches.data.find((b) => b.id === ctx.branchId) : null)?.name ?? null;

  return (
    <ReceiptPrint
      receipt={receipt.data}
      centerName={identity.data.centerName}
      logoPath={identity.data.logoPath}
      branchName={branchName}
    />
  );
}
