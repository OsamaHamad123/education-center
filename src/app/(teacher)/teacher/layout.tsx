import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { MobileNav, SidebarNav } from "@/shared/ui/app-nav";
import { TEACHER_NAV } from "@/shared/ui/nav-items";
import { UserMenu } from "@/shared/ui/user-menu";

/**
 * The teacher portal shell (PROJECT_PLAN 10.9). Admins are sent to the dashboard —
 * this area has no branch switcher because a teacher's scope comes from
 * `teacher_branches`, not from a selection they make.
 */
export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "teacher") redirect("/");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-background sticky top-0 z-40 border-b">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <MobileNav items={TEACHER_NAV} />
          <Link href="/teacher" className="font-bold tracking-tight">
            {ar.app.name}
          </Link>
          <div className="ms-auto">
            <UserMenu name={user.name} roleLabel={ar.roles.teacher} />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-e lg:block">
          <SidebarNav items={TEACHER_NAV} />
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
