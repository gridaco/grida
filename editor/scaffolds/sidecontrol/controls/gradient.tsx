import { Input } from "@/components/ui/input";
import type cg from "@grida/cg";
import { RGBAColorControl } from "./color";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { Cross2Icon } from "@radix-ui/react-icons";
import InputPropertyNumber from "../ui/number";
import cmath from "@grida/cmath";
import { GradientStopsSlider } from "./gradient-stops";

type GradientPaint =
  | cg.LinearGradientPaint
  | cg.RadialGradientPaint
  | cg.SweepGradientPaint;

export function GradientControl({
  value,
  onValueChange,
}: {
  value: GradientPaint;
  onValueChange?: (value: GradientPaint) => void;
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
        <InputPropertyNumber
          mode="fixed"
          type="number"
          placeholder="angle"
          step={1}
          value={
            value.transform ? cmath.transform.angle(value.transform) : undefined
          }
          onValueCommit={(v) => {
            // change on commit
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
