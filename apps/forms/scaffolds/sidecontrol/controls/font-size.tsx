import { Input } from "@/components/ui/input";

export function FontSizeControl({
  value,
  onValueChange,
}: {
  value?: number;
  onValueChange?: (value: number) => void;
}) {
  return (
    <Input
      type="number"
      value={value}
      min={1}
      step={1}
      onChange={(e) => {
        onValueChange?.(parseInt(e.target.value));
      }}
    />
  );
}
