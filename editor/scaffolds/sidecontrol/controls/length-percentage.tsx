import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import InputPropertyNumber from "../ui/number";
import grida from "@grida/schema";
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
  onValueCommit,
}: {
  value?: TMixed<LengthPercentage | "auto">;
  onValueCommit?: (value: LengthPercentage | "auto") => void;
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
        onValueCommit?.(0);
        return;
      case "percentage":
        onValueCommit?.({ type: "percentage", value: 100 });
        return;
      case "auto":
        onValueCommit?.("auto");
        return;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <__Input value={value} mode={mode} onValueCommit={onValueCommit} />
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

function __Input({
  value,
  mode,
  onValueCommit,
}: {
  value: TMixed<LengthPercentage | "auto">;
  mode: Mode | typeof grida.mixed;
  onValueCommit?: (value: LengthPercentage | "auto") => void;
}) {
  const { value: _value, type: _type } = val(value);

  if (_type === "number") {
    return (
      <InputPropertyNumber
        mode="fixed"
        value={_value as number}
        onValueCommit={(v) => {
          switch (mode) {
            case "fixed":
              onValueCommit?.(v);
              return;
            case "percentage":
              onValueCommit?.({ type: "percentage", value: v });
              return;
          }
        }}
      />
    );
  } else {
    return (
      <Input
        type={_type}
        value={_value}
        disabled
        placeholder="<length-percentage> | auto"
        className={WorkbenchUI.inputVariants({ size: "xs" })}
      />
    );
  }
}
