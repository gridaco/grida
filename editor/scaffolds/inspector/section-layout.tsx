import styled from "@emotion/styled";
import { InspectorSection, ReadonlyProperty } from "components/inspector";
import { useTargetContainer } from "hooks/use-target-node";
import React from "react";

export function LayoutSection() {
  const { target, root } = useTargetContainer();

  if (!target) {
    return <></>;
  }

  const { isRoot, x, y, width, height } = target;

  return (
    <InspectorSection label="Layout">
      <Line>
        <ReadonlyProperty label={"X"} value={isRoot ? 0 : x} />
        <ReadonlyProperty label={"Y"} value={isRoot ? 0 : y} />
      </Line>
      <Line>
        <ReadonlyProperty label={"W"} value={width} />
        <ReadonlyProperty label={"H"} value={height} />
      </Line>
    </InspectorSection>
  );
}

const Line = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
`;
