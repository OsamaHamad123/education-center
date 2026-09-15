/**
 * Validation for the center logo upload. Pure: it takes facts about a file, not a File.
 *
 * An upload endpoint is an attack surface, so this is an allowlist, not a blocklist —
 * anything not explicitly permitted is rejected.
 */

export const MAX_LOGO_BYTES = 512 * 1024;

export const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export type LogoRejection = "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE";

export function validateLogo(file: { size: number; type: string }): LogoRejection | null {
  if (file.size === 0) return "EMPTY";
  if (file.size > MAX_LOGO_BYTES) return "TOO_LARGE";
  if (!ALLOWED_LOGO_TYPES.includes(file.type as (typeof ALLOWED_LOGO_TYPES)[number])) {
    return "UNSUPPORTED_TYPE";
  }
  return null;
}

/**
 * The stored filename is derived, never taken from the upload: a user-supplied name
 * could contain path separators and escape the uploads directory.
 */
export function logoFileName(contentType: string, token: string): string {
  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/jpeg"
        ? "jpg"
        : contentType === "image/webp"
          ? "webp"
          : "svg";
  return `logo-${token}.${extension}`;
}
