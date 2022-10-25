import React from "react";
import { box_to_xywh, scale, spacing_guide } from "../../math";
import type { Box } from "../../types";
import * as k from "../k";
import { MeterLabel } from "../meter-label";

export function PositionGuide({
  a,
  b,
  zoom,
}: {
  a: Box;
  b: Box;
  zoom: number;
}) {
  const { spacing, box: __box } = spacing_guide(a, b);
  const box = scale(__box, zoom);
  const [_t, _r, _b, _l] = spacing;

  return (
    <div
      id="position-guide"
      style={{
        pointerEvents: "none",
        willChange: "transform, opacity",
      }}
    >
      <Conditional length={_t}>
        <SpacingGuideLine length={_t} side="t" box={box} zoom={zoom} />
        <SpacingMeterLabel length={_t} side="t" box={__box} zoom={zoom} />
      </Conditional>
      <Conditional length={_r}>
        <SpacingGuideLine length={_r} side="r" box={box} zoom={zoom} />
        <SpacingMeterLabel length={_r} side="r" box={__box} zoom={zoom} />
      </Conditional>
      <Conditional length={_b}>
        <SpacingGuideLine length={_b} side="b" box={box} zoom={zoom} />
        <SpacingMeterLabel length={_b} side="b" box={__box} zoom={zoom} />
      </Conditional>
      <Conditional length={_l}>
        <SpacingGuideLine length={_l} side="l" box={box} zoom={zoom} />
        <SpacingMeterLabel length={_l} side="l" box={__box} zoom={zoom} />
      </Conditional>
    </div>
  );
}

function Conditional({
  length,
  children,
}: React.PropsWithChildren<{
  length: number;
}>) {
  if (length > 0) {
    return <>{children}</>;
  }
  return <></>;
}

function SpacingMeterLabel({
  side,
  length,
  box,
  zoom,
}: {
  side: Side;
  length: number;
  box: Box;
  zoom: number;
}) {
  const [x, y, x2, y2] = box;

  let tx = x + (x2 - x) / 2;
  let ty = y + (y2 - y) / 2;
  switch (side) {
    case "t":
      ty = y - length / 2;
      break;
    case "r":
      tx = x2 + length / 2;
      break;
    case "b":
      ty = y2 + length / 2;
      break;
    case "l":
      tx = x - length / 2;
      break;
  }

  return (
    <MeterLabel
      label={(Math.round(length * 10) / 10).toString()}
      background={"orange"}
      x={tx}
      y={ty}
      margin={4}
      anchor={__label_anchor_map[side]}
      zoom={zoom}
    />
  );
}

const __label_anchor_map = {
  t: "e",
  r: "s",
  b: "e",
  l: "s",
} as const;

type Side = "t" | "r" | "b" | "l";

function SpacingGuideLine({
  length,
  zoom,
  side,
  box,
  width = 1,
}: {
  width?: number;
  length: number;
  box: Box;
  zoom: number;
  side: Side;
}) {
  const d = 100;

  // is vertical line
  const isvert = side === "t" || side === "b";
  const l_scalex = isvert ? width / d : (length / d) * zoom;
  const l_scaley = isvert ? (length / d) * zoom : width / d;
  const [, , w, h] = box_to_xywh(box);

  let trans = { x: 0, y: 0 };
  switch (side) {
    case "t": {
      trans = {
        x: box[0] + (d * l_scalex - d) / 2 + w / 2,
        y: box[1] - d / 2 - (length / 2) * zoom,
      };
      break;
    }
    case "r": {
      trans = {
        x: box[2] - d / 2 + (length / 2) * zoom,
        y: box[1] + (d * l_scaley - d) / 2 + h / 2,
      };
      break;
    }
    case "b": {
      trans = {
        x: box[0] + (d * l_scalex - d) / 2 + w / 2,
        y: box[3] - d / 2 + (length / 2) * zoom,
      };
      break;
    }
    case "l": {
      trans = {
        x: box[0] - d / 2 - (length / 2) * zoom,
        y: box[1] + (d * l_scaley - d) / 2 + h / 2,
      };
      break;
    }
  }

  return (
    <div
      id={side}
      style={{
        position: "fixed",
        width: d,
        height: d,
        opacity: 1,
        pointerEvents: "none",
        cursor: "none",
        willChange: "transform",
        transformOrigin: "0px, 0px",
        transform: `translate3d(${trans.x}px, ${trans.y}px, 0) scaleX(${l_scalex}) scaleY(${l_scaley})`,
        backgroundColor: "orange",
        zIndex: k.Z_INDEX_GUIDE_POSITION,
      }}
    />
  );
}

function AuxiliaryLine() {
  return (
    <div
      style={{
        position: "fixed",
        pointerEvents: "none",
        opacity: 1,
        background: `repeating-linear-gradient(
          to right,
          transparent,
          transparent 10px,
          black 10px,
          black 20px
        )`,
        zIndex: 9,
      }}
    />
  );
}
