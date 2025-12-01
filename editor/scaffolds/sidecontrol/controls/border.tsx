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
import { RGB888A32FChip } from "./utils/paint-chip";
import { RGB888A32FColorControl } from "./color";
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
      borderWidth: parseInt(e.target.value),
    });
  };

  const onAddBorder = () => {
    onValueChange?.({
      borderColor: kolor.colorformats.RGB888A32F.BLACK,
      borderStyle: "solid",
      borderWidth: 1,
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
            <RGB888A32FChip
              rgba={
                value?.borderColor ?? kolor.colorformats.RGB888A32F.TRANSPARENT
              }
              className="rounded-sm"
            />
            {value?.borderStyle === "solid" && <>Solid</>}
            {value?.borderStyle === "dashed" && <>Dashed</>}
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
            <RGB888A32FChip rgba={kolor.colorformats.RGB888A32F.TRANSPARENT} />
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
              <RGB888A32FColorControl
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
              <PropertyEnum<grida.program.css.Border["borderStyle"]>
                enum={[
                  { value: "solid", label: "Solid" },
                  { value: "dashed", label: "Dashed" },
                ]}
                value={value.borderStyle}
                onValueChange={(v) => {
                  onValueChange?.({
                    ...(value || {}),
                    borderStyle: v,
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
