import { Table2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function EmptyRowsRenderer({
  loading,
  hasPredicates,
  children,
}: {
  loading?: boolean;
  hasPredicates?: boolean;
  /** Optional content rendered below the description (e.g. a docs link) */
  children?: React.ReactNode;
}) {
  if (loading)
    return (
      <div className="p-4 flex flex-col space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
      </div>
    );
  return (
    <div className="col-span-full w-full h-full flex items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Table2 />
          </EmptyMedia>
          <EmptyTitle>
            {hasPredicates ? "No Results" : "Table is empty"}
          </EmptyTitle>
          <EmptyDescription>
            {hasPredicates
              ? "No records match the criteria. Try changing the filters or search query."
              : "Create a new record to get started"}
          </EmptyDescription>
          {children != null ? <EmptyContent>{children}</EmptyContent> : null}
        </EmptyHeader>
      </Empty>
    </div>
  );
}
