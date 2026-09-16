import { Suspense } from "react";
import { getPortalView, PortalSignIn, PortalViewScreen, SignOutButton } from "@/modules/portal";
import { ar } from "@/shared/i18n/ar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

/**
 * The portal (docs/PARENT-PORTAL-PLAN.md, P2 and P3).
 *
 * Dynamic, always: this reads a session cookie and a child's record, and neither may be
 * cached anywhere between the database and the parent's phone.
 */
export const dynamic = "force-dynamic";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const view = await getPortalView(params);

  if (!view.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ar.portal.signInTitle}</CardTitle>
          <CardDescription>{ar.portal.signInHint}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* `useSearchParams` in the form's tree needs a boundary on a dynamic page. */}
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <PortalSignIn />
          </Suspense>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PortalViewScreen view={view.data} />
      </Suspense>
      <SignOutButton />
    </div>
  );
}
