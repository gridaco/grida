import EmptyWelcome from "@/components/empty";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyRowsRenderer({
  loading,
  hasPredicates,
}: {
  loading?: boolean;
  hasPredicates?: boolean;
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
      <EmptyWelcome
        title={
          hasPredicates ? <span>No Results</span> : <span>Table is empty</span>
        }
        paragraph={
          hasPredicates ? (
            <span>
              No records match the criteria. Try changing the filters or search
              query.
            </span>
          ) : (
            <span>Create a new record to get started</span>
          )
        }
      />
    </div>
  );
}
