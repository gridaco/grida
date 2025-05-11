import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";
import type { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";

type LengthPercentage = grida.program.css.LengthPercentage;
type Mode = "percentage" | "fixed" | "auto";

function val(value: TMixed<LengthPercentage | "auto">): {
  type: "number" | "text";
  value: number | string;
} {
  if (value === grida.mixed) {
    return { type: "text", value: "mixed" };
  }
  if (value === "auto") {
    return { type: "text", value: "auto" };
  }
  if (typeof value === "number") {
    return { type: "number", value };
  }
  return { type: "number", value: value?.value };
}

export function LengthPercentageControl({
  value = "auto",
  onValueChange,
}: {
  value?: TMixed<LengthPercentage | "auto">;
  onValueChange?: (value: LengthPercentage | "auto") => void;
}) {
  const mode =
    value === grida.mixed
      ? grida.mixed
      : typeof value === "number"
        ? "fixed"
        : value === "auto"
          ? "auto"
          : "percentage";

  const onModeChange = (mode: Mode) => {
    switch (mode) {
      case "fixed":
        onValueChange?.(0);
        return;
      case "percentage":
        onValueChange?.({ type: "percentage", value: 100 });
        return;
      case "auto":
        onValueChange?.("auto");
        return;
    }
  };

  const { value: _value, type: _type } = val(value);

  return (
    <div className="flex items-center gap-2">
      <Input
        type={_type}
        value={_value}
        disabled={mode === "auto"}
        placeholder="<length-percentage> | auto"
        onChange={(e) => {
          const r = e.target.value;
          const n = parseFloat(r);
          if (isNaN(n)) {
            onValueChange?.("auto");
            return;
          } else {
            switch (mode) {
              case "fixed":
                onValueChange?.(n);
                return;
              case "percentage":
                onValueChange?.({ type: "percentage", value: n });
                return;
              case "auto":
                onValueChange?.(n);
                return;
            }
            return;
          }
        }}
        className={WorkbenchUI.inputVariants({ size: "xs" })}
      />
      <PropertyEnum<Mode>
        value={mode}
        onValueChange={onModeChange}
        enum={[
          {
            value: "fixed",
            label: "fixed",
          },
          {
            value: "percentage",
            label: "rel",
          },
          {
            value: "auto",
            label: "auto",
          },
        ]}
      />
    </div>
  );
}
