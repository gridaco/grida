import { DotIcon } from "lucide-react";

export function IconButtonDotBadge({
  offset,
}: {
  offset?: { top: number; right: number };
}) {
  return (
    <DotIcon
      className="absolute w-8 h-8 -top-2 -right-2 text-workbench-accent-2 pointer-events-none select-none"
      style={offset}
    />
  );
}
