import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";
import {
  HexColorPicker,
  HslStringColorPicker,
  HsvStringColorPicker,
  HsvaStringColorPicker,
  RgbStringColorPicker,
  RgbaStringColorPicker,
} from "react-colorful";
import parse from "color-parse";

const picker = {
  hex: HexColorPicker,
  hsl: HslStringColorPicker,
  hsv: HsvStringColorPicker,
  hsva: HsvaStringColorPicker,
  rgb: RgbStringColorPicker,
  rgba: RgbaStringColorPicker,
  noop: () => null,
};

export function ColorPickerChip({
  id,
  disabled,
  value,
  className,
  onValueChange,
}: {
  disabled?: boolean;
  id?: string;
  value: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  const { space } = parse(value);

  const Picker =
    space && space in picker
      ? picker[space as keyof typeof picker]
      : picker.noop;

  const no_picker = Picker === picker.noop;

  return (
    <Popover>
      <PopoverTrigger id={id} disabled={disabled || no_picker}>
        <div
          className={cn("size-10 border-2 border-ring rounded-md", className)}
          style={{
            backgroundColor: value,
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-full">
        <Picker className="w-full" color={value} onChange={onValueChange} />
      </PopoverContent>
    </Popover>
  );
}
