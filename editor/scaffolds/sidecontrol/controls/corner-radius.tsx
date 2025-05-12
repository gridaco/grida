import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";
import {
  CornerTopLeftIcon,
  CornerTopRightIcon,
  CornerBottomRightIcon,
  CornerBottomLeftIcon,
  CornersIcon,
} from "@radix-ui/react-icons";
import { PropertyInput } from "../ui";

export function CornerRadiusControl({
  disabled,
  value,
  onValueChange,
}: {
  disabled?: boolean;
  value?: grida.program.nodes.i.IRectangleCorner["cornerRadius"];
  onValueChange?: (
    value: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
  ) => void;
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
          <Input
            disabled={disabled}
            type="number"
            value={mode === "all" ? (value as number) : ""}
            placeholder={mode === "all" ? "0" : "mixed"}
            min={0}
            step={1}
            className={WorkbenchUI.inputVariants({ size: "xs" })}
            onChange={(e) => {
              onValueChange?.(parseInt(e.target.value));
            }}
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
          value={
            Array.isArray(value)
              ? (value as grida.program.cg.CornerRadius4)
              : value
                ? [value, value, value, value]
                : [0, 0, 0, 0]
          }
          onValueChange={(v) => {
            if (grida.program.cg.cornerRadius4Identical(v)) {
              onValueChange?.(v[0]);
              return;
            }
            onValueChange?.(v);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function CornerRadius4Control({
  value,
  onValueChange,
}: {
  value: grida.program.cg.CornerRadius4;
  onValueChange?: (value: grida.program.cg.CornerRadius4) => void;
}) {
  const [topLeft, topRight, bottomRight, bottomLeft] = value;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const newValue = [...value];
    const n = parseInt(e.target.value) || 0;
    newValue[index] = n;
    onValueChange?.(newValue as grida.program.cg.CornerRadius4);
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <PropertyInput
          type="number"
          value={topLeft}
          onChange={(e) => onChange(e, 0)}
          icon={<CornerTopLeftIcon className="size-3" />}
        />
        <PropertyInput
          type="number"
          value={topRight}
          onChange={(e) => onChange(e, 1)}
          icon={<CornerTopRightIcon className="size-3" />}
        />
      </div>
      <div className="flex items-center gap-2">
        <PropertyInput
          type="number"
          value={bottomLeft}
          onChange={(e) => onChange(e, 3)}
          icon={<CornerBottomLeftIcon className="size-3" />}
        />
        <PropertyInput
          type="number"
          value={bottomRight}
          onChange={(e) => onChange(e, 2)}
          icon={<CornerBottomRightIcon className="size-3" />}
        />
      </div>
    </div>
  );
}
