"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAction } from "@/shared/actions/create-action";
import { requestMetadata, writeAuditLog } from "@/shared/actions/audit";
import { requirePermission } from "@/shared/actions/create-action";
import { centerSettings, type CenterSettings } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { logoFileName, MAX_LOGO_BYTES, validateLogo } from "../../domain/logo";
import { saveSettings } from "../../infrastructure/settings.repository";
import { updateSettingsSchema } from "../schemas";

export const updateCenterSettings = createAction({
  permission: "settings.manage",
  schema: updateSettingsSchema,
  requireBranch: false,
  audit: { action: "update", entity: "center_settings", entityId: (s: CenterSettings) => s.id },
  revalidate: { paths: ["/settings", "/"] },
  handler: async ({ tx, ctx, input }) => {
    const updated = await saveSettings(ctx, tx, input);
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});

/**
 * Logo upload. Not a `createAction` because the payload is multipart FormData, which
 * a Zod object schema cannot describe — the validation it needs is the domain's
 * allowlist instead.
 *
 * Writing to `public/uploads` works for a single-container deployment (section 13.3).
 * A multi-instance deployment needs object storage; that is Phase 10's problem, and
 * this function is the one place it would have to change.
 */
export async function uploadCenterLogo(formData: FormData): Promise<Result<{ logoPath: string }>> {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) return auth;

  const file = formData.get("logo");
  if (!(file instanceof File)) return err("VALIDATION_ERROR", ar.settings.logoMissing);

  const rejection = validateLogo({ size: file.size, type: file.type });
  if (rejection === "EMPTY") return err("VALIDATION_ERROR", ar.settings.logoMissing);
  if (rejection === "TOO_LARGE") return err("VALIDATION_ERROR", ar.settings.logoTooLarge);
  if (rejection === "UNSUPPORTED_TYPE") return err("VALIDATION_ERROR", ar.settings.logoBadType);

  // Guard again after reading: `file.size` is client-reported metadata.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) {
    return err("VALIDATION_ERROR", ar.settings.logoTooLarge);
  }

  const fileName = logoFileName(file.type, randomUUID());
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), bytes);

  const logoPath = `/uploads/${fileName}`;

  await withTenant(auth.data, async (tx) => {
    await tx.update(centerSettings).set({ logoPath, updatedAt: new Date() });
    await writeAuditLog(
      tx,
      auth.data,
      { action: "update", entity: "center_settings.logo", entityId: logoPath },
      await requestMetadata(),
    );
  });

  return ok({ logoPath });
}
