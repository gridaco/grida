import React from "react";
import type cg from "@grida/cg";
import { RGBA32FColorControl } from "./color";
import { MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import { GradientStopsSlider } from "@/grida-canvas-react-gradient/gradient-stops-slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui-editor/button";
import { PropertyRows, PropertyRow } from "../ui";
import InputPropertyPercentage from "../ui/percentage";
import kolor from "@grida/color";

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

  // TODO: Introduce a universal callback `onAddStop(offset: "auto" | number, color: "auto" | cg.RGBA32F)`
  // to centralize the logic for adding gradient stops. This logic is currently duplicated in:
  // - This component (handleAddStop)
  // - GradientStopsSlider (handleTrackClick)
  // - GradientControlPointsEditor (onInsertStop)
  // The callback should handle:
  // - Calculating offset when "auto" (finding largest gap, etc.)
  // - Determining color when "auto" (interpolating from adjacent stops or using default)
  // - Inserting stop in sorted position
  // - Returning the new stop index

  const calculateNewStopOffset = React.useCallback(
    (stops: cg.GradientStop[]) => {
      if (stops.length === 0) return 0.5;

      const offsets = stops.map((s) => s.offset).sort((a, b) => a - b);
      if (offsets.length === 1) return 0.5;

      let maxGap = 0;
      let gapStart = 0;
      for (let i = 0; i < offsets.length - 1; i++) {
        const gap = offsets[i + 1] - offsets[i];
        if (gap > maxGap) {
          maxGap = gap;
          gapStart = offsets[i];
        }
      }
      return gapStart + maxGap / 2;
    },
    []
  );

  const handleAddStop = React.useCallback(() => {
    const newOffset = calculateNewStopOffset(stops);
    const newStop: cg.GradientStop = {
      offset: newOffset,
      color: kolor.colorformats.RGBA32F.GRAY,
    };

    const sortedStops = [...stops, newStop].sort((a, b) => a.offset - b.offset);
    const newIndex = sortedStops.findIndex(
      (s) => s.offset === newOffset && s.color === newStop.color
    );

    onValueChange?.({ ...value, stops: sortedStops });
    onSelectedStopChange?.(newIndex);
  }, [
    stops,
    value,
    onValueChange,
    onSelectedStopChange,
    calculateNewStopOffset,
  ]);

  return (
    <div className="w-full">
      <div className="p-2">
        <GradientStopsSlider
          stops={stops}
          selectedStop={selectedStop}
          onSelectedStopChange={onSelectedStopChange}
          onValueChange={(stops) => {
            onValueChange?.({ ...value, stops });
          }}
        />
      </div>
      <hr className="my-2 w-full" />
      <header className="p-2 flex items-center justify-between">
        <Label className="text-xs">Stops</Label>
        <Button variant="ghost" size="icon" onClick={handleAddStop}>
          <PlusIcon className="size-3" />
        </Button>
      </header>
      <PropertyRows>
        {stops.map((stop, index) => (
          <GradientStopRow
            key={index}
            value={stop}
            canRemove={stops.length > 1}
            focused={selectedStop === index}
            onFocus={() => onSelectedStopChange?.(index)}
            onValueChange={(newStop) => {
              const newStops = [...stops];
              newStops[index] = newStop;
              onValueChange?.({ ...value, stops: newStops });
            }}
            onRemove={() => {
              const newStops = stops.filter((_, i) => i !== index);
              onValueChange?.({ ...value, stops: newStops });
            }}
          />
        ))}
      </PropertyRows>
    </div>
  );
}

function GradientStopRow({
  value: stop,
  onValueChange,
  canRemove,
  onRemove,
  focused,
  onFocus,
}: {
  value: cg.GradientStop;
  onValueChange?: (value: cg.GradientStop) => void;
  canRemove?: boolean;
  onRemove?: () => void;
  focused?: boolean;
  onFocus?: () => void;
}) {
  return (
    <PropertyRow className="flex items-center gap-2" focused={focused}>
      <div className="flex-1/4">
        <InputPropertyPercentage
          mode="fixed"
          value={stop.offset}
          min={0}
          max={1}
          onFocus={onFocus}
          onValueCommit={(v) => {
            onValueChange?.({ ...stop, offset: v });
          }}
          className="flex-1"
        />
      </div>
      <div className="flex-3/4">
        <RGBA32FColorControl
          value={stop.color}
          variant="with-opacity"
          onFocus={onFocus}
          onValueChange={(color) => {
            onValueChange?.({ ...stop, color });
          }}
        />
      </div>
      {canRemove && (
        <Button size="icon" variant="ghost" onClick={onRemove}>
          <MinusIcon />
        </Button>
      )}
    </PropertyRow>
  );
}
