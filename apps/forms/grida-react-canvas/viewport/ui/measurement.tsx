import {
  auxiliary_line_xylr,
  guide_line_xylr,
} from "@grida/cmath/_measurement";
import { MeterLabel } from "./meter";
import { cn } from "@/utils";
import { cmath } from "@grida/cmath";
import useMeasurement from "../hooks/use-measurement";

export function MeasurementGuide() {
  const measurement = useMeasurement();

  if (!measurement) return <></>;

  const { distance, box, a, b } = measurement;

  const [st, sr, sb, sl] = distance;

  const [tx, ty, tx2, ty2, tl, tr] = guide_line_xylr(box, "top", st);
  const [rx, ry, rx2, ry2, rl, rr] = guide_line_xylr(box, "right", sr);
  const [bx, by, bx2, by2, bl, br] = guide_line_xylr(box, "bottom", sb);
  const [lx, ly, lx2, ly2, ll, lr] = guide_line_xylr(box, "left", sl);
  const [tax, tay, , , tal, tar] = auxiliary_line_xylr([tx2, ty2], b, "top");
  const [rax, ray, , , ral, rar] = auxiliary_line_xylr([rx2, ry2], b, "right");
  const [bax, bay, , , bal, bar] = auxiliary_line_xylr([bx2, by2], b, "bottom");
  const [lax, lay, , , lal, lar] = auxiliary_line_xylr([lx2, ly2], b, "left");

  return (
    <div
      style={{
        position: "absolute",
        pointerEvents: "none",
        willChange: "transform, opacity",
        zIndex: 30,
      }}
    >
      {/* box */}
      <>
        <Rectangle rect={a} />
        <Rectangle rect={b} />
      </>
      <Conditional length={st}>
        <SpacingGuideLine x={tx} y={ty} length={tl} rotation={tr} />
        <Conditional length={tal}>
          <AuxiliaryLine x={tax} y={tay} length={tal} rotation={tar} />
        </Conditional>
        <SpacingMeterLabel length={st} side="t" rect={box} />
      </Conditional>
      <Conditional length={sr}>
        <SpacingGuideLine x={rx} y={ry} length={rl} rotation={rr} />
        <Conditional length={ral}>
          <AuxiliaryLine x={rax} y={ray} length={ral} rotation={rar} />
        </Conditional>
        <SpacingMeterLabel length={sr} side="r" rect={box} />
      </Conditional>
      <Conditional length={sb}>
        <SpacingGuideLine x={bx} y={by} length={bl} rotation={br} />
        <Conditional length={bal}>
          <AuxiliaryLine x={bax} y={bay} length={bal} rotation={bar} />
        </Conditional>
        <SpacingMeterLabel length={sb} side="b" rect={box} />
      </Conditional>
      <Conditional length={sl}>
        <SpacingGuideLine x={lx} y={ly} length={ll} rotation={lr} />
        <Conditional length={lal}>
          <AuxiliaryLine x={lax} y={lay} length={lal} rotation={lar} />
        </Conditional>
        <SpacingMeterLabel length={sl} side="l" rect={box} />
      </Conditional>
    </div>
  );
}

function Rectangle({
  className,
  zIndex,
  rect,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "style"> & {
  zIndex?: number;
  rect: cmath.Rectangle;
}) {
  return (
    <div
      {...props}
      className={cn(
        "relative group pointer-events-auto select-none border-[1px] border-workbench-accent-orange",
        className
      )}
      style={{
        position: "absolute",
        zIndex: zIndex,
        touchAction: "none",
        willChange: "transform",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
      }}
    />
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
  rect,
  zoom = 1,
}: {
  side: Side;
  length: number;
  rect: { x: number; y: number; width: number; height: number };
  zoom?: number;
}) {
  const { x, y, width, height } = rect;

  let tx = x + width / 2; // Center X
  let ty = y + height / 2; // Center Y
  switch (side) {
    case "t": // Top
      ty = y - length / 2;
      break;
    case "r": // Right
      tx = x + width + length / 2;
      break;
    case "b": // Bottom
      ty = y + height + length / 2;
      break;
    case "l": // Left
      tx = x - length / 2;
      break;
  }

  return (
    <MeterLabel
      label={(Math.round(length * 10) / 10).toString()}
      className="bg-workbench-accent-orange"
      x={tx}
      y={ty}
      weight={"bolder"}
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
  color = "darkorange",
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
        zIndex: 99,
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
  zoom = 1,
}: {
  x: number;
  y: number;
  length: number;
  rotation: number;
  zoom?: number;
}) {
  return (
    <GuideLine
      x={x}
      y={y}
      zoom={zoom}
      length={length}
      direction={rotation}
      width={1}
      color={"darkorange"}
    />
  );
}

function AuxiliaryLine({
  length,
  x,
  y,
  rotation,
  zoom = 1,
}: {
  x: number;
  y: number;
  length: number;
  rotation: number;
  zoom?: number;
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
      color={"darkorange"}
    />
  );
}
