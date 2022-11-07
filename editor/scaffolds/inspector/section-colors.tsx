import React from "react";
import styled from "@emotion/styled";
import type { SolidPaint, Paint, GradientPaint } from "@design-sdk/figma-types";
import { useTargetContainer } from "hooks/use-target-node";
import { copy } from "utils/clipboard";
import { ColorChip, GradientChip } from "@code-editor/property";
import {
  PropertyLine,
  PropertyGroup,
  PropertyGroupHeader,
} from "@editor-ui/property";

export function ColorsSection() {
  const { target } = useTargetContainer();
  const paints: ReadonlyArray<Paint> = target?.fills?.filter(
    (fill) => fill.visible && fill.type !== "IMAGE"
  ) as ReadonlyArray<Paint>;

  if (!(paints?.length > 0)) {
    return <></>;
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Colors</h6>
      </PropertyGroupHeader>
      <ChipsContainer>
        {paints?.map((c, i) => {
          switch (c.type) {
            case "SOLID":
              return (
                <ColorChip
                  key={i}
                  color={{ ...c.color, o: c.opacity }}
                  onClick={({ text }) => {
                    // copy to clipboard
                    copy(text, { notify: true });
                    // show toast (todo)
                  }}
                />
              );
            case "GRADIENT_RADIAL":
            case "GRADIENT_ANGULAR":
            case "GRADIENT_DIAMOND":
            case "GRADIENT_LINEAR":
              return <GradientChip key={i} gradient={c} />;
          }
        })}
      </ChipsContainer>
    </PropertyGroup>
  );
}

const ChipsContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: 4px;
  padding: 4px 16px;
`;
