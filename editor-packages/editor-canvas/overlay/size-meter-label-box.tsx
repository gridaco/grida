import React, { useMemo } from "react";
import styled from "@emotion/styled";
import type { XYWH } from "../types";
import { xywh_to_bounding_box } from "../math";

export function SizeMeterLabelBox({
  size,
  anchor = "s",
  margin = 0,
  xywh,
  zoom,
}: {
  size: { width: number; height: number };
  anchor?: "w" | "n" | "s" | "e";
  margin?: number;
} & {
  xywh: XYWH;
  zoom: number;
}) {
  // TODO: add anchor handling

  const bbox = useMemo(
    () => xywh_to_bounding_box({ xywh, scale: zoom }),
    [xywh, zoom]
  );

  const [x1, y1, x2, y2] = bbox;
  const bottomY = y2;
  const boxWidth = x2 - x1; // use this to center position the label

  const text = `${+size.width.toFixed(2)} x ${+size.height.toFixed()}`;

  return (
    <div
      id="size-meter"
      style={{
        display: "flex",
        minWidth: size.width * zoom,
        justifyContent: "center",
        position: "absolute",
        pointerEvents: "none",
        transform: `translate3d(${x1}px, ${y2 + margin}px, 0)`,
        willChange: "transform, opacity",
      }}
    >
      <Container>
        <Label>{text}</Label>
      </Container>
    </div>
  );
}

const Container = styled.div`
  display: flex;
  border-radius: 4px;
  background-color: rgb(0, 87, 255);
  box-sizing: border-box;
  overflow: auto;
  padding: 2px 4px;
`;

const Label = styled.span`
  width: max-content;
  color: white;
  text-overflow: ellipsis;
  font-size: 10px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  text-align: center;
`;
