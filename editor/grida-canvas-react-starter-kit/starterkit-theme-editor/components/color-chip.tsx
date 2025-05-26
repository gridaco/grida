import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/components/lib/utils";
import parse from "color-parse";
import { pickers } from "@/components/color-picker";

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
    space && space in pickers
      ? pickers[space as keyof typeof pickers]
      : pickers.noop;

  const no_picker = Picker === pickers.noop;

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
