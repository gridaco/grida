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

  // round to 2 decimal places
  const dx = rd(x);
  const dy = rd(y);
  const dw = rd(width);
  const dh = rd(height);

  return (
    <InspectorSection label="Layout" borderTop>
      <Line>
        <ReadonlyProperty label={"X"} value={isRoot ? 0 : dx} />
        <ReadonlyProperty label={"Y"} value={isRoot ? 0 : dy} />
      </Line>
      <Line>
        <ReadonlyProperty label={"W"} value={dw} />
        <ReadonlyProperty label={"H"} value={dh} />
      </Line>
    </InspectorSection>
  );
}

const Line = styled.div`
  display: flex;
  flex-direction: row;
  gap: 4px;
  width: 100%;
`;

const rd = (v: number) => Math.round(v * 100) / 100;
