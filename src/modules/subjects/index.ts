/**
 * Public API of the `subjects` module — المواد الدراسية.
 *
 * Other modules may import from this file ONLY.
 */
export { listSubjectsForAdmin, type SubjectWithUsage } from "./application/queries/list-subjects";
export { createSubject, renameSubject, setSubjectActive } from "./application/use-cases/manage-subject";
export { SubjectsTable } from "./ui/subjects-table";
export { SubjectFormDialog } from "./ui/subject-form";
