"use client";

import Link from "next/link";
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

export function MobileNav({ items }: { items: NavItem[] }) {
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
            <NavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  // "/" would otherwise light up on every route, so it matches exactly.
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = ICONS[item.icon];

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
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
    </Link>
  );
}
