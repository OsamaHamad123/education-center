/**
 * Public API of the `students` module — الطلاب وقيودهم.
 *
 * Other modules may import from this file ONLY.
 */
export { listStudentsPage, type StudentsPage, type StudentRow } from "./application/queries/list-students";
export { getStudentProfile, type StudentProfile } from "./application/queries/get-student";
export {
  archiveStudent,
  changeStudentClass,
  createStudent,
  editStudent,
  restoreStudent,
  transferStudentBranch,
} from "./application/use-cases/manage-student";
export {
  exportStudentsCsv,
  importStudents,
  previewStudentImport,
  type ImportPreview,
  type ImportRowResult,
} from "./application/use-cases/import-students";
export { StudentsTable } from "./ui/students-table";
export { StudentsFilters } from "./ui/students-filters";
export { StudentForm } from "./ui/student-form";
export { StudentProfileView } from "./ui/student-profile";
export { ImportStudentsDialog } from "./ui/import-students-dialog";
