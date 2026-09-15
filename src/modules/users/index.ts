/**
 * Public API of the `users` module — المستخدمون وحسابات مديري الفروع.
 *
 * Other modules may import from this file ONLY.
 */
export { listBranchAdminsForAdmin, type BranchAdminRow } from "./application/queries/list-branch-admins";
export {
  createBranchAdmin,
  resetBranchAdminPassword,
  setBranchAdminActive,
} from "./application/use-cases/manage-branch-admin";
export { BranchAdminsTable } from "./ui/branch-admins-table";
export { CreateBranchAdminDialog } from "./ui/create-branch-admin";
