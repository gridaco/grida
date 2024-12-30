import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";
import { cn } from "@/utils";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";

function parseIntFallback(
  value: string,
  fallback: number | undefined = undefined
): number | undefined {
  const i = parseInt(value);
  const v = Number.isNaN(i) ? fallback : i;
  return v;
}

type PositioningMode = grida.program.nodes.i.IPositioning["position"];

export function PositioningModeControl({
  value,
  onValueChange,
}: {
  value: TMixed<PositioningMode>;
  onValueChange?: (value: PositioningMode) => void;
}) {
  return (
    <PropertyEnum
      enum={[
        {
          value: "absolute",
          label: "Absolute",
        },
        {
          value: "relative",
          label: "Relative",
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}

export function PositioningConstraintsControl({
  value,
  onValueChange,
}: {
  value: grida.program.nodes.i.IPositioning;
  onValueChange?: (value: grida.program.nodes.i.IPositioning) => void;
}) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-center">
        <Input
          placeholder="--"
          type="number"
          value={value.top ?? ""}
          onChange={(e) => {
            onValueChange?.({
              ...value,
              top: parseIntFallback(e.target.value),
            });
          }}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "w-16")}
        />
      </div>
      <div className="flex items-center justify-center">
        <Input
          placeholder="--"
          type="number"
          value={value.left ?? ""}
          onChange={(e) => {
            onValueChange?.({
              ...value,
              left: parseIntFallback(e.target.value),
            });
          }}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "w-16")}
        />
        <ConstraintsBox
          constraint={{
            left: value.left !== undefined,
            right: value.right !== undefined,
            top: value.top !== undefined,
            bottom: value.bottom !== undefined,
          }}
          onConstraintChange={(side, checked) => {
            onValueChange?.({
              ...value,
              [side]: checked ? 0 : undefined,
            });
          }}
        />
        <Input
          placeholder="--"
          type="number"
          value={value.right ?? ""}
          onChange={(e) => {
            onValueChange?.({
              ...value,
              right: parseIntFallback(e.target.value),
            });
          }}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "w-16")}
        />
      </div>
      <div className="flex items-center justify-center">
        <Input
          placeholder="--"
          type="number"
          value={value.bottom ?? ""}
          onChange={(e) => {
            onValueChange?.({
              ...value,
              bottom: parseIntFallback(e.target.value),
            });
          }}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "w-16")}
        />
      </div>
    </div>
  );
}

function ConstraintsBox({
  constraint,
  onConstraintChange,
}: {
  constraint: {
    left: boolean;
    right: boolean;
    top: boolean;
    bottom: boolean;
  };
  onConstraintChange?: (
    side: "left" | "right" | "top" | "bottom",
    checked: boolean
  ) => void;
}) {
  return (
    <div className="relative w-full aspect-square bg-muted flex items-center justify-center rounded-md m-2">
      <div className="absolute top-1 w-3 rotate-90">
        <AnchorLineButton
          checked={constraint.top}
          onClick={() => onConstraintChange?.("top", !constraint.top)}
        />
      </div>
      <div className="absolute left-1 w-3">
        <AnchorLineButton
          checked={constraint.left}
          onClick={() => onConstraintChange?.("left", !constraint.left)}
        />
      </div>
      <div className="absolute bottom-1 w-3 rotate-90">
        <AnchorLineButton
          checked={constraint.bottom}
          onClick={() => onConstraintChange?.("bottom", !constraint.bottom)}
        />
      </div>
      <div className="absolute right-1 w-3">
        <AnchorLineButton
          checked={constraint.right}
          onClick={() => onConstraintChange?.("right", !constraint.right)}
        />
      </div>
      <div className="w-1/3 aspect-square rounded border" />
    </div>
  );
}

function AnchorLineButton({
  checked,
  onClick,
}: {
  checked?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-4 w-full flex items-center justify-center hover:bg-accent"
    >
      <div
        data-checked={checked}
        className="w-full h-0.5 bg-muted-foreground data-[checked='true']:bg-workbench-accent-sky"
      />
    </button>
  );
}
