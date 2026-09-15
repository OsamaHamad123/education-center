import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: ar.auth.changePasswordTitle };

/**
 * Admin accounts are created with a temporary password and must change it before
 * they can do anything else (PROJECT_PLAN section 9). The dashboard layout redirects
 * here while `mustChangePassword` is set, so this page is the only way forward.
 */
export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect(user.role === "teacher" ? "/teacher" : "/");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar.auth.changePasswordTitle}</CardTitle>
        <CardDescription>{ar.auth.changePasswordHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm />
      </CardContent>
    </Card>
  );
}
