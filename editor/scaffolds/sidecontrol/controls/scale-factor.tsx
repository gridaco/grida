import { cn } from "@/components/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
} from "@/components/ui-editor/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import InputPropertyNumber from "../ui/number";

const DEFAULT_SCALE_PRESETS = [0.25, 0.5, 1, 2, 3, 4, 5, 10] as const;

export function ScaleFactorControl({
  value,
  onValueCommit,
  presets = DEFAULT_SCALE_PRESETS,
  autoFocus,
  onInputBlur,
}: {
  value: number;
  onValueCommit: (value: number) => void;
  presets?: ReadonlyArray<number>;
  autoFocus?: boolean;
  onInputBlur?: React.FocusEventHandler<HTMLInputElement>;
}) {
  const hasPreset = presets.some((p) => Math.abs(p - value) < 1e-9);

  return (
    <div className="relative">
      <InputPropertyNumber
        mode="fixed"
        type="number"
        value={value}
        placeholder="1"
        autoFocus={autoFocus}
        suffix="x"
        min={0.01}
        step={0.01}
        onValueCommit={onValueCommit}
        onBlur={onInputBlur}
        className={cn(
          "overflow-hidden",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        )}
      />
      <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center border-l">
        <Select
          value={hasPreset ? String(value) : undefined}
          onValueChange={(_v) => {
            const next = parseFloat(_v);
            onValueCommit(next);
          }}
        >
          <SelectPrimitive.SelectTrigger asChild>
            <button className="w-full text-muted-foreground flex items-center justify-center size-6 p-1 opacity-50">
              <ChevronDownIcon />
            </button>
          </SelectPrimitive.SelectTrigger>
          <SelectContent align="end">
            {presets.map((s) => (
              <SelectItem key={String(s)} value={String(s)}>
                {s}x
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
