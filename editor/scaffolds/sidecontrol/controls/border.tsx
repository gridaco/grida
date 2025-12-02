import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkbenchUI } from "@/components/workbench";
import grida from "@grida/schema";
import kolor from "@grida/color";
import { cn } from "@/components/lib/utils";
import { RGBA32FChip } from "./utils/paint-chip";
import { RGBA32FColorControl } from "./color";
import { PropertyEnum, PropertyLine, PropertyLineLabel } from "../ui";
import { Label } from "@/components/ui/label";
import { Cross2Icon } from "@radix-ui/react-icons";

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
      border_width: parseInt(e.target.value),
    });
  };

  const onAddBorder = () => {
    onValueChange?.({
      border_color: kolor.colorformats.RGBA32F.BLACK,
      border_style: "solid",
      border_width: 1,
    });
  };

  const onRemove = () => {
    onValueChange?.(undefined);
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
            <RGBA32FChip
              rgba={
                value?.border_color ?? kolor.colorformats.RGBA32F.TRANSPARENT
              }
              className="rounded-sm"
            />
            {value?.border_style === "solid" && <>Solid</>}
            {value?.border_style === "dashed" && <>Dashed</>}
            <span
              role="button"
              onClick={onRemove}
              className="px-1 py-1 ms-auto me-0.5 text-muted-foreground"
            >
              <Cross2Icon className="w-3.5 h-3.5" />
            </span>
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
            <RGBA32FChip rgba={kolor.colorformats.RGBA32F.TRANSPARENT} />
            Add
          </div>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" side="top">
        <Label>Border</Label>
        <hr className="my-2" />
        {value?.border_color && (
          <div className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Color</PropertyLineLabel>
              <RGBA32FColorControl
                value={value.border_color}
                onValueChange={(v) => {
                  onValueChange?.({
                    ...(value || {}),
                    border_color: v,
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
                  typeof value?.border_width === "number"
                    ? value.border_width
                    : ""
                }
                onChange={onBorderWidthChange}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Style</PropertyLineLabel>
              <PropertyEnum<grida.program.css.Border["border_style"]>
                enum={[
                  { value: "solid", label: "Solid" },
                  { value: "dashed", label: "Dashed" },
                ]}
                value={value.border_style}
                onValueChange={(v) => {
                  onValueChange?.({
                    ...(value || {}),
                    border_style: v,
                  });
                }}
              />
            </PropertyLine>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
