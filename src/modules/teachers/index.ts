/**
 * Public API of the `teachers` module — المعلمون وأجورهم.
 *
 * Other modules may import from this file ONLY.
 */
export { listTeachersForViewer, type TeacherRow } from "./application/queries/list-teachers";
export { getTeacherProfile, type TeacherProfile } from "./application/queries/get-teacher";
export {
  createTeacher,
  editTeacher,
  linkTeacherByPhone,
  resetTeacherAccessCode,
  setTeacherBranchLink,
  setTeacherStatus,
} from "./application/use-cases/manage-teacher";
export { TeachersTable } from "./ui/teachers-table";
export { TeacherFormDialog } from "./ui/teacher-form";
export { LinkTeacherDialog } from "./ui/link-teacher-dialog";
export { TeacherProfileView } from "./ui/teacher-profile";
