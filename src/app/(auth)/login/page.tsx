import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Card, CardContent } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: ar.auth.loginTitle };

export default async function LoginPage() {
  // Already signed in: send them to their own area rather than showing the form again.
  const user = await getSessionUser();
  if (user) redirect(user.role === "teacher" ? "/teacher" : "/");

  return (
    <Card>
      <CardContent className="pt-6">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
