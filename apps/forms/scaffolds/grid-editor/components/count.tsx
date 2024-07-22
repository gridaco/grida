import { txt_n_plural } from "@/utils/plural";

export function GridCount({ count }: { count: number }) {
  return (
    <span className="text-sm font-medium">{txt_n_plural(count, keyword)}</span>
  );
}
