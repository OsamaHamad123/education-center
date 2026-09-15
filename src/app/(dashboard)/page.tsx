import { getSessionUser, resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { permissionsFor } from "@/shared/auth/permissions";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

/**
 * Dashboard placeholder. Phase 8 replaces the body with the real KPIs (rule 10.7);
 * what it proves today is that the session, role and tenant scope all resolve.
 */
export default async function DashboardPage() {
  const user = await getSessionUser();
  const ctx = await resolveTenantContext();
  if (!user || !ctx) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {ar.dashboard.welcome}، {user.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ar.roles[user.role]} · {ctx.branchId ? ar.banners.activeBranch : ar.nav.allBranches}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ar.entities.reports}</CardTitle>
          <CardDescription>{ar.dashboard.comingSoon}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {permissionsFor(user.role).map((permission) => (
              <Badge key={permission} variant="outline" className="font-mono text-xs">
                {permission}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
