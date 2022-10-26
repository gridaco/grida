import React from "react";
import { InspectorSection, ReadonlyProperty } from "components/inspector";
import { useTargetContainer } from "hooks/use-target-node";
import type { ReflectTextNode } from "@design-sdk/figma-node";
import { roundNumber } from "@reflect-ui/uiutils";

export function TypographySection() {
  const { target } = useTargetContainer();

  if (target?.type !== "TEXT") {
    return <></>;
  }

  const _lh = lineheight(target.lineHeight);

  return (
    <InspectorSection label="Typography">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <ReadonlyProperty label="Font" value={target.fontFamily} />
        <ReadonlyProperty label="Size" value={target.fontSize} unit="px" />
        <ReadonlyProperty label="Weight" value={target.fontWeight} />
        <ReadonlyProperty
          label="Line height"
          value={_lh.value}
          unit={_lh.unit}
          hideEmpty
        />
        <ReadonlyProperty label="Align" value={target.textAlign} />
      </div>
    </InspectorSection>
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
