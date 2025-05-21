import { css } from "@/grida-canvas-utils/css";
import { TransparencyGridIcon } from "@radix-ui/react-icons";
import type cg from "@grida/cg";
import { cn } from "@/components/lib/utils";

export function PaintChip({
  paint,
  className,
}: {
  paint: cg.Paint;
  className?: string;
}) {
  switch (paint.type) {
    case "solid":
      return <RGBAChip rgba={paint.color} className={className} />;
    case "linear_gradient":
      return <LinearGradientPaintChip paint={paint} className={className} />;
    case "radial_gradient":
      return <RadialGradientPaintChip paint={paint} className={className} />;
  }
}

export function RGBAChip({
  rgba,
  className,
}: {
  rgba: cg.RGBA8888;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative size-5 min-w-5 rounded-xs border border-gray-300 overflow-hidden",
        className
      )}
    >
      <div
        className="absolute w-full h-full"
        style={{
          backgroundColor: css.toRGBAString(rgba),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-10" />
    </div>
  );
}

export function LinearGradientPaintChip({
  paint,
  className,
}: {
  paint: cg.LinearGradientPaint;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative size-5 min-w-5 rounded-xs border border-gray-300 overflow-hidden",
        className
      )}
    >
      <div
        className="absolute w-full h-full"
        style={{
          background: css.toLinearGradientString(paint),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-10" />
    </div>
  );
}

export function RadialGradientPaintChip({
  paint,
  className,
}: {
  paint: cg.RadialGradientPaint;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative size-5 min-w-5 rounded-xs border border-gray-300 overflow-hidden",
        className
      )}
    >
      <div
        className="absolute w-full h-full"
        style={{
          background: css.toRadialGradientString(paint),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-10" />
    </div>
  );
}
