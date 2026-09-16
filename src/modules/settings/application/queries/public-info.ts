import { loadPublicSettings } from "../../infrastructure/settings.repository";

/**
 * What an anonymous visitor may know about the centre: its name, its logo, and
 * whether the lookup is open. Nothing else, and no session required.
 *
 * Deliberately not a `Result`: there is no failure mode a visitor could act on, and
 * a closed default is the safe one.
 */
export type PublicCenterInfo = {
  centerName: string;
  logoPath: string | null;
  lookupEnabled: boolean;
  /** Whether the portal's master switch is on at all (P7). Per-branch gating is in SQL. */
  portalEnabled: boolean;
};

export async function getPublicCenterInfo(): Promise<PublicCenterInfo> {
  return loadPublicSettings();
}
