import { Switch } from "./utils/switch";

export function SwitchControl({
  value,
  onValueChange,
}: {
  value?: boolean;
  onValueChange?: (value: boolean) => void;
}) {
  return <Switch checked={value} onCheckedChange={onValueChange} />;
}
