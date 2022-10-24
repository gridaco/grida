import styled from "@emotion/styled";
import { InspectorSection, ReadonlyProperty } from "components/inspector";
import { useTargetContainer } from "hooks/use-target-node";
import React from "react";

export function LayoutSection() {
  const { target, root } = useTargetContainer();
  const isroot = root?.id === target?.id;

  return (
    <InspectorSection label="Layout">
      <Line>
        <ReadonlyProperty label={"X"} value={isroot ? 0 : target?.x} />
        <ReadonlyProperty label={"Y"} value={isroot ? 0 : target?.y} />
      </Line>
      <Line>
        <ReadonlyProperty label={"W"} value={target?.width} />
        <ReadonlyProperty label={"H"} value={target?.height} />
      </Line>
    </InspectorSection>
  );
}

const Line = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
`;
