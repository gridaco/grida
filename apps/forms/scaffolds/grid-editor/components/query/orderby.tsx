import { ArrowDownIcon, ArrowDownUpIcon, ArrowUpIcon } from "lucide-react";
import { useDataGridOrderby } from "@/scaffolds/editor/use";
import { XSupaDataGridSortMenu } from "../sort";
import { QueryChip } from "./chip";

type SortIconType = "up" | "down" | "mixed";
function SortIcon({
  type,
  className,
}: {
  type: SortIconType;
  className?: string;
}) {
  switch (type) {
    case "up":
      return <ArrowUpIcon className={className} />;
    case "down":
      return <ArrowDownIcon className={className} />;
    case "mixed":
      return <ArrowDownUpIcon className={className} />;
  }
}

export function OrderbyChip() {
  const { orderby, isset } = useDataGridOrderby();

  const length = Object.keys(orderby).length;
  const multiple = length > 1;
  const first = orderby[Object.keys(orderby)[0]];

  const icon: SortIconType = multiple
    ? "mixed"
    : first.ascending
      ? "up"
      : "down";

  return (
    <XSupaDataGridSortMenu>
      <QueryChip active={isset}>
        <SortIcon type={icon} className="w-3 h-3 me-1" />
        {multiple ? <>{length + "sorts"}</> : <>{first.column}</>}
      </QueryChip>
    </XSupaDataGridSortMenu>
  );
}
