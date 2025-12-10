import { cn } from "@/components/lib/utils";

export function Rule({
  axis,
  offset,
  width = 0.5,
  padding = 0,
  className,
  zIndex = 10,
  ...props
}: {
  axis: "x" | "y";
  offset: number;
  width?: number;
  padding?: number;
  zIndex?: number;
  className?: string;
}) {
  const totalSize = width + padding * 2;

  return (
    <svg
      {...props}
      style={{
        position: "absolute",
        zIndex,
        width: axis === "x" ? "100%" : `${totalSize}px`,
        height: axis === "y" ? "100%" : `${totalSize}px`,
        transform:
          axis === "x"
            ? `translate3d(0, ${offset - width / 2 - padding}px, 0)`
            : `translate3d(${offset - width / 2 - padding}px, 0, 0)`,
      }}
      className={cn("text-workbench-accent-red", className)}
    >
      <line
        x1={axis === "x" ? 0 : padding + width / 2}
        y1={axis === "y" ? 0 : padding + width / 2}
        x2={axis === "x" ? "100%" : padding + width / 2}
        y2={axis === "y" ? "100%" : padding + width / 2}
        stroke="currentColor"
        strokeWidth={width}
      />
    </svg>
  );
}
