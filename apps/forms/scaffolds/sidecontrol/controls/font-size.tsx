import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";
import { Select } from "@radix-ui/react-select";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FontSizeControl({
  value,
  onValueChange,
}: {
  value?: number;
  onValueChange?: (value?: number) => void;
}) {
  return (
    <Input
      type="number"
      value={value}
      placeholder="inherit"
      min={1}
      step={1}
      className={inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(parseInt(e.target.value) || undefined);
      }}
    />
    // <Select>
    //   <SelectTrigger>
    //     <SelectValue />
    //   </SelectTrigger>
    //   <SelectContent>
    //     {Object.entries(twsizes).map(([key, value]) => (
    //       <SelectItem key={key} value={value.name}>
    //         {value.name}
    //       </SelectItem>
    //     ))}
    //   </SelectContent>
    // </Select>
  );
}

const twsizes = {
  "text-xs": {
    "font-size": 12,
    name: "xs",
  },
  "text-sm": {
    "font-size": 14,
    name: "sm",
  },
  "text-base": {
    "font-size": 16,
    name: "base",
  },
  "text-lg": {
    "font-size": 18,
    name: "lg",
  },
  "text-xl": {
    "font-size": 20,
    name: "xl",
  },
  "text-2xl": {
    "font-size": 24,
    name: "2xl",
  },
  "text-3xl": {
    "font-size": 30,
    name: "3xl",
  },
  "text-4xl": {
    "font-size": 36,
    name: "4xl",
  },
  "text-5xl": {
    "font-size": 48,
    name: "5xl",
  },
  "text-6xl": {
    "font-size": 60,
    name: "6xl",
  },
  "text-7xl": {
    "font-size": 72,
    name: "7xl",
  },
  "text-8xl": {
    "font-size": 96,
    name: "8xl",
  },
  "text-9xl": {
    "font-size": 128,
    name: "9xl",
  },
};
