import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkbenchUI } from "@/components/workbench";

const default_limit_options = [10, 100, 500, 1000] as const;

export function GridQueryLimitSelect({
  value,
  onValueChange,
}: {
  value?: number;
  onValueChange?: (value: number) => void;
}) {
  return (
    <div>
      <Select
        value={value + ""}
        onValueChange={(value) => {
          onValueChange?.(parseInt(value));
        }}
      >
        <SelectTrigger
          className={WorkbenchUI.selectVariants({
            variant: "trigger",
            size: "sm",
          })}
        >
          <SelectValue placeholder="rows" />
        </SelectTrigger>
        <SelectContent>
          {default_limit_options.map((n) => (
            <SelectItem key={n} value={n + ""}>
              {n} rows
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
