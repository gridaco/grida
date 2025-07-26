import { Input } from "@/components/ui/input";
import type cg from "@grida/cg";
import { RGBAColorControl } from "./color";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { Cross2Icon } from "@radix-ui/react-icons";
import cmath from "@grida/cmath";
import { GradientStopsSlider } from "@/grida-canvas-react-gradient/gradient-stops-slider";
import { ArrowRightLeftIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui-editor/button";
import { Label } from "@/components/ui/label";

type GradientPaint =
  | cg.LinearGradientPaint
  | cg.RadialGradientPaint
  | cg.SweepGradientPaint;

export function GradientControl({
  value,
  selectedStop,
  onSelectedStopChange,
  onValueChange,
}: {
  value: GradientPaint;
  selectedStop?: number;
  onSelectedStopChange?: (stop: number) => void;
  onValueChange?: (value: GradientPaint) => void;
}) {
  const { stops } = value;

  const onFlipStopsClick = () => {
    const flippedStops = stops
      .map((stop, index) => ({
        ...stop,
        offset: 1 - stop.offset,
      }))
      .reverse();
    onValueChange?.({ ...value, stops: flippedStops });
  };

  const onRotateClick = () => {
    const currentAngle = value.transform
      ? cmath.transform.angle(value.transform)
      : 0;
    const newAngle = currentAngle + 45;
    const t = cmath.transform.computeRelativeLinearGradientTransform(newAngle);
    onValueChange?.({
      ...value,
      transform: t,
    });
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-end gap-2 mb-2">
        <Button
          onClick={onFlipStopsClick}
          title="Flip"
          variant="ghost"
          size="icon"
        >
          <ArrowRightLeftIcon className="size-3.5" />
        </Button>
        <Button
          onClick={onRotateClick}
          title="Rotate"
          variant="ghost"
          size="icon"
        >
          <RotateCwIcon className="size-3.5" />
        </Button>
      </div>
      <GradientStopsSlider
        stops={stops}
        selectedStop={selectedStop}
        onSelectedStopChange={onSelectedStopChange}
        onValueChange={(stops) => {
          onValueChange?.({ ...value, stops });
        }}
      />
      <hr className="my-4 w-full" />
      <Label className="text-xs mb-2">Stops</Label>
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

function GradientStop({
  value: stop,
  onValueChange,
  canRemove,
  onRemove,
}: {
  value: cg.GradientStop;
  onValueChange?: (value: cg.GradientStop) => void;
  canRemove?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={(stop.offset * 100).toFixed(2)}
        step={0.01}
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
