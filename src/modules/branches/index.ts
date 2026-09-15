/**
 * Public API of the `branches` module — الفروع.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/branches/domain|application|infrastructure|ui` from outside this module.
 */
export { listVisibleBranches, type BranchOption } from "./application/queries/list-branches";
export { selectBranch } from "./application/use-cases/select-branch";
export { BranchSwitcher } from "./ui/branch-switcher";
