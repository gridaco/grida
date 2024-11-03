import { WorkbenchUI } from "@/components/workbench";
import { RgbaColorPicker } from "react-colorful";
import { RGBAChip } from "./utils/solid-paint-chip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";

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
  onValueChange: (value: RGBA) => void;
}) {
  return (
    <div
      className={cn(
        WorkbenchUI.inputVariants({ size: "sm" }),
        "flex items-center"
      )}
    >
      <Popover>
        <PopoverTrigger>
          <RGBAChip rgba={value} />
        </PopoverTrigger>
        <PopoverContent align="start" side="right" sideOffset={16}>
          <RgbaColorPicker
            color={value}
            className="w-full"
            onChange={onValueChange}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
