import { WorkbenchUI } from "@/components/workbench";
import InputPropertyNumber from "../ui/number";
import grida from "@grida/schema";
import { cn } from "@/components/lib/utils";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";

type PositioningMode = grida.program.nodes.i.IPositioning["position"];

export function PositioningModeControl({
  value,
  onValueChange,
}: {
  value?: TMixed<PositioningMode>;
  onValueChange?: (value: PositioningMode) => void;
}) {
  return (
    <PropertyEnum
      tabIndex={-1}
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
  onValueCommit,
  disabled,
}: {
  value: grida.program.nodes.i.IPositioning;
  onValueCommit?: (value: grida.program.nodes.i.IPositioning) => void;
  disabled?: {
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
  };
}) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-center">
        <InputPropertyNumber
          mode="fixed"
          placeholder="--"
          aria-label="Top"
          type="number"
          value={value.top ?? ""}
          disabled={disabled?.top}
          onValueCommit={(v) => {
            onValueCommit?.({
              ...value,
              top: v,
            });
          }}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "w-16")}
        />
      </div>
      <div className="flex items-center justify-center">
        <InputPropertyNumber
          mode="fixed"
          placeholder="--"
          type="number"
          aria-label="Left"
          value={value.left ?? ""}
          disabled={disabled?.left}
          onValueCommit={(v) => {
            onValueCommit?.({
              ...value,
              left: v,
            });
          }}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "w-auto")}
        />
        <ConstraintsBox
          constraint={{
            left: value.left !== undefined,
            right: value.right !== undefined,
            top: value.top !== undefined,
            bottom: value.bottom !== undefined,
          }}
          disabled={disabled}
          onConstraintChange={(side, checked) => {
            onValueCommit?.({
              ...value,
              [side]: checked ? 0 : undefined,
            });
          }}
        />
        <InputPropertyNumber
          mode="fixed"
          placeholder="--"
          type="number"
          aria-label="Right"
          value={value.right ?? ""}
          disabled={disabled?.right}
          onValueCommit={(v) => {
            onValueCommit?.({
              ...value,
              right: v,
            });
          }}
          className={cn(WorkbenchUI.inputVariants({ size: "xs" }), "w-auto")}
        />
      </div>
      <div className="flex items-center justify-center">
        <InputPropertyNumber
          mode="fixed"
          placeholder="--"
          type="number"
          aria-label="Bottom"
          value={value.bottom ?? ""}
          disabled={disabled?.bottom}
          onValueCommit={(v) => {
            onValueCommit?.({
              ...value,
              bottom: v,
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
  disabled,
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
  disabled?: {
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
  };
}) {
  return (
    <div className="relative w-full aspect-square bg-muted flex items-center justify-center rounded-md m-2">
      <div className="absolute top-1 w-3 rotate-90">
        <AnchorLineButton
          checked={constraint.top}
          disabled={disabled?.top}
          onClick={() => onConstraintChange?.("top", !constraint.top)}
          tabIndex={-1}
        />
      </div>
      <div className="absolute left-1 w-3">
        <AnchorLineButton
          checked={constraint.left}
          disabled={disabled?.left}
          onClick={() => onConstraintChange?.("left", !constraint.left)}
          tabIndex={-1}
        />
      </div>
      <div className="absolute bottom-1 w-3 rotate-90">
        <AnchorLineButton
          checked={constraint.bottom}
          disabled={disabled?.bottom}
          onClick={() => onConstraintChange?.("bottom", !constraint.bottom)}
          tabIndex={-1}
        />
      </div>
      <div className="absolute right-1 w-3">
        <AnchorLineButton
          checked={constraint.right}
          disabled={disabled?.right}
          onClick={() => onConstraintChange?.("right", !constraint.right)}
          tabIndex={-1}
        />
      </div>
      <div className="w-1/3 aspect-square rounded-sm border" />
    </div>
  );
}

function AnchorLineButton({
  checked,
  onClick,
  tabIndex,
  disabled,
}: {
  checked?: boolean;
  onClick?: () => void;
  tabIndex?: number;
  disabled?: boolean;
}) {
  return (
    <button
      tabIndex={tabIndex}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="h-4 w-full flex items-center justify-center hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div
        data-checked={checked}
        className="w-full h-0.5 bg-muted-foreground data-[checked='true']:bg-workbench-accent-sky"
      />
    </button>
  );
}
