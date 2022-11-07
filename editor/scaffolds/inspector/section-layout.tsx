import styled from "@emotion/styled";
import { ReadonlyProperty } from "components/inspector";
import {
  PropertyLine,
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
} from "@editor-ui/property";
import { useTargetContainer } from "hooks/use-target-node";
import React from "react";

export function LayoutSection() {
  const { target, root } = useTargetContainer();

  if (!target) {
    return <></>;
  }

  const { id, isRoot, x, y, width, height } = target;

  // round to 2 decimal places
  const dx = rd(x);
  const dy = rd(y);
  const dw = rd(width);
  const dh = rd(height);

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Layout</h6>
      </PropertyGroupHeader>
      <PropertyLines key={id}>
        <PropertyLine label="Position">
          <ReadonlyProperty suffix={"X"} value={isRoot ? 0 : dx} />
          <ReadonlyProperty suffix={"Y"} value={isRoot ? 0 : dy} />
        </PropertyLine>
        <PropertyLine label="Size">
          <ReadonlyProperty suffix={"W"} value={dw} />
          <ReadonlyProperty suffix={"H"} value={dh} />
        </PropertyLine>
      </PropertyLines>
    </PropertyGroup>
  );
}

const Line = styled.div`
  display: flex;
  flex-direction: row;
  gap: 4px;
  width: 100%;
`;

const rd = (v: number) => Math.round(v * 100) / 100;
