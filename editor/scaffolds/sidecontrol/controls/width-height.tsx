"use client";

import { LockClosedIcon, LockOpen1Icon } from "@radix-ui/react-icons";
import { Toggle } from "@/components/ui/toggle";
import { PropertyLineLabel } from "../ui";
import { LengthPercentageControl } from "./length-percentage";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import type { TMixed } from "./utils/types";
import grida from "@grida/schema";

type LengthPercentage = grida.program.css.LengthPercentage;

export function WidthHeightControl({
  width,
  height,
  locked,
  onWidthChange,
  onHeightChange,
  onLockChange,
}: {
  width?: TMixed<LengthPercentage | "auto">;
  height?: TMixed<LengthPercentage | "auto">;
  locked: boolean;
  onWidthChange?: (value: LengthPercentage | "auto") => void;
  onHeightChange?: (value: LengthPercentage | "auto") => void;
  onLockChange?: (locked: boolean) => void;
}) {
  return (
    <div className="relative flex flex-col gap-2 py-1 px-4">
      {/* Lock icon positioned between label and controls, spanning both rows */}
      <div className="absolute left-16 top-0 bottom-0 z-10 flex items-center justify-center">
        {/* Top bracket connector (L-shaped, pointing to width input) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 border-0 border-l-2 border-t-2 border-border rounded-tl-sm"
          style={{ top: "0.5rem" }}
        />

        {/* Bottom bracket connector (L-shaped, pointing to height input) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 border-0 border-l-2 border-b-2 border-border rounded-bl-sm"
          style={{ bottom: "0.5rem" }}
        />

        <TogglePrimitive.Root
          aria-label={locked ? "Unlock aspect ratio" : "Lock aspect ratio"}
          pressed={locked}
          onPressedChange={(pressed) => {
            onLockChange?.(pressed);
          }}
          className="relative z-10 size-6 p-0.5 aspect-square cursor-pointer"
        >
          <div>
            {locked ? (
              <LockClosedIcon className="size-3 text-workbench-accent-sky" />
            ) : (
              <LockOpen1Icon className="size-3 text-muted-foreground" />
            )}
          </div>
        </TogglePrimitive.Root>
      </div>

      {/* Width row */}
      <div className="flex items-center gap-2">
        <PropertyLineLabel className="min-w-[3rem] shrink-0">
          Width
        </PropertyLineLabel>
        <div className="flex-1 flex items-center gap-2 ml-6">
          <LengthPercentageControl
            value={width}
            onValueCommit={onWidthChange}
          />
        </div>
      </div>

      {/* Height row */}
      <div className="flex items-center gap-2">
        <PropertyLineLabel className="min-w-[3rem] shrink-0">
          Height
        </PropertyLineLabel>
        <div className="flex-1 flex items-center gap-2 ml-6">
          <LengthPercentageControl
            value={height}
            onValueCommit={onHeightChange}
          />
        </div>
      </div>
    </div>
  );
}
