/**
 * Public API of the `portal` module — بوابة ولي الأمر.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/portal/domain|application|infrastructure|ui` from outside this module.
 */
export { PORTAL_SESSION, defaultRange, rangeIsSane, MAX_RANGE_DAYS } from "./domain/session";
export { currentParent, signInToPortal, signOutOfPortal } from "./application/use-cases/portal-session";
export { getPortalChildren, getPortalView, type PortalView } from "./application/queries/get-portal";
export { PortalSignIn } from "./ui/portal-sign-in";
export { PortalView as PortalViewScreen } from "./ui/portal-view";
export { SignOutButton } from "./ui/sign-out-button";
