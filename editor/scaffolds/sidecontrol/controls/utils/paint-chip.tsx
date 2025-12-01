import { css } from "@/grida-canvas-utils/css";
import { TransparencyGridIcon, ImageIcon } from "@radix-ui/react-icons";
import type cg from "@grida/cg";
import { cn } from "@/components/lib/utils";
import { ImageView } from "@/grida-canvas-react";
import { ComponentProps } from "react";
import cmath from "@grida/cmath";

function ChipContainer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative size-5 min-w-5 rounded-xs border border-gray-300 overflow-hidden",
        className
      )}
      {...props}
    />
  );
}

export function PaintChip({
  paint,
  className,
}: {
  paint: cg.Paint | cg.ImagePaint;
  className?: string;
}) {
  switch (paint.type) {
    case "solid":
      return <RGB888A32FChip rgba={paint.color} className={className} />;
    case "linear_gradient":
      return <LinearGradientPaintChip paint={paint} className={className} />;
    case "radial_gradient":
      return <RadialGradientPaintChip paint={paint} className={className} />;
    case "sweep_gradient":
      return <SweepGradientPaintChip paint={paint} className={className} />;
    case "diamond_gradient":
      return <DiamondGradientPaintChip paint={paint} className={className} />;
    case "image":
      return <ImagePaintChip paint={paint} className={className} />;
  }
}

/**
 * @deprecated DEPRECATED_COLOR_MODEL
 * use {@link RGBChip} instead
 */
export function RGB888A32FChip({
  rgba,
  className,
}: {
  rgba: cg.RGB888A32F;
  className?: string;
}) {
  return (
    <ChipContainer className={className}>
      <div
        className="absolute w-full h-full z-10"
        style={{
          backgroundColor: css.toRGBAString(rgba),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-0" />
    </ChipContainer>
  );
}

/**
 * Displays a small swatch for arbitrary RGB color data with configurable unit
 * precision and alpha value.
 *
 * @param rgb - Raw RGB `{r, g, b}` in the provided component format.
 * @param unit - Declares how each component in `rgb` is encoded (`f32`: 0.0-1.0, `u8`: 0-255, etc.).
 * @param opacity - Final alpha in 0-1 range, applied independently of `unit`.
 * @param className - Optional utility classes forwarded to the chip container.
 */
export function RGBChip({
  rgb,
  unit,
  opacity,
  className,
}: {
  rgb: cmath.colorformats.RGB_UNKNOWN;
  /**
   * the format of the rgb values
   */
  unit: cmath.colorformats.ColorComponentFormat;
  /**
   * 0.0-1.0 (independent of unit)
   */
  opacity: number;
  className?: string;
}) {
  return (
    <ChipContainer className={className}>
      <div
        className="absolute w-full h-full z-10"
        style={{
          backgroundColor: cmath.colorformats.intoCSSRGB(rgb, unit),
          opacity: opacity,
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-0" />
    </ChipContainer>
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
    <ChipContainer className={className}>
      <div
        className="absolute w-full h-full z-10"
        style={{
          background: css.toLinearGradientString(paint),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-0" />
    </ChipContainer>
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
    <ChipContainer className={className}>
      <div
        className="absolute w-full h-full z-10"
        style={{
          background: css.toRadialGradientString(paint),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-10" />
    </ChipContainer>
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
    <ChipContainer className={className}>
      <div
        className="absolute w-full h-full z-10"
        style={{
          background: css.toConicGradientString(paint),
        }}
      />
      <TransparencyGridIcon className="absolute w-full h-full -z-0" />
    </ChipContainer>
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
    <ChipContainer className={className}>
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
      <TransparencyGridIcon className="absolute w-full h-full -z-0" />
    </ChipContainer>
  );
}

export function ImagePaintChip({
  paint,
  className,
}: {
  paint: cg.ImagePaint;
  className?: string;
}) {
  return (
    <ChipContainer className={className}>
      {paint.src ? (
        <ImageView
          src={paint.src}
          alt="Paint image"
          className="w-full h-full object-cover z-10"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-3 h-3 text-muted-foreground/50" />
        </div>
      )}
      <TransparencyGridIcon className="absolute w-full h-full -z-0" />
    </ChipContainer>
  );
}
