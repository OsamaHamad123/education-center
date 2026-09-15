"use client";

import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createCoreRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  filterFns,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";

/**
 * TanStack Table v9 is generic over the feature set you opt into — `table.nextPage()`
 * does not exist unless `rowPaginationFeature` is declared. Declaring the set once
 * here, via `createTableHook`, is what keeps every call site free of feature generics.
 *
 * Client sorting, filtering and pagination suit the admin lists (a center has a
 * handful of branches and a dozen subjects). Lists that grow without bound — students,
 * the audit log — page on the server and pass their own state instead.
 */
const FEATURES = {
  coreRowModel: createCoreRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  columnFilteringFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filterFns,
  sortFns,
};

const tableHook = createTableHook({
  features: FEATURES,
  // Left empty deliberately: without concrete component maps the hook's generics
  // widen to an index signature and every table method types as a component.
  tableComponents: {},
  cellComponents: {},
  headerComponents: {},
});

export const useAppTable = tableHook.useAppTable;

export type AppFeatures = typeof FEATURES;

/** Column definition bound to our feature set — use this, not the bare ColumnDef. */
export type AppColumnDef<TData extends RowData> = ColumnDef<AppFeatures, TData, unknown>;
