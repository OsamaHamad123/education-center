import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, BarChart3, CalendarRange, Grid3x3, TriangleAlert } from "lucide-react";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.reports.title };

const ICONS = {
  students: CalendarRange,
  matrix: Grid3x3,
  alerts: TriangleAlert,
  money: Banknote,
  branches: BarChart3,
} as const;

/** The reports index (rule 10.7). Cross-branch comparison is super-admin only. */
export default async function ReportsPage() {
  const user = await getSessionUser();
  if (!user) notFound();

  const cards = [
    {
      key: "students" as const,
      href: "/reports/students",
      title: ar.reports.studentAttendance,
      description: ar.reports.studentAttendanceDescription,
    },
    {
      key: "matrix" as const,
      href: "/reports/matrix",
      title: ar.reports.classMatrix,
      description: ar.reports.classMatrixDescription,
    },
    {
      key: "alerts" as const,
      href: "/reports/alerts",
      title: ar.reports.absenceAlerts,
      description: ar.reports.absenceAlertsDescription,
    },
    // A branch admin has no comparison card at all — nothing disabled, nothing
    // hinting that other branches exist to compare against. The money card is the
    // same: another branch's takings are not theirs to know about.
    ...(hasPermission(user.role, "report.cross_branch")
      ? [
          {
            key: "branches" as const,
            href: "/reports/branches",
            title: ar.reports.comparison,
            description: ar.reports.comparisonDescription,
          },
          {
            key: "money" as const,
            href: "/reports/money",
            title: ar.money.title,
            description: ar.money.description,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title={ar.reports.title} description={ar.reports.description} />
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = ICONS[card.key];
          return (
            <Card key={card.href} className="hover:bg-accent/40 transition-colors">
              <Link href={card.href} className="block">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4" aria-hidden />
                    {card.title}
                  </CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
              </Link>
            </Card>
          );
        })}
      </div>
    </>
  );
}
