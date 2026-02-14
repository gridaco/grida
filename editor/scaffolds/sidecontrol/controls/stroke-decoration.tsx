import type cg from "@grida/cg";
import { PropertyEnum } from "../ui";
import { TMixed } from "./utils/types";
import {
  iconByValue,
  StrokeDecorationIconResponsive,
} from "./icons/stroke-decoration-icons";
import { cn } from "@/components/lib/utils";

const DECORATION_OPTIONS: { label: string; value: cg.StrokeMarkerPreset }[] = [
  { label: "None", value: "none" },
  { label: "Right Triangle", value: "right_triangle_open" },
  { label: "Equilateral Triangle", value: "equilateral_triangle" },
  { label: "Circle", value: "circle" },
  { label: "Square", value: "square" },
  { label: "Diamond", value: "diamond" },
  { label: "Bar", value: "vertical_bar" },
];

export function StrokeDecorationControl({
  value,
  onValueChange,
  variant = "end",
  className,
}: {
  value?: TMixed<cg.StrokeMarkerPreset>;
  onValueChange?: (value: cg.StrokeMarkerPreset) => void;
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
    <PropertyEnum<cg.StrokeMarkerPreset>
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
