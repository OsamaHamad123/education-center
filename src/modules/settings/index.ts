/**
 * Public API of the `settings` module — إعدادات المركز.
 *
 * Other modules may import from this file ONLY.
 */
export {
  getCenterIdentity,
  getCenterSettings,
  type CenterIdentity,
} from "./application/queries/get-settings";
export { updateCenterSettings, uploadCenterLogo } from "./application/use-cases/update-settings";
export { updateSettingsSchema } from "./application/schemas";
export { SettingsForm } from "./ui/settings-form";
