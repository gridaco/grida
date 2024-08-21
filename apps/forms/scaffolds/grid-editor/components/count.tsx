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
    <span className="text-sm font-medium">
      {count === undefined ? <Spinner /> : txt_n_plural(count, keyword)}
    </span>
  );
}
