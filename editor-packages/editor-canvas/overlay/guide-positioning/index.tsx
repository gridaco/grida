import React from "react";
import { scale, spacing_guide } from "../../math";
import type { Box, XY } from "../../types";
import * as k from "../k";
import { MeterLabel } from "../meter-label";
import { auxiliary_line_xylr, guide_line_xylr } from "./math";

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
  const [st, sr, sb, sl] = spacing;

  const [tx, ty, tx2, ty2, tl, tr] = guide_line_xylr(__box, "t", st);
  const [rx, ry, rx2, ry2, rl, rr] = guide_line_xylr(__box, "r", sr);
  const [bx, by, bx2, by2, bl, br] = guide_line_xylr(__box, "b", sb);
  const [lx, ly, lx2, ly2, ll, lr] = guide_line_xylr(__box, "l", sl);
  const [tax, tay, , , tal, tar] = auxiliary_line_xylr([tx2, ty2], b, "t");
  const [rax, ray, , , ral, rar] = auxiliary_line_xylr([rx2, ry2], b, "r");
  const [bax, bay, , , bal, bar] = auxiliary_line_xylr([bx2, by2], b, "b");
  const [lax, lay, , , lal, lar] = auxiliary_line_xylr([lx2, ly2], b, "l");

  return (
    <div
      id="position-guide"
      style={{
        pointerEvents: "none",
        willChange: "transform, opacity",
      }}
    >
      <Conditional length={st}>
        <SpacingGuideLine x={tx} y={ty} length={tl} rotation={tr} zoom={zoom} />
        <Conditional length={tal}>
          <AuxiliaryLine
            x={tax}
            y={tay}
            length={tal}
            rotation={tar}
            zoom={zoom}
          />
        </Conditional>
        <SpacingMeterLabel length={st} side="t" box={__box} zoom={zoom} />
      </Conditional>
      <Conditional length={sr}>
        <SpacingGuideLine x={rx} y={ry} length={rl} rotation={rr} zoom={zoom} />
        <Conditional length={ral}>
          <AuxiliaryLine
            x={rax}
            y={ray}
            length={ral}
            rotation={rar}
            zoom={zoom}
          />
        </Conditional>
        <SpacingMeterLabel length={sr} side="r" box={__box} zoom={zoom} />
      </Conditional>
      <Conditional length={sb}>
        <SpacingGuideLine x={bx} y={by} length={bl} rotation={br} zoom={zoom} />
        <Conditional length={bal}>
          <AuxiliaryLine
            x={bax}
            y={bay}
            length={bal}
            rotation={bar}
            zoom={zoom}
          />
        </Conditional>
        <SpacingMeterLabel length={sb} side="b" box={__box} zoom={zoom} />
      </Conditional>
      <Conditional length={sl}>
        <SpacingGuideLine x={lx} y={ly} length={ll} rotation={lr} zoom={zoom} />
        <Conditional length={lal}>
          <AuxiliaryLine
            x={lax}
            y={lay}
            length={lal}
            rotation={lar}
            zoom={zoom}
          />
        </Conditional>
        <SpacingMeterLabel length={sl} side="l" box={__box} zoom={zoom} />
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
      zIndex={k.Z_INDEX_GUIDE_SPACING_LABEL}
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

interface GuideLineProps {
  x: number;
  y: number;
  zoom: number;
  length: number;
  direction: "n" | "s" | "e" | "w" | number;
  width?: number;
  color: React.CSSProperties["color"];
  dashed?: boolean;
}

function GuideLine({
  x,
  y,
  zoom,
  direction,
  length,
  width,
  color = "orange",
  dashed,
}: GuideLineProps) {
  const tl = length * zoom;
  const tx = x * zoom;
  const ty = y * zoom;
  const tr =
    typeof direction === "number"
      ? direction
      : __line_rotation_by_direction_map[direction];

  return (
    <div
      style={{
        position: "absolute",
        width: 1,
        height: tl,
        pointerEvents: "none",
        cursor: "none",
        willChange: "transform",
        transformOrigin: "0px 0px",
        transform: `translate3d(${tx}px, ${ty}px, 0) rotate(${tr}deg)`,
        borderLeft: `${width}px ${dashed ? "dashed" : "solid"} ${color}`,
        zIndex: k.Z_INDEX_GUIDE_POSITION,
      }}
    />
  );
}

const __line_rotation_by_direction_map = {
  n: 180,
  e: 270,
  s: 0,
  w: 90,
} as const;

function SpacingGuideLine({
  length,
  x,
  y,
  rotation,
  zoom,
}: {
  x: number;
  y: number;
  length: number;
  rotation: number;
  zoom: number;
}) {
  return (
    <GuideLine
      x={x}
      y={y}
      zoom={zoom}
      length={length}
      direction={rotation}
      width={1}
      color={"orange"}
    />
  );
}

function AuxiliaryLine({
  length,
  x,
  y,
  rotation,
  zoom,
}: {
  x: number;
  y: number;
  length: number;
  rotation: number;
  zoom: number;
}) {
  return (
    <GuideLine
      x={x}
      y={y}
      zoom={zoom}
      length={length}
      direction={rotation}
      width={1}
      dashed
      color={"orange"}
    />
  );
}
