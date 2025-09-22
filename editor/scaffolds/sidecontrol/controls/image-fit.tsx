import React from "react";
import { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";
import type cg from "@grida/cg";

type ImageFit = cg.ImagePaint["fit"];

export function ImageFitControl({
  value = "none",
  onValueChange,
  className,
}: {
  value?: TMixed<ImageFit>;
  onValueChange?: (value: ImageFit) => void;
  className?: string;
}) {
  return (
    <PropertyEnum<ImageFit>
      className={className}
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
        {
          value: "transform",
          label: "Crop",
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
