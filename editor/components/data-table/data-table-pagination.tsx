import { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

function getVisiblePageRange(
  pageIndex: number,
  pageCount: number,
  siblingCount = 1
): (number | "ellipsis-left" | "ellipsis-right")[] {
  // When empty (0 rows), still show page 1
  if (pageCount <= 0) return [0];
  const totalVisible = siblingCount * 2 + 3; // e.g. 1 ... 4 5 6 ... 10
  if (pageCount <= totalVisible) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const left = Math.max(0, pageIndex - siblingCount);
  const right = Math.min(pageCount - 1, pageIndex + siblingCount);
  const showLeftEllipsis = left > 1;
  const showRightEllipsis = right < pageCount - 2;
  const pages: (number | "ellipsis-left" | "ellipsis-right")[] = [];
  if (showLeftEllipsis) {
    pages.push(0, "ellipsis-left");
  }
  for (let i = left; i <= right; i++) {
    pages.push(i);
  }
  if (showRightEllipsis) {
    pages.push("ellipsis-right", pageCount - 1);
  }
  return pages;
}

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  const visiblePages = getVisiblePageRange(pageIndex, pageCount);

  return (
    <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 items-center gap-4">
        <p className="text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </p>
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium whitespace-nowrap">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 50, 100, 500].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Pagination className="mx-0 w-auto">
        <PaginationContent className="flex flex-wrap gap-1">
          <PaginationItem>
            <Button
              variant="ghost"
              size="default"
              className="gap-1 px-2.5 sm:pl-2.5"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Go to previous page"
            >
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
          </PaginationItem>
          {visiblePages.map((page, i) =>
            page === "ellipsis-left" || page === "ellipsis-right" ? (
              <PaginationItem key={`ellipsis-${page}-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={page}>
                <Button
                  variant={pageIndex === page ? "outline" : "ghost"}
                  size="icon"
                  className="size-9"
                  onClick={() => table.setPageIndex(page)}
                  disabled={pageIndex === page}
                  aria-current={pageIndex === page ? "page" : undefined}
                  aria-label={`Go to page ${page + 1}`}
                >
                  {page + 1}
                </Button>
              </PaginationItem>
            )
          )}
          <PaginationItem>
            <Button
              variant="ghost"
              size="default"
              className="gap-1 px-2.5 sm:pr-2.5"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Go to next page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="size-4" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
