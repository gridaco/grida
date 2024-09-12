import { Spinner } from "@/components/spinner";
import { txt_n_plural } from "@/utils/plural";

export function GridCount({
  count,
  keyword,
}: {
  count?: number;
  keyword: string;
}) {
  return (
    <div>
      {count === undefined ? (
        <Spinner />
      ) : (
        <span className="text-xs font-normal text-muted-foreground">
          {txt_n_plural(count, keyword)}
        </span>
      )}
    </div>
  );
}
