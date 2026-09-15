import { ar } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

/**
 * Placeholder home page for Phase 0. Phase 2 replaces this with the real dashboard
 * behind authentication.
 */
export default function HomePage() {
  const areas = [
    ar.entities.branches,
    ar.entities.classes,
    ar.entities.students,
    ar.entities.teachers,
    ar.entities.timetable,
    ar.entities.attendance,
    ar.entities.payroll,
    ar.entities.reports,
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="space-y-2">
        <Badge variant="secondary">المرحلة 0 — التأسيس</Badge>
        <h1 className="text-3xl font-bold tracking-tight">{ar.app.name}</h1>
        <p className="text-muted-foreground">{ar.app.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الوحدات المخطط لها</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {areas.map((area) => (
              <li key={area} className="bg-muted/50 rounded-md px-3 py-2">
                {area}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
