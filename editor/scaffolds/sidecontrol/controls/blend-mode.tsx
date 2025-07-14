import React from "react";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";
import type cg from "@grida/cg";

export function BlendModeControl({
  value = "normal",
  onValueChange,
}: {
  value?: TMixed<cg.BlendMode>;
  onValueChange?: (value: cg.BlendMode) => void;
}) {
  return (
    <PropertyEnum<cg.BlendMode>
      enum={[
        {
          value: "normal",
          label: "Normal",
        },
        {
          value: "multiply",
          label: "Multiply",
        },
        {
          value: "screen",
          label: "Screen",
        },
        {
          value: "overlay",
          label: "Overlay",
        },
        {
          value: "darken",
          label: "Darken",
        },
        {
          value: "lighten",
          label: "Lighten",
        },
        {
          value: "color-dodge",
          label: "Color Dodge",
        },
        {
          value: "color-burn",
          label: "Color Burn",
        },
        {
          value: "hard-light",
          label: "Hard Light",
        },
        {
          value: "soft-light",
          label: "Soft Light",
        },
        {
          value: "difference",
          label: "Difference",
        },
        {
          value: "exclusion",
          label: "Exclusion",
        },
        {
          value: "hue",
          label: "Hue",
        },
        {
          value: "saturation",
          label: "Saturation",
        },
        {
          value: "color",
          label: "Color",
        },
        {
          value: "luminosity",
          label: "Luminosity",
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
