import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inputVariants } from "./utils/input-variants";

type JustifyContent =
  | "start"
  | "center"
  | "space-between"
  | "space-around"
  | "space-evenly";

export function JustifyContentControl({
  value,
  onValueChange,
}: {
  value?: JustifyContent;
  onValueChange?: (value?: JustifyContent) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange?.(v as JustifyContent)}
    >
      <SelectTrigger className={inputVariants({ size: "sm" })}>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="start">Start</SelectItem>
        <SelectItem value="center">Center</SelectItem>
        <SelectItem value="space-between">Space Between</SelectItem>
        <SelectItem value="space-around">Space Around</SelectItem>
        <SelectItem value="space-evenly">Space Evenly</SelectItem>
      </SelectContent>
    </Select>
  );
}
