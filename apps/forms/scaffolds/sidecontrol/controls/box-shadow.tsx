import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inputVariants } from "./utils/input-variants";

type BoxShadow = {
  boxShadow?: string;
};

export function BoxShadowControl({
  value,
  onValueChange,
}: {
  value?: BoxShadow;
  onValueChange?: (value?: BoxShadow) => void;
}) {
  const onChange = (v?: string) => {
    onValueChange?.({
      ...(value || {}),
      boxShadow: v,
    });
  };

  return (
    <Select value={value?.boxShadow} onValueChange={onChange}>
      <SelectTrigger className={inputVariants({ size: "sm" })}>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        {Object.keys(twshadow).map((key) => {
          const shadow = twshadow[key as keyof typeof twshadow];
          return (
            <SelectItem key={key} value={shadow.style.boxShadow}>
              {shadow.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

const twshadow = {
  "shadow-none": {
    label: "None",
    className: "shadow-none",
    style: {
      boxShadow: "0 0 #0000",
    },
  },
  "shadow-sm": {
    label: "Small",
    className: "shadow-sm",
    style: {
      boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    },
  },
  shadow: {
    label: "Default",
    className: "shadow",
    style: {
      boxShadow:
        "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
    },
  },
  "shadow-md": {
    label: "Medium",
    className: "shadow-md",
    style: {
      boxShadow:
        "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    },
  },
  "shadow-lg": {
    label: "Large",
    className: "shadow-lg",
    style: {
      boxShadow:
        "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    },
  },
  "shadow-xl": {
    label: "Extra Large",
    className: "shadow-xl",
    style: {
      boxShadow:
        "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    },
  },
  "shadow-2xl": {
    label: "2 Extra Large",
    className: "shadow-2xl",
    style: {
      boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    },
  },
  "shadow-inner": {
    label: "Inner",
    className: "shadow-inner",
    style: {
      boxShadow: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
    },
  },
} as const;
