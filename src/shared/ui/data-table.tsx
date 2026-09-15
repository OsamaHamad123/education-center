"use client";

import { useState } from "react";
import { flexRender, type RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { PAGE_SIZE } from "@/shared/config/constants";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { Input } from "@/shared/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { useAppTable, type AppColumnDef } from "@/shared/ui/table-hook";

/**
 * The shared table for admin lists (PROJECT_PLAN section 12). The feature set it is
 * built on lives in `table-hook.ts`.
 *
 * On a phone the table becomes a stack of cards when `renderCard` is given: an
 * eight-column table on a 360px screen is unreadable, and this system is used on
 * phones every day.
 */
export type DataTableProps<TData extends RowData> = {
  columns: AppColumnDef<TData>[];
  data: TData[];
  /** Column id to filter on when the search box is shown. */
  searchColumn?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rendered instead of a row on small screens. */
  renderCard?: (row: TData) => React.ReactNode;
  getRowId?: (row: TData) => string;
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  searchColumn,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
  renderCard,
  getRowId,
}: DataTableProps<TData>) {
  const [search, setSearch] = useState("");

  const table = useAppTable<TData>({
    data,
    columns,
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
    initialState: { pagination: { pageIndex: 0, pageSize: PAGE_SIZE } },
    state: searchColumn && search ? { columnFilters: [{ id: searchColumn, value: search }] } : {},
  });

  const rows = table.getRowModel().rows;
  const pagination = table.state.pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="space-y-3">
      {searchColumn ? (
        <div className="relative max-w-sm">
          <Search
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder ?? ar.common.search}
            aria-label={searchPlaceholder ?? ar.common.search}
            className="ps-9"
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title={emptyTitle ?? ar.common.noResults} description={emptyDescription} />
      ) : (
        <>
          {/* Cards on phones, a real table from md up. */}
          {renderCard ? (
            <ul className="space-y-2 md:hidden">
              {rows.map((row) => (
                <li key={row.id}>{renderCard(row.original)}</li>
              ))}
            </ul>
          ) : null}

          <div className={renderCard ? "hidden overflow-x-auto md:block" : "overflow-x-auto"}>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={() => header.column.toggleSorting()}
                              className="hover:text-foreground inline-flex items-center gap-1"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sorted === "asc" ? (
                                <ArrowUp className="size-3.5" aria-hidden />
                              ) : sorted === "desc" ? (
                                <ArrowDown className="size-3.5" aria-hidden />
                              ) : (
                                <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">
                {pagination.pageIndex + 1} / {pageCount}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  {ar.common.previous}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  {ar.common.next}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
