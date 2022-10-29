import React from "react";
import styled from "@emotion/styled";
import type { SolidPaint, Paint } from "@design-sdk/figma-types";
import { InspectorSection } from "components/inspector";
import { useTargetContainer } from "hooks/use-target-node";
import { copy } from "utils/clipboard";

const rd = (d) => Math.round((d + Number.EPSILON) * 100) / 100;

export function ColorsSection() {
  const { target } = useTargetContainer();
  const colors: ReadonlyArray<Paint> = target?.fills?.filter(
    (fill) => fill.visible
  ) as ReadonlyArray<Paint>;

  if (!(colors?.length > 0)) {
    return <></>;
  }

  return (
    <InspectorSection label="Colors" borderTop>
      <ChipsContainer>
        {colors?.map((c, i) => {
          switch (c.type) {
            case "SOLID":
              return <ColorChip key={i} color={{ ...c.color, o: c.opacity }} />;
            case "GRADIENT_RADIAL":
            case "GRADIENT_ANGULAR":
            case "GRADIENT_DIAMOND":
            case "GRADIENT_LINEAR":
              return <>G</>;
          }
        })}
      </ChipsContainer>
    </InspectorSection>
  );
}

const ChipsContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: 4px;
`;

function ColorChip({
  color,
  snippet,
  outline = false,
}: {
  color: { r: number; g: number; b: number; o: number };
  snippet?: string;
  outline?: boolean;
}) {
  const [hover, setHover] = React.useState(false);

  const rgba = `rgba(${rd(color.r * 255)}, ${rd(color.g * 255)}, ${rd(
    color.b * 255
  )}, ${rd(color.o)})`;

  const text = snippet || rgba;
  const onclick = () => {
    // copy to clipboard
    copy(text, { notify: true });
    // show toast (todo)
  };

  return (
    <ChipContainer
      onClick={onclick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{
          // todo - support alpha chanel bg
          background: rgba,
          width: 20,
          height: 20,
          border: outline ? "1px solid white" : "none",
          borderRadius: 2,
        }}
      />
      <label
        style={{
          fontSize: 10,
          color: "white",
          display: hover ? "block" : "none",
        }}
      >
        {text}
      </label>
    </ChipContainer>
  );
}

const ChipContainer = styled.div`
  cursor: pointer;
  background: transparent;
  display: flex;
  flex-direction: row;
  gap: 2px;
  align-items: center;
  transition: all 0.2s ease;
`;
