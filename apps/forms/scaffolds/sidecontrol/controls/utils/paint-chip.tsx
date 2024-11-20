import { grida } from "@/grida";
import { TransparencyGridIcon } from "@radix-ui/react-icons";

export function PaintChip({ paint }: { paint: grida.program.cg.Paint }) {
  switch (paint.type) {
    case "solid":
      return <RGBAChip rgba={paint.color} />;
    case "linear_gradient":
      return <LinearGradientPaintChip paint={paint} />;
    case "radial_gradient":
      return <RadialGradientPaintChip paint={paint} />;
  }
}

export function RGBAChip({ rgba }: { rgba: grida.program.css.RGBA8888 }) {
  return (
    <div className="relative w-6 h-6 rounded-sm border border-gray-300 overflow-hidden">
      <div
        className="absolute w-full h-full"
        style={{
          backgroundColor: grida.program.css.toRGBAString(rgba),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-10" />
    </div>
  );
}

export function LinearGradientPaintChip({
  paint,
}: {
  paint: grida.program.cg.LinearGradientPaint;
}) {
  return (
    <div className="relative w-6 h-6 rounded-sm border border-gray-300 overflow-hidden">
      <div
        className="absolute w-full h-full"
        style={{
          background: grida.program.css.toLinearGradientString(paint),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-10" />
    </div>
  );
}

export function RadialGradientPaintChip({
  paint,
}: {
  paint: grida.program.cg.RadialGradientPaint;
}) {
  return (
    <div className="relative w-6 h-6 rounded-sm border border-gray-300 overflow-hidden">
      <div
        className="absolute w-full h-full"
        style={{
          background: grida.program.css.toRadialGradientString(paint),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-10" />
    </div>
  );
}
