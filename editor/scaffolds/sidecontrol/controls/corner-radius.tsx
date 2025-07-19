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

type CornerRadius = Partial<
  grida.program.nodes.i.ICornerRadius &
    grida.program.nodes.i.IRectangularCornerRadius
>;

export function CornerRadiusControl({
  disabled,
  value,
  onValueCommit,
}: {
  disabled?: boolean;
  value?: CornerRadius;
  onValueCommit?: (value: cg.CornerRadius) => void;
}) {
  const mode = Array.isArray(value) ? "each" : "all";

  return (
    <Popover>
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
            value={mode === "all" ? (value as number) : ""}
            placeholder={mode === "all" ? "0" : "mixed"}
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
        <CornerRadius4Control
          value={[
            value?.cornerRadiusTopLeft ?? value?.cornerRadius ?? 0,
            value?.cornerRadiusTopRight ?? value?.cornerRadius ?? 0,
            value?.cornerRadiusBottomRight ?? value?.cornerRadius ?? 0,
            value?.cornerRadiusBottomLeft ?? value?.cornerRadius ?? 0,
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

function CornerRadius4Control({
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
          />
        </PropertyInputContainer>
        <PropertyInputContainer>
          <CornerTopRightIcon className="size-3" />
          <InputPropertyNumber
            mode="fixed"
            type="number"
            value={topRight}
            onValueCommit={(v) => onCommit(v, 1)}
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
          />
        </PropertyInputContainer>
        <PropertyInputContainer>
          <CornerBottomRightIcon className="size-3" />
          <InputPropertyNumber
            mode="fixed"
            type="number"
            value={bottomRight}
            onValueCommit={(v) => onCommit(v, 2)}
          />
        </PropertyInputContainer>
      </div>
    </div>
  );
}
