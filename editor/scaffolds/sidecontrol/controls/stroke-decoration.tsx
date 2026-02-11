import type cg from "@grida/cg";
import { PropertyEnum } from "../ui";
import { TMixed } from "./utils/types";
import {
  iconByValue,
  StrokeDecorationIconResponsive,
} from "./icons/stroke-decoration-icons";
import { cn } from "@/components/lib/utils";

const DECORATION_OPTIONS: { label: string; value: cg.StrokeDecoration }[] = [
  { label: "None", value: "none" },
  { label: "Arrow Lines", value: "arrow_lines" },
  { label: "Triangle", value: "triangle_filled" },
  { label: "Circle", value: "circle_filled" },
  { label: "Square", value: "square_filled" },
  { label: "Diamond", value: "diamond_filled" },
  { label: "Bar", value: "vertical_bar_filled" },
];

export function StrokeDecorationControl({
  value,
  onValueChange,
  variant = "end",
  className,
}: {
  value?: TMixed<cg.StrokeDecoration>;
  onValueChange?: (value: cg.StrokeDecoration) => void;
  /** "start" flips icons so the marker appears on the left (for Start endpoint). */
  variant?: "start" | "end";
  className?: string;
}) {
  const enumWithIcons = DECORATION_OPTIONS.map(({ label, value: v }) => ({
    label,
    value: v,
    icon: (
      <span
        className={cn(
          "inline-flex items-center justify-center mr-1.5",
          variant === "start" && "scale-x-[-1]"
        )}
      >
        {iconByValue[v]}
      </span>
    ),
  }));

  return (
    <PropertyEnum<cg.StrokeDecoration>
      className={cn("w-full !gap-0.5 !px-1", className)}
      enum={enumWithIcons}
      value={value}
      onValueChange={onValueChange}
      renderTriggerValue={(val) => (
        <StrokeDecorationIconResponsive value={val} variant={variant} />
      )}
    />
  );
}
