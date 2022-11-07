import React from "react";
import styled from "@emotion/styled";
import type { SolidPaint, Paint, GradientPaint } from "@design-sdk/figma-types";
import { useTargetContainer } from "hooks/use-target-node";
import { copy } from "utils/clipboard";
import { ColorChip, GradientChip } from "@code-editor/property";
import {
  PropertyGroup,
  PropertyGroupHeader,
  PropertyLines,
} from "@editor-ui/property";

/**
 * Colors & Gradients
 * - fills
 * - strokes
 */
export function ColorsSection() {
  const { target } = useTargetContainer();
  const paints: ReadonlyArray<Paint> = [
    ...(target?.fills?.filter(
      (fill) => fill.visible && fill.type !== "IMAGE"
    ) || []),
    ...(target?.strokes?.filter(
      (stroke) => stroke.visible && stroke.type !== "IMAGE"
    ) || []),
  ] as ReadonlyArray<Paint>;

  if (!(paints?.length > 0)) {
    return <></>;
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Colors</h6>
      </PropertyGroupHeader>
      <PropertyLines>
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
      </PropertyLines>
    </PropertyGroup>
  );
}

const ChipsContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;
