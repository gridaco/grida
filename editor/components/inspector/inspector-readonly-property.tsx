import React from "react";
import { copy } from "utils/clipboard";
import { PropertyInput, PropertyInputProps } from "@editor-ui/property";

export function ReadonlyProperty({
  value,
  unit,
  hideEmpty,
  ...props
}: {
  unit?: "px" | "%";
  hideEmpty?: boolean;
} & Omit<PropertyInputProps, "readonly" | "onClick">) {
  const snippet = pretty(value, unit);
  const isempty = !value;
  const onclick = () => {
    if (isempty) {
      return;
    }

    copy(snippet, { notify: true });
  };

  if (hideEmpty && isempty) {
    return <></>;
  }

  return (
    <PropertyInput
      readonly
      disabled={isempty}
      onClick={onclick}
      value={snippet}
      {...props}
    />
  );
}

// round to 2 decimals
const rd = (d) => Math.round((d as number) * 100) / 100;

const pretty = (value: number | string, unit?: "px" | "%"): string => {
  switch (unit) {
    case "px":
      return rd(value) + "px";
    case "%":
      return rd(value) + "%";
    default:
      return value?.toString() || "";
  }
};
