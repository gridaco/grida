import {
  auxiliary_line_xylr,
  guide_line_xylr,
} from "@grida/cmath/_measurement";
import { MeterLabel } from "./meter";
import { cn } from "@/components/lib/utils";
import cmath from "@grida/cmath";
import { useTransformState } from "@/grida-canvas-react/provider";
import { useEditorState, useCurrentEditor } from "@/grida-canvas-react";
import { useLayoutEffect, useState } from "react";
import { domapi } from "@/grida-canvas/backends/dom";
import { measure, Measurement } from "@grida/cmath/_measurement";

function useMeasurement() {
  const editor = useCurrentEditor();
  const transform = useEditorState(editor, (state) => state.transform);
  const selection = useEditorState(editor, (state) => state.selection);
  const document = useEditorState(editor, (state) => state.document);
  const surface_measurement_target = useEditorState(
    editor,
    (state) => state.surface_measurement_target
  );

  const [measurement, setMeasurement] = useState<Measurement>();

  useLayoutEffect(() => {
    try {
      const b = surface_measurement_target;

      if (!(selection.length > 0) || !b) {
        setMeasurement(undefined);
        return;
      }

      const a_rect = cmath.rect.quantize(
        cmath.rect.union(
          selection.map(
            (id) => editor.geometry.getNodeAbsoluteBoundingRect(id)!
          )
        ),
        0.01
      );

      const b_rect = cmath.rect.quantize(
        cmath.rect.union(
          surface_measurement_target.map(
            (id) => editor.geometry.getNodeAbsoluteBoundingRect(id)!
          )
        ),
        0.01
      );

      const measurement = measure(a_rect, b_rect);
      if (measurement)
        setMeasurement({
          a: a_rect,
          b: b_rect,
          distance: measurement.distance,
          box: measurement.box,
        });
    } catch (e) {
      console.error("useMeasurement", e);
    }
  }, [document, selection, surface_measurement_target, transform]);

  return measurement;
}

export function MeasurementGuide() {
  const measurement = useMeasurement();
  const { transform } = useTransformState();

  if (!measurement) return <></>;

  const { distance, box: _box, a: _a, b: _b } = measurement;

  const [_st, _sr, _sb, _sl] = distance;

  const msx = transform[0][0];
  const msy = transform[1][1];
  const st = _st * msy;
  const sr = _sr * msx;
  const sb = _sb * msy;
  const sl = _sl * msx;

  const label_st = cmath.ui.formatNumber(_st, 1);
  const label_sr = cmath.ui.formatNumber(_sr, 1);
  const label_sb = cmath.ui.formatNumber(_sb, 1);
  const label_sl = cmath.ui.formatNumber(_sl, 1);

  const box = cmath.rect.transform(_box, transform);
  const a = cmath.rect.transform(_a, transform);
  const b = cmath.rect.transform(_b, transform);

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
        <Rectangle rect={a} className="border-workbench-accent-red" />
        <Rectangle rect={b} className="border-workbench-accent-red" />
      </>
      <Conditional length={st}>
        <SpacingGuideLine point={[tx, ty]} length={tl} rotation={tr} />
        <Conditional length={tal}>
          <AuxiliaryLine point={[tax, tay]} length={tal} rotation={tar} />
        </Conditional>
        <SpacingMeterLabel length={st} value={label_st} side="t" rect={box} />
      </Conditional>
      <Conditional length={sr}>
        <SpacingGuideLine point={[rx, ry]} length={rl} rotation={rr} />
        <Conditional length={ral}>
          <AuxiliaryLine point={[rax, ray]} length={ral} rotation={rar} />
        </Conditional>
        <SpacingMeterLabel length={sr} value={label_sr} side="r" rect={box} />
      </Conditional>
      <Conditional length={sb}>
        <SpacingGuideLine point={[bx, by]} length={bl} rotation={br} />
        <Conditional length={bal}>
          <AuxiliaryLine point={[bax, bay]} length={bal} rotation={bar} />
        </Conditional>
        <SpacingMeterLabel length={sb} value={label_sb} side="b" rect={box} />
      </Conditional>
      <Conditional length={sl}>
        <SpacingGuideLine point={[lx, ly]} length={ll} rotation={lr} />
        <Conditional length={lal}>
          <AuxiliaryLine point={[lax, lay]} length={lal} rotation={lar} />
        </Conditional>
        <SpacingMeterLabel length={sl} value={label_sl} side="l" rect={box} />
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
        "relative group pointer-events-auto select-none border-[1px]",
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
  value,
  rect,
}: {
  side: Side;
  length: number;
  value?: string | number;
  rect: { x: number; y: number; width: number; height: number };
}) {
  value = value || Math.round(length * 10) / 10;

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
      label={value.toString()}
      className="bg-workbench-accent-red text-white z-10"
      x={tx}
      y={ty}
      sideOffset={16}
      side={__label_anchor_map[side]}
    />
  );
}

const __label_anchor_map = {
  t: "right",
  r: "bottom",
  b: "right",
  l: "bottom",
} as const;

type Side = "t" | "r" | "b" | "l";

interface GuideLineProps {
  point: cmath.Vector2;
  zoom: number;
  length: number;
  direction: "n" | "s" | "e" | "w" | number;
  width?: number;
  color?: React.CSSProperties["color"];
  dashed?: boolean;
  className?: string;
}

function GuideLine({
  point: [x, y],
  zoom,
  direction,
  length,
  width,
  color,
  className,
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
        borderLeft: `${width}px ${dashed ? "dashed" : "solid"}`,
        borderColor: color,
        zIndex: 10,
      }}
      className={className}
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
  point,
  rotation,
  zoom = 1,
}: {
  point: cmath.Vector2;
  length: number;
  rotation: number;
  zoom?: number;
}) {
  return (
    <GuideLine
      point={point}
      zoom={zoom}
      length={length}
      direction={rotation}
      width={1}
      className="border-workbench-accent-red"
    />
  );
}

function AuxiliaryLine({
  length,
  point,
  rotation,
  zoom = 1,
}: {
  point: cmath.Vector2;
  length: number;
  rotation: number;
  zoom?: number;
}) {
  return (
    <GuideLine
      point={point}
      zoom={zoom}
      length={length}
      direction={rotation}
      width={1}
      dashed
      className="border-workbench-accent-red"
    />
  );
}
