import { Input } from "@/components/ui/input";
import { grida } from "@/grida";
import { RGBAColorControl } from "./color";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/utils";
import { Cross2Icon } from "@radix-ui/react-icons";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { PropertyNumber } from "../ui";
import { cmath } from "@grida/cmath";
import { css } from "@/grida/css";

export function GradientControl({
  value,
  onValueChange,
}: {
  value:
    | grida.program.cg.LinearGradientPaint
    | grida.program.cg.RadialGradientPaint;
  onValueChange?: (
    value:
      | grida.program.cg.LinearGradientPaint
      | grida.program.cg.RadialGradientPaint
  ) => void;
}) {
  const { stops } = value;
  return (
    <div className="w-full">
      <GradientStopsSlider
        stops={stops}
        onValueChange={(stops) => {
          onValueChange?.({ ...value, stops });
        }}
      />
      <hr className="my-4 w-full" />
      <div>
        <PropertyNumber
          type="number"
          placeholder="angle"
          mode="fixed"
          step={1}
          value={
            value.transform ? cmath.transform.angle(value.transform) : undefined
          }
          onValueChange={(v) => {
            const t = cmath.transform.computeRelativeLinearGradientTransform(v);
            onValueChange?.({
              ...value,
              transform: t,
            });
          }}
        />
      </div>
      <hr className="my-4 w-full" />
      <div className="flex flex-col gap-2">
        {stops.map((stop, index) => (
          <GradientStop
            key={index}
            value={stop}
            canRemove={stops.length > 1}
            onValueChange={(newStop) => {
              const newStops = [...stops];
              newStops[index] = newStop;
              onValueChange?.({ ...value, stops: newStops });
            }}
            onRemove={() => {
              const newStops = [...stops];
              newStops.splice(index, 1);
              onValueChange?.({ ...value, stops: newStops });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function GradientStopsSlider({
  stops,
  onValueChange,
}: {
  stops: grida.program.cg.GradientStop[];
  onValueChange?: (value: grida.program.cg.GradientStop[]) => void;
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

    // console.log(updatedValues, newstops);

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
        className="relative h-2 w-full grow overflow-hidden rounded-full"
        style={{
          background: `linear-gradient(to right, ${stops.map((stop) => `${css.toRGBAString(stop.color)} ${stop.offset * 100}%`).join(", ")})`,
        }}
      ></SliderPrimitive.Track>
      {stops.map((stop, index) => (
        <SliderPrimitive.Thumb
          key={index}
          className="block h-4 w-4 rounded-full border-2 border-background outline outline-1 outline-workbench-accent-sky shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          style={{
            background: css.toRGBAString(stop.color),
          }}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

function GradientStop({
  value: stop,
  onValueChange,
  canRemove,
  onRemove,
}: {
  value: grida.program.cg.GradientStop;
  onValueChange?: (value: grida.program.cg.GradientStop) => void;
  canRemove?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={stop.offset * 100}
        onChange={(e) => {
          const v100 = parseFloat(e.target.value);
          const v = v100 / 100;
          if (isNaN(v)) return;

          onValueChange?.({ ...stop, offset: v });
        }}
        className={cn("flex-1", WorkbenchUI.inputVariants({ size: "xs" }))}
      />
      <div className="flex-[2]">
        <RGBAColorControl
          value={stop.color}
          onValueChange={(color) => {
            onValueChange?.({ ...stop, color });
          }}
        />
      </div>
      {canRemove && (
        <button onClick={onRemove}>
          <Cross2Icon />
        </button>
      )}
    </div>
  );
}
