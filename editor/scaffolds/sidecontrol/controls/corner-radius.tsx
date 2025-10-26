import { Button } from "@/components/ui/button";
import InputPropertyNumber from "../ui/number";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkbenchUI } from "@/components/workbench";
import cg from "@grida/cg";
import {
  CornerTopLeftIcon,
  CornerTopRightIcon,
  CornerBottomRightIcon,
  CornerBottomLeftIcon,
  CornersIcon,
} from "@radix-ui/react-icons";
import { PropertyInputContainer } from "../ui";
import grida from "@grida/schema";
import { useMemo } from "react";

function isUniform(value: grida.program.nodes.i.IRectangularCornerRadius) {
  const _tl = value.cornerRadiusTopLeft;
  const is_all_4_uniform =
    _tl === value.cornerRadiusTopRight &&
    _tl === value.cornerRadiusBottomRight &&
    _tl === value.cornerRadiusBottomLeft;

  return is_all_4_uniform;
}

export function CornerRadiusControl({
  value = 0,
  disabled,
  onValueCommit,
}: {
  value?: number;
  disabled?: boolean;
  onValueCommit?: (value: cg.CornerRadius) => void;
}) {
  return (
    <div
      className={WorkbenchUI.inputVariants({
        variant: "container",
        size: "xs",
      })}
    >
      <InputPropertyNumber
        mode="fixed"
        disabled={disabled}
        type="number"
        value={value}
        placeholder={"0"}
        min={0}
        step={1}
        onValueCommit={onValueCommit}
      />
    </div>
  );
}

export function CornerRadius4Control({
  disabled,
  value,
  onValueCommit,
}: {
  disabled?: boolean;
  value?: grida.program.nodes.i.IRectangularCornerRadius;
  onValueCommit?: (value: cg.CornerRadius) => void;
}) {
  const mode = useMemo(() => {
    if (!value) return "all";
    return isUniform(value) ? "all" : "each";
  }, [value]);

  const uniformValue = useMemo(() => {
    if (!value) return undefined;
    if (!isUniform(value)) return undefined;
    return value.cornerRadiusTopLeft; // asserted uniform, use top left
  }, [value]);

  return (
    <Popover modal={false}>
      <div className="flex flex-col gap-2">
        <div
          className={WorkbenchUI.inputVariants({
            variant: "container",
            size: "xs",
          })}
        >
          <InputPropertyNumber
            mode="fixed"
            disabled={disabled}
            type="number"
            value={mode === "all" ? (uniformValue ?? "") : ""}
            placeholder={mode === "all" ? "-" : "mixed"}
            min={0}
            step={1}
            onValueCommit={onValueCommit}
          />
          <PopoverTrigger asChild>
            <Button
              disabled={disabled}
              variant={mode === "each" ? "secondary" : "ghost"}
              size="icon"
              className="size-8 min-w-8"
            >
              <CornersIcon />
            </Button>
          </PopoverTrigger>
        </div>
      </div>
      <PopoverContent>
        <Radius4Control
          value={[
            value?.cornerRadiusTopLeft ?? 0,
            value?.cornerRadiusTopRight ?? 0,
            value?.cornerRadiusBottomRight ?? 0,
            value?.cornerRadiusBottomLeft ?? 0,
          ]}
          onValueCommit={(v) => {
            if (cg.cornerRadius4Identical(v)) {
              onValueCommit?.(v[0]);
              return;
            }
            onValueCommit?.(v);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function Radius4Control({
  value,
  onValueCommit,
}: {
  value: cg.CornerRadius4;
  onValueCommit?: (value: cg.CornerRadius4) => void;
}) {
  const [topLeft, topRight, bottomRight, bottomLeft] = value;

  const onCommit = (v: number, index: number) => {
    const newValue = [...value];
    const n = v || 0;
    newValue[index] = n;
    onValueCommit?.(newValue as cg.CornerRadius4);
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <PropertyInputContainer>
          <CornerTopLeftIcon className="size-3" />
          <InputPropertyNumber
            mode="fixed"
            type="number"
            value={topLeft}
            onValueCommit={(v) => onCommit(v, 0)}
            min={0}
          />
        </PropertyInputContainer>
        <PropertyInputContainer>
          <CornerTopRightIcon className="size-3" />
          <InputPropertyNumber
            mode="fixed"
            type="number"
            value={topRight}
            onValueCommit={(v) => onCommit(v, 1)}
            min={0}
          />
        </PropertyInputContainer>
      </div>
      <div className="flex items-center gap-2">
        <PropertyInputContainer>
          <CornerBottomLeftIcon className="size-3" />
          <InputPropertyNumber
            mode="fixed"
            type="number"
            value={bottomLeft}
            onValueCommit={(v) => onCommit(v, 3)}
            min={0}
          />
        </PropertyInputContainer>
        <PropertyInputContainer>
          <CornerBottomRightIcon className="size-3" />
          <InputPropertyNumber
            mode="fixed"
            type="number"
            value={bottomRight}
            onValueCommit={(v) => onCommit(v, 2)}
            min={0}
          />
        </PropertyInputContainer>
      </div>
    </div>
  );
}
