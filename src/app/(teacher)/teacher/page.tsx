import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

/** Placeholder. Phase 9 builds today's sessions across every branch (rule 10.9). */
export default async function TeacherHomePage() {
  const user = await getSessionUser();
  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">
        {ar.dashboard.welcome}، {user.name}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>{ar.nav.teacherHome}</CardTitle>
          <CardDescription>{ar.dashboard.comingSoon}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
