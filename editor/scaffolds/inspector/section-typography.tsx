import React from "react";
import { ReadonlyProperty } from "components/inspector";
import {
  PropertyLine,
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
} from "@editor-ui/property";
import { useTargetContainer } from "hooks/use-target-node";
import type { ReflectTextNode } from "@design-sdk/figma-node";

export function TypographySection() {
  const { target } = useTargetContainer();

  if (target?.type !== "TEXT") {
    return <></>;
  }

  const _lh = lineheight(target.lineHeight);

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Typography</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <PropertyLine label="Font">
          <ReadonlyProperty value={target.fontFamily} />
        </PropertyLine>
        <PropertyLine label="Size">
          <ReadonlyProperty value={target.fontSize} unit="px" />
        </PropertyLine>
        <PropertyLine label="Weight">
          <ReadonlyProperty value={target.fontWeight} />
        </PropertyLine>
        <PropertyLine label="Line height">
          <ReadonlyProperty value={_lh.value} unit={_lh.unit} />
        </PropertyLine>
        <PropertyLine label="Align">
          <ReadonlyProperty value={target.textAlign} />
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}

function lineheight(lh: ReflectTextNode["lineHeight"]): {
  value: number | string;
  unit?: "px" | "%";
} {
  if (typeof lh === "number") {
    return {
      value: lh,
      unit: "px",
    };
  }

  if (typeof lh === "string") {
    if (lh.endsWith("%")) {
      return {
        value: Number(lh.split("%")[0]),
        unit: "%",
      };
    }
  }

  return { value: lh as string };
}
