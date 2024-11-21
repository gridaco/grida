import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";
import { cn } from "@/utils";
import { PaintChip, RGBAChip } from "./utils/paint-chip";
import { RGBAColorControl } from "./color";
import { PropertyLine, PropertyLineLabel } from "../ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function BorderControl({
  value,
  onValueChange,
}: {
  value: grida.program.nodes.i.ICSSBorder;
  onValueChange?: (value?: grida.program.nodes.i.ICSSBorder) => void;
}) {
  const onBorderWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange?.({
      ...(value || {}),
      borderWidth: parseInt(e.target.value),
    });
  };

  const onAddBorder = () => {
    onValueChange?.({
      borderColor: { r: 0, g: 0, b: 0, a: 1 },
      borderStyle: "solid",
      borderWidth: 1,
    });
  };

  return (
    <Popover>
      <PopoverTrigger className="w-full">
        {value.borderStyle === "none" ? (
          <div
            className={cn(
              "flex items-center gap-2 border cursor-default",
              WorkbenchUI.inputVariants({ size: "sm" })
            )}
            onClick={onAddBorder}
          >
            <RGBAChip
              rgba={{
                r: 0,
                g: 0,
                b: 0,
                a: 0,
              }}
            />
            Add
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2 border cursor-default",
              WorkbenchUI.inputVariants({ size: "sm" })
            )}
          >
            <RGBAChip rgba={value?.borderColor ?? { r: 0, g: 0, b: 0, a: 0 }} />
            {value?.borderStyle === "solid" && <>Solid</>}
            {value?.borderStyle === "dashed" && <>Dashed</>}
          </div>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" side="top">
        <Label>Border</Label>
        <hr className="my-2" />
        {value?.borderColor && (
          <div className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Color</PropertyLineLabel>
              <RGBAColorControl
                value={value.borderColor}
                onValueChange={(v) => {
                  onValueChange?.({
                    ...(value || {}),
                    borderColor: v,
                  });
                }}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Width</PropertyLineLabel>
              {/* TODO: individual handling */}
              <Input
                type="number"
                className={WorkbenchUI.inputVariants({ size: "sm" })}
                min={0}
                value={
                  typeof value?.borderWidth === "number"
                    ? value.borderWidth
                    : ""
                }
                onChange={onBorderWidthChange}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Style</PropertyLineLabel>
              <Select
                defaultValue={value.borderStyle}
                onValueChange={(
                  v: grida.program.nodes.i.ICSSBorder["borderStyle"]
                ) => {
                  onValueChange?.({
                    ...(value || {}),
                    borderStyle: v,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value={
                      "solid" satisfies grida.program.nodes.i.ICSSBorder["borderStyle"]
                    }
                  >
                    Solid
                  </SelectItem>
                  <SelectItem
                    value={
                      "dashed" satisfies grida.program.nodes.i.ICSSBorder["borderStyle"]
                    }
                  >
                    Dashed
                  </SelectItem>
                </SelectContent>
              </Select>
            </PropertyLine>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
