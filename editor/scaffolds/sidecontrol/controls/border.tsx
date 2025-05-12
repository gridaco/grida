import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WorkbenchUI } from "@/components/workbench";
import grida from "@grida/schema";
import { cn } from "@/components/lib/utils";
import { RGBAChip } from "./utils/paint-chip";
import { RGBAColorControl } from "./color";
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
      borderColor: { r: 0, g: 0, b: 0, a: 1 },
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
            <RGBAChip rgba={value?.borderColor ?? { r: 0, g: 0, b: 0, a: 0 }} />
            {value?.borderStyle === "solid" && <>Solid</>}
            {value?.borderStyle === "dashed" && <>Dashed</>}
            <button
              onClick={onRemove}
              className="px-1 py-1 me-0.5 text-muted-foreground"
            >
              <Cross2Icon className="w-3.5 h-3.5" />
            </button>
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
