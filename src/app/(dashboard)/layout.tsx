import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { BranchSwitcher, listVisibleBranches } from "@/modules/branches";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser, resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { MobileNav, SidebarNav } from "@/shared/ui/app-nav";
import { DASHBOARD_NAV } from "@/shared/ui/nav-items";
import { UserMenu } from "@/shared/ui/user-menu";

/**
 * Shell for the two admin roles (PROJECT_PLAN section 11). Everything here is decided
 * on the server: the nav is filtered before it is rendered, and the branch switcher is
 * not sent to the client at all unless the user may switch branches.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  // Teachers have their own, much smaller portal.
  if (user.role === "teacher") redirect("/teacher");

  const ctx = await resolveTenantContext();
  if (!ctx) redirect("/login");

  const navItems = DASHBOARD_NAV.filter(
    (item) => !item.permission || hasPermission(user.role, item.permission),
  );

  const canSwitchBranch = hasPermission(user.role, "branch.switch");
  // Safe to call for a branch admin too: RLS narrows this to their single branch.
  const branchesResult = await listVisibleBranches();
  const branches = branchesResult.ok ? branchesResult.data : [];
  const activeBranch = branches.find((b) => b.id === ctx.branchId) ?? null;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background sticky top-0 z-40 border-b">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <MobileNav items={navItems} />

          <Link href="/" className="font-bold tracking-tight">
            {ar.app.name}
          </Link>

          <div className="ms-auto flex items-center gap-2">
            {canSwitchBranch ? <BranchSwitcher branches={branches} selectedBranchId={ctx.branchId} /> : null}
            <UserMenu name={user.name} roleLabel={ar.roles[user.role]} />
          </div>
        </div>

        {canSwitchBranch && ctx.branchId === null ? (
          <div className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <p className="flex items-center gap-2 px-4 py-2 text-sm">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {ar.banners.allBranchesReadOnly}
            </p>
          </div>
        ) : activeBranch ? (
          <div className="bg-muted/60 px-4 py-1.5 text-sm">
            <span className="text-muted-foreground">{ar.banners.activeBranch}: </span>
            <span className="font-medium">{activeBranch.name}</span>
          </div>
        ) : null}
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-e lg:block">
          <SidebarNav items={navItems} />
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
