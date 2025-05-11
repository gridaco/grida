import { DotIcon } from "lucide-react";

export function IconButtonDotBadge({
  offset,
  accent,
}: {
  offset?: { top: number; right: number };
  accent: "orange" | "sky" | "red";
}) {
  return (
    <DotIcon
      data-accent={accent}
      className="absolute size-8 -top-2 -right-2 pointer-events-none select-none data-[accent='sky']:text-workbench-accent-sky data-[accent='orange']:text-workbench-accent-orange data-[accent='red']:text-workbench-accent-red"
      style={offset}
    />
  );
}
