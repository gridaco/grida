import { Spinner } from "@/components/spinner";
import { txt_n_plural } from "@/utils/plural";

export function GridQueryCount({
  count,
  keyword,
}: {
  count?: number | undefined | null;
  keyword: string;
}) {
  return (
    <div>
      {count === undefined || count === null ? (
        <Spinner />
      ) : (
        <span className="text-xs font-normal text-muted-foreground">
          {txt_n_plural(count, keyword)}
        </span>
      )}
    </div>
  );
}
