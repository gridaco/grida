import { css } from "@/grida-canvas-utils/css";
import type cg from "@grida/cg";
import { TransparencyGridIcon } from "@radix-ui/react-icons";

export function PaintChip({ paint }: { paint: cg.Paint }) {
  switch (paint.type) {
    case "solid":
      return <RGBAChip rgba={paint.color} />;
    case "linear_gradient":
      return <LinearGradientPaintChip paint={paint} />;
    case "radial_gradient":
      return <RadialGradientPaintChip paint={paint} />;
  }
}

export function RGBAChip({ rgba }: { rgba: cg.RGBA8888 }) {
  return (
    <div className="relative size-5 min-w-5 rounded-xs border border-gray-300 overflow-hidden">
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
}: {
  paint: cg.LinearGradientPaint;
}) {
  return (
    <div className="relative size-5 min-w-5 rounded-xs border border-gray-300 overflow-hidden">
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
}: {
  paint: cg.RadialGradientPaint;
}) {
  return (
    <div className="relative size-5 min-w-5 rounded-xs border border-gray-300 overflow-hidden">
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
