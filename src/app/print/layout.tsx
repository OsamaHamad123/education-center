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

  return <div className="bg-white text-black">{children}</div>;
}
