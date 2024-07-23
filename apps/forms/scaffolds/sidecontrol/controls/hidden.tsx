import { Switch } from "@/components/ui/switch";

export function HiddenControl({
  value,
  onValueChange,
}: {
  value?: boolean;
  onValueChange?: (value: boolean) => void;
}) {
  return <Switch checked={value} onCheckedChange={onValueChange} />;
}
