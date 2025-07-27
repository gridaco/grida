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
    case "sweep_gradient":
      return <SweepGradientPaintChip paint={paint} className={className} />;
    case "diamond_gradient":
      return <DiamondGradientPaintChip paint={paint} className={className} />;
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

export function SweepGradientPaintChip({
  paint,
  className,
}: {
  paint: cg.SweepGradientPaint;
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
          background: css.toConicGradientString(paint),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-10" />
    </div>
  );
}

export function DiamondGradientPaintChip({
  paint,
  className,
}: {
  paint: cg.DiamondGradientPaint;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative size-5 min-w-5 rounded-xs border border-gray-300 overflow-hidden",
        className
      )}
    >
      {/* Diamond shape using CSS transform */}
      <div
        className="absolute inset-0 transform rotate-45 scale-75"
        style={{
          background: css.toLinearGradientString({
            ...paint,
            type: "linear_gradient",
            transform: paint.transform,
            stops: paint.stops,
          }),
        }}
      />
      {/* Additional diamond overlay for more definition */}
      <div
        className="absolute inset-0 transform rotate-45 scale-50"
        style={{
          background: css.toLinearGradientString({
            ...paint,
            type: "linear_gradient",
            transform: paint.transform,
            stops: paint.stops.map((stop, index) => ({
              ...stop,
              color: {
                ...stop.color,
                a: stop.color.a * 0.3, // Reduce opacity for overlay effect
              },
            })),
          }),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-10" />
    </div>
  );
}
