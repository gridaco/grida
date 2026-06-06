import {
  SolidPaintIcon as SolidPaintShape,
  LinearGradientPaintIcon as LinearGradientPaintShape,
  RadialGradientPaintIcon as RadialGradientPaintShape,
  SweepGradientPaintIcon as SweepGradientPaintShape,
  DiamondGradientPaintIcon as DiamondGradientPaintShape,
  ImagePaintIcon as ImagePaintShape,
} from "@grida/react-icons";
import { cn } from "@app/ui/lib/utils";

/**
 * Host wrappers that dress the shape-only @grida/react-icons paint swatches in
 * the editor's theme + active state. The package icons are agnostic — a single
 * `currentColor` (gradients are opacity, not a second hue) inside a full-opacity
 * outline ring — so a single `text-*` color drives the whole swatch. All editor
 * tokens and the `active` flag live here. See the @grida/react-icons README
 * ("shape-only").
 */
type PaintIconProps = { active?: boolean; className?: string };

const FRAME = "shadow rounded-full";

const tint = (active?: boolean) =>
  active ? "text-workbench-accent-sky" : "text-muted-foreground";

export function SolidPaintIcon({ active, className }: PaintIconProps) {
  return <SolidPaintShape className={cn(FRAME, tint(active), className)} />;
}

export function LinearGradientPaintIcon({ active, className }: PaintIconProps) {
  return (
    <LinearGradientPaintShape className={cn(FRAME, tint(active), className)} />
  );
}

export function RadialGradientPaintIcon({ active, className }: PaintIconProps) {
  return (
    <RadialGradientPaintShape className={cn(FRAME, tint(active), className)} />
  );
}

export function SweepGradientPaintIcon({ active, className }: PaintIconProps) {
  return (
    <SweepGradientPaintShape className={cn(FRAME, tint(active), className)} />
  );
}

export function DiamondGradientPaintIcon({
  active,
  className,
}: PaintIconProps) {
  return (
    <DiamondGradientPaintShape className={cn(FRAME, tint(active), className)} />
  );
}

export function ImagePaintIcon({ active, className }: PaintIconProps) {
  return (
    <ImagePaintShape
      className={cn(
        FRAME,
        "bg-muted",
        active ? "text-workbench-accent-sky" : "text-muted-foreground/60",
        className
      )}
    />
  );
}
