import type cg from "@grida/cg";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { css } from "@/grida-canvas-utils/css";

export function GradientStopsSlider({
  stops,
  selectedStop,
  onValueChange,
  onSelectedStopChange,
}: {
  stops: cg.GradientStop[];
  selectedStop?: number;
  onSelectedStopChange?: (stop: number) => void;
  onValueChange?: (value: cg.GradientStop[]) => void;
}) {
  const step = 0.01;
  const threshold = step * 20;

  const offsets = stops.map((stop) => stop.offset);

  const handleValueChange = (changes: number[]) => {
    const updatedValues = [...offsets];

    changes.forEach((newVal) => {
      const isNewPoint = !offsets.some(
        (existingVal) => Math.abs(existingVal - newVal) < threshold
      );
      if (isNewPoint) {
        updatedValues.push(newVal); // Add the new value if it’s not close to any existing value
      } else {
        // If not new, update the closest value
        const closestIndex = offsets.findIndex(
          (existingVal) => Math.abs(existingVal - newVal) < threshold
        );
        updatedValues[closestIndex] = newVal;
      }
    });

    const newstops = updatedValues
      .sort((a, b) => a - b)
      .map((offset, index) => {
        // get existing stop
        const prev = stops[index];
        if (prev) {
          return { ...prev, offset };
        } else {
          return { offset, color: { r: 0, g: 0, b: 0, a: 1 } };
        }
      });

    onValueChange?.(newstops);
  };

  return (
    <SliderPrimitive.Root
      className="relative flex w-full touch-none select-none items-center"
      min={0}
      max={1}
      step={step}
      value={offsets}
      onValueChange={handleValueChange}
    >
      <SliderPrimitive.Track
        className="relative h-9 w-full grow overflow-hidden rounded"
        style={{
          background: `linear-gradient(to right, ${stops.map((stop) => `${css.toRGBAString(stop.color)} ${stop.offset * 100}%`).join(", ")})`,
        }}
      />
      {stops.map((stop, index) => (
        <SliderPrimitive.Thumb
          key={index}
          data-selected={selectedStop === index}
          className="group/stop-thumb"
          onPointerDown={() => {
            onSelectedStopChange?.(index);
          }}
        >
          <div
            className="
              block size-7 rounded border-4 border-background outline-1 outline-workbench-accent-sky shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50
              group-data-[selected=true]/stop-thumb:border-yellow-400
            "
            style={{
              background: css.toRGBAString(stop.color),
            }}
          />
        </SliderPrimitive.Thumb>
      ))}
    </SliderPrimitive.Root>
  );
}
