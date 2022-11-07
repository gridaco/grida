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

  const {
    id,
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight: _lineHeight,
    textAlign,
  } = target;
  const lineHeight = lineheight(_lineHeight);

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Typography</h6>
      </PropertyGroupHeader>
      <PropertyLines key={id}>
        <PropertyLine label="Font">
          <ReadonlyProperty value={fontFamily} />
        </PropertyLine>
        <PropertyLine label="Size">
          <ReadonlyProperty value={fontSize} unit="px" />
        </PropertyLine>
        <PropertyLine label="Weight">
          <ReadonlyProperty value={fontWeight} />
        </PropertyLine>
        <PropertyLine label="Line height">
          <ReadonlyProperty value={lineHeight.value} unit={lineHeight.unit} />
        </PropertyLine>
        <PropertyLine label="Align">
          <ReadonlyProperty value={textAlign} />
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
