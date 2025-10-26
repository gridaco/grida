import { useNumberGesture, type NumberChange } from "@grida/number-input/react";
import { PropertyLineLabel } from ".";

export function PropertyLineLabelWithNumberGesture({
  children,
  step,
  min,
  max,
  sensitivity,
  onValueChange,
}: React.PropsWithChildren<{
  children: React.ReactNode;
  step?: number;
  min?: number;
  max?: number;
  sensitivity?: number;
  onValueChange?: (change: NumberChange) => void;
}>) {
  const { bind } = useNumberGesture({
    mode: "auto",
    step,
    min,
    max,
    sensitivity,
    onValueChange: onValueChange,
    axisForValue: "x",
    uxPointerLock: false,
  });

  return (
    <PropertyLineLabel {...bind()} className="cursor-ew-resize">
      {children}
    </PropertyLineLabel>
  );
}
