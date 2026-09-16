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
export { getPublicCenterInfo, type PublicCenterInfo } from "./application/queries/public-info";
export { currentTermRange, getTerms, listPublicTerms, type TermsView } from "./application/queries/get-terms";
export { defaultTerm, termOn, termRangeFor, type Term } from "./domain/terms";
export { createTerm, deleteTerm, editTerm } from "./application/use-cases/manage-terms";
export { updateCenterSettings, uploadCenterLogo } from "./application/use-cases/update-settings";
export { updateSettingsSchema } from "./application/schemas";
export { SettingsForm } from "./ui/settings-form";
export { TermsCard } from "./ui/terms-card";
