import grida from "@grida/schema";
import { svg } from "@/grida-canvas-utils/svg";
import queryattributes from "./utils/attributes";
import { css } from "@/grida-canvas-utils/css";
import { useMemo } from "react";

export function RectangleWidget({
  style,
  layout_target_width: width,
  layout_target_height: height,
  fill,
  stroke,
  stroke_width,
  rectangular_corner_radius_top_left,
  rectangular_corner_radius_top_right,
  rectangular_corner_radius_bottom_left,
  rectangular_corner_radius_bottom_right,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.RectangleNode>) {
  const isZero =
    rectangular_corner_radius_top_left === 0 &&
    rectangular_corner_radius_top_right === 0 &&
    rectangular_corner_radius_bottom_left === 0 &&
    rectangular_corner_radius_bottom_right === 0;

  const { defs: fillDefs, ref: fillDef } = fill
    ? svg.paint.defs(fill)
    : {
        defs: undefined,
        ref: "none",
      };

  const { defs: strokeDefs, ref: strokeDef } = stroke
    ? svg.paint.defs(stroke)
    : {
        defs: undefined,
        ref: "none",
      };

  // FIXME: needs solved geometry to be passed
  // For corner radius conversion to normalized 100x100 system
  // We need approximate dimensions to scale corner radius proportionally
  // This is only used for corner radius scaling, not for path dimensions
  //
  // NOTE: This approach is not meaningful when dimensions are non-fixed and relative
  // (e.g., percentages, viewport units like vw/vh, em/rem, or "auto").
  // For relative dimensions, `css.toPxNumber()` will return 0 or a fallback value,
  // causing incorrect corner radius scaling. The corner radius conversion will always
  // fail or be inaccurate for relative dimensions since we cannot determine the
  // actual resolved pixel dimensions at render time in the DOM context.
  const widthApprox = css.toPxNumber(width) || 100;
  const heightApprox = css.toPxNumber(height) || 100;

  // Convert corner radius from absolute pixels to normalized 100x100 system
  // Scale proportionally: radius_in_100 = radius_px * (100 / dimension_px)
  // WARNING: This only works correctly for fixed pixel dimensions. For relative
  // dimensions, the scaling will be incorrect.
  const normalizedCornerRadius = useMemo((): [
    number,
    number,
    number,
    number,
  ] => {
    if (isZero) return [0, 0, 0, 0];
    return [
      ((rectangular_corner_radius_top_left ?? 0) * 100) / widthApprox,
      ((rectangular_corner_radius_top_right ?? 0) * 100) / widthApprox,
      ((rectangular_corner_radius_bottom_right ?? 0) * 100) / heightApprox,
      ((rectangular_corner_radius_bottom_left ?? 0) * 100) / heightApprox,
    ];
  }, [
    isZero,
    rectangular_corner_radius_top_left,
    rectangular_corner_radius_top_right,
    rectangular_corner_radius_bottom_right,
    rectangular_corner_radius_bottom_left,
    widthApprox,
    heightApprox,
  ]);

  return (
    <svg
      {...queryattributes(props)}
      style={{
        ...style,
        overflow: "visible", // shall be visible since the polyline has a stroke width
        // debug
        // border: "1px solid red",
      }}
      width={css.toDimension(width)}
      height={css.toDimension(height)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {fillDefs && <g dangerouslySetInnerHTML={{ __html: fillDefs }} />}
      {strokeDefs && <g dangerouslySetInnerHTML={{ __html: strokeDefs }} />}

      {isZero ? (
        <rect
          width="100%"
          height="100%"
          fill={fillDef}
          strokeWidth={stroke_width}
          stroke={strokeDef}
        />
      ) : (
        <path
          d={svg.d.generateRoundedRectPath(100, 100, normalizedCornerRadius)}
          fill={fillDef}
          strokeWidth={stroke_width}
          stroke={strokeDef}
        />
      )}
    </svg>
  );
}
