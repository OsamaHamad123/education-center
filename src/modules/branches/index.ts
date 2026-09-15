/**
 * Public API of the `branches` module — الفروع.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/branches/domain|application|infrastructure|ui` from outside this module.
 */
export { listVisibleBranches, type BranchOption } from "./application/queries/list-branches";
export { listBranchesForAdmin, type BranchWithCounts } from "./application/queries/list-branches-admin";
export { selectBranch } from "./application/use-cases/select-branch";
export { createBranch, editBranch, setBranchActive } from "./application/use-cases/manage-branch";
export { BranchSwitcher } from "./ui/branch-switcher";
export { BranchesTable } from "./ui/branches-table";
export { BranchFormDialog } from "./ui/branch-form";
