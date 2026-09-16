"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  KeyRound,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Library,
  Loader2,
  Menu,
  ScrollText,
  Settings,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";
import type { NavIconKey, NavItem } from "./nav-items";

/**
 * The icon lookup lives on the client side of the boundary. Navigation data crosses
 * from a server component, and a React component is a function, which RSC cannot
 * serialize — so the server sends a key and this map turns it back into an icon.
 */
const ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  branches: Building2,
  users: UserCog,
  classes: Library,
  students: Users,
  teachers: GraduationCap,
  subjects: Library,
  timetable: CalendarDays,
  attendance: ClipboardCheck,
  payroll: Wallet,
  reports: FileText,
  audit: ScrollText,
  settings: Settings,
  key: KeyRound,
};

/**
 * One navigation list, rendered two ways: a fixed sidebar on desktop and a sheet on
 * mobile. Items are already filtered by permission on the server — this component
 * never sees a link the user may not follow.
 */
export function SidebarNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label={ar.nav.menu}>
      {items.map((item) => (
        <NavLink key={item.href} item={item} />
      ))}
    </nav>
  );
}

/**
 * The sheet closes when the route CHANGES, not when a link is tapped
 * (docs/UX-AUDIT-2026-09.md, finding 2).
 *
 * Closing on click meant that on a phone — which is where the teachers are, on the
 * connection this audit was about — a tap made the menu vanish and then nothing happened
 * until the page arrived. Now the menu stays, the tapped item spins, and it closes when
 * there is something to close onto.
 *
 * Keyed by the pathname rather than closed from an effect: `setState` inside an effect
 * is a cascading render, and React's own answer to "reset this state when X changes" is
 * a key. The same fix as the slot dialog in Phase 6.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return <MobileNavSheet key={pathname} items={items} />;
}

function MobileNavSheet({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={ar.nav.menu}>
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{ar.app.name}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-3" aria-label={ar.nav.menu}>
          {items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  // "/" would otherwise light up on every route, so it matches exactly.
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = ICONS[item.icon];

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        // min-height keeps every tap target at 44px on a phone (section 12).
        "min-h-11",
        isActive
          ? "bg-primary text-primary-foreground font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{item.label}</span>
      <NavSpinner />
    </Link>
  );
}

/**
 * The spinner on the item you just tapped (docs/UX-AUDIT-2026-09.md, finding 2).
 *
 * `useLinkStatus` reports the pending state of the Link it sits inside, so the feedback
 * lands on the thing that was clicked rather than on the page that has not arrived.
 *
 * This is here instead of a `loading.tsx`, which was the obvious answer and was tried
 * and reverted: a route-group loading file makes Next flush the shell before the page
 * has decided anything, and `notFound()` then arrives inside a response that has already
 * been sent as **200**. Eight of our own tests caught it. Returning 200 for a student in
 * another branch would undo the one thing docs/SECURITY-REVIEW.md leans on hardest.
 */
function NavSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className="ms-auto size-4 shrink-0 animate-spin" aria-hidden />;
}
