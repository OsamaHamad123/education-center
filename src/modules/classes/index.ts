/**
 * Public API of the `classes` module — الشُعب.
 *
 * Other modules may import from this file ONLY.
 */
export {
  listClassesForBranch,
  listClassOptions,
  type ClassWithCounts,
  type ClassOption,
} from "./application/queries/list-classes";
export { createClass, editClass, setClassActive } from "./application/use-cases/manage-class";
export { ClassesTable } from "./ui/classes-table";
export { ClassFormDialog } from "./ui/class-form";
