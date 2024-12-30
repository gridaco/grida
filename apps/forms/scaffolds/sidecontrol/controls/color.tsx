import { WorkbenchUI } from "@/components/workbench";
import { RGBAChip } from "./utils/paint-chip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";
import { grida } from "@/grida";
import { ColorPicker } from "./color-picker";

type RGBA = { r: number; g: number; b: number; a: number };

export type RGBAColorControlProps = {
  value: RGBA;
  onValueChange: (value: RGBA) => void;
};

export function RGBAColorControl({
  value,
  onValueChange,
}: {
  value: RGBA;
  onValueChange?: (value: RGBA) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger className="w-full">
        <div
          className={cn(
            "flex items-center border cursor-default",
            WorkbenchUI.inputVariants({ size: "xs" })
          )}
        >
          <RGBAChip rgba={value} />
          <span className="ms-2">#{grida.program.css.rgbaToHex(value)}</span>
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        sideOffset={16}
        className="p-0"
      >
        <ColorPicker color={value} onColorChange={onValueChange} />
      </PopoverContent>
    </Popover>
  );
}
