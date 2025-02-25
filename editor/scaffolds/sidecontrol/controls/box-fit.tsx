import React from "react";
import { grida } from "@/grida";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";

export function BoxFitControl({
  value = "none",
  onValueChange,
}: {
  value?: TMixed<grida.program.cg.BoxFit>;
  onValueChange?: (value: grida.program.cg.BoxFit) => void;
}) {
  return (
    <PropertyEnum<grida.program.cg.BoxFit>
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
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
