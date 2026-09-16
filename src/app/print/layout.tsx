import { redirect } from "next/navigation";
import { getSessionUser } from "@/shared/auth/session";

/**
 * The `/print/*` area (PROJECT_PLAN section 12): no navigation, no branch banner, no
 * sidebar — just the sheet. Auth still applies; a print URL is not a back door, and
 * every page below re-checks permission and scope through its own query.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // The dashboard and teacher shells both stop here; this one did not, so a temporary
  // password still opened every print sheet (docs/AUDIT-2026-09.md, finding 8).
  if (user.mustChangePassword) redirect("/change-password");

  // No blanket teacher redirect, deliberately. A teacher prints their own week from
  // their portal and the register they just marked, so the gate belongs on the sheets
  // that are not theirs — see `/print/payroll`, which checks the role itself.
  return <div className="bg-white text-black">{children}</div>;
}
