import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";
import { cn } from "@/utils";
import { RGBAChip } from "./utils/paint-chip";
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
  value?: grida.program.css.Border;
  onValueChange?: (value?: grida.program.css.Border) => void;
}) {
  const onBorderWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange?.({
      ...value!,
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
        {value ? (
          <div
            className={cn(
              "flex items-center gap-2 border cursor-default",
              WorkbenchUI.inputVariants({
                size: "xs",
                variant: "paint-container",
              })
            )}
          >
            <RGBAChip rgba={value?.borderColor ?? { r: 0, g: 0, b: 0, a: 0 }} />
            {value?.borderStyle === "solid" && <>Solid</>}
            {value?.borderStyle === "dashed" && <>Dashed</>}
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2 border cursor-default",
              WorkbenchUI.inputVariants({
                size: "xs",
                variant: "paint-container",
              })
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
                className={WorkbenchUI.inputVariants({ size: "xs" })}
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
                onValueChange={(v: grida.program.css.Border["borderStyle"]) => {
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
                      "solid" satisfies grida.program.css.Border["borderStyle"]
                    }
                  >
                    Solid
                  </SelectItem>
                  <SelectItem
                    value={
                      "dashed" satisfies grida.program.css.Border["borderStyle"]
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
