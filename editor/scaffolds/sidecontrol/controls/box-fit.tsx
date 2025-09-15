import React from "react";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";
import type cg from "@grida/cg";

export function BoxFitControl({
  value = "none",
  onValueChange,
}: {
  value?: TMixed<cg.BoxFit>;
  onValueChange?: (value: cg.BoxFit) => void;
}) {
  return (
    <PropertyEnum<cg.BoxFit>
      enum={[
        {
          value: "none",
          label: "None",
        },
        {
          value: "contain",
          label: "Contain",
        },
        {
          value: "cover",
          label: "Cover",
        },
        {
          value: "fill",
          label: "Fill",
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
