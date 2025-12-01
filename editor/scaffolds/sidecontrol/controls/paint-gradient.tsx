import type cg from "@grida/cg";
import { RGB888A32FColorControl } from "./color";
import { Cross2Icon } from "@radix-ui/react-icons";
import { GradientStopsSlider } from "@/grida-canvas-react-gradient/gradient-stops-slider";
import { Label } from "@/components/ui/label";
import InputPropertyPercentage from "../ui/percentage";

type GradientPaint =
  | cg.LinearGradientPaint
  | cg.RadialGradientPaint
  | cg.SweepGradientPaint
  | cg.DiamondGradientPaint;

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

  return (
    <div className="w-full">
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
      <InputPropertyPercentage
        mode="fixed"
        value={stop.offset}
        min={0}
        max={1}
        onValueCommit={(v) => {
          onValueChange?.({ ...stop, offset: v });
        }}
        className="flex-1"
      />
      <div className="flex-[2]">
        <RGB888A32FColorControl
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
