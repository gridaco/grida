import { InspectorSection, ReadonlyProperty } from "components/inspector";
import { useTargetContainer } from "hooks/use-target-node";
import React from "react";

export function TypographySection() {
  const { target } = useTargetContainer();

  if (target?.type !== "TEXT") {
    return <></>;
  }

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
        <ReadonlyProperty label="Line height" value={"todo"} />
        {/* target.lineHeight */}
        <ReadonlyProperty label="Align" value={target.textAlign} />
      </div>
    </InspectorSection>
  );
}
