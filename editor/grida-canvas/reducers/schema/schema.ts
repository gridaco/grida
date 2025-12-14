import type cg from "@grida/cg";
import cmath from "@grida/cmath";
import type grida from "@grida/schema";
import vn from "@grida/vn";

/**
 * Grida well-known schema specs and constraints.
 */
export namespace schema {}

/**
 * Parameter-space scaling helpers for Scale tool (K).
 *
 * This module contains the pure(ish) scaling rules used by the parametric scaling
 * pipeline, such as:
 * - calculating uniform similarity scale factors from gesture deltas
 * - scaling rectangles around an anchor point
 * - scaling geometry-contributing properties (stroke widths, radii, font sizes, effects, vector networks, etc.)
 *
 * Spec: https://grida.co/docs/wg/feat-authoring/parametric-scaling
 */
export namespace schema.parametric_scale {
  type NodeScaleProps = Partial<
    grida.program.nodes.i.ICornerRadius &
      grida.program.nodes.i.IRectangularCornerRadius &
      grida.program.nodes.i.IPositioning &
      grida.program.nodes.i.ICSSDimension &
      grida.program.nodes.i.IPadding &
      grida.program.nodes.i.IFlexContainer &
      grida.program.nodes.i.IStroke &
      grida.program.nodes.i.IRectangularStrokeWidth &
      grida.program.nodes.i.IEffects
  >;

  export function _clamp_scale(s: number) {
    if (!Number.isFinite(s)) return 1;
    return Math.max(0.01, s);
  }

  /**
   * Calculates a uniform similarity scale factor from a movement delta.
   *
   * - Always returns a clamped scale \(s \ge 0.01\)
   * - If `q` is provided, the return value is quantized to `q` precision
   *
   * Intended usage:
   * - **Interactive gestures / UI**: pass `q = 0.01` to keep stable `0.00x` precision.
   * - **Programmatic commands / API** (e.g. `applyScale(factor)`): use the factor as-is
   *   (developer intent) and do not route it through this helper.
   */
  export function _uniform_scale_factor(
    initial_bounds: cmath.Rectangle,
    movement: cmath.Vector2,
    q?: number
  ) {
    const w = initial_bounds.width;
    const h = initial_bounds.height;

    if (w === 0 && h === 0) return 1;

    const dominantAxis =
      Math.abs(movement[0]) > Math.abs(movement[1]) ? "x" : "y";

    let s: number;
    if (dominantAxis === "x") {
      if (w === 0) {
        s = h !== 0 ? (h + movement[1]) / h : 1;
      } else {
        s = (w + movement[0]) / w;
      }
    } else {
      if (h === 0) {
        s = w !== 0 ? (w + movement[0]) / w : 1;
      } else {
        s = (h + movement[1]) / h;
      }
    }

    const clamped = _clamp_scale(s);
    if (typeof q === "number" && Number.isFinite(q) && q > 0) {
      return cmath.quantize(clamped, q);
    }
    return clamped;
  }

  export function scale_rect_about_anchor(
    rect: cmath.Rectangle,
    anchor: cmath.Vector2,
    s: number
  ): cmath.Rectangle {
    return {
      x: anchor[0] + (rect.x - anchor[0]) * s,
      y: anchor[1] + (rect.y - anchor[1]) * s,
      width: rect.width * s,
      height: rect.height * s,
    };
  }

  function scale_number(
    v: number | null | undefined,
    s: number
  ): number | undefined {
    return typeof v === "number" ? v * s : undefined;
  }

  function scale_number_in_place<T extends object>(
    obj: T,
    key: keyof T,
    s: number
  ) {
    if (typeof obj[key] === "number") {
      obj[key] = (obj[key] * s) as T[typeof key];
    }
  }

  function scale_number_array_in_place<T extends object>(
    obj: T,
    key: keyof T,
    s: number
  ) {
    const v = obj[key];
    if (Array.isArray(v)) {
      obj[key] = v.map((n) =>
        typeof n === "number" ? n * s : n
      ) as T[typeof key];
    }
  }

  export function _stroke_width_profile(
    profile: cg.VariableWidthProfile,
    s: number
  ): cg.VariableWidthProfile {
    return {
      ...profile,
      stops: profile.stops.map((stop) => ({
        ...stop,
        r: typeof stop.r === "number" ? stop.r * s : stop.r,
      })),
    };
  }

  export function _fe_shadow(initial: cg.FeShadow, s: number): cg.FeShadow {
    return {
      ...initial,
      dx: (initial.dx ?? 0) * s,
      dy: (initial.dy ?? 0) * s,
      blur: (initial.blur ?? 0) * s,
      spread: (initial.spread ?? 0) * s,
    };
  }

  export function _fe_blur(initial: cg.FeLayerBlur, s: number): cg.FeLayerBlur {
    const blur = initial.blur;
    switch (blur.type) {
      case "blur":
        return {
          ...initial,
          blur: {
            ...blur,
            radius: blur.radius * s,
          },
        };
      case "progressive-blur":
        return {
          ...initial,
          blur: {
            ...blur,
            // x1/y1/x2/y2 remain unchanged (normalized)
            radius: blur.radius * s,
            radius2: blur.radius2 * s,
          },
        };
    }
  }

  export function _fe_backdrop_blur(
    initial: cg.FeBackdropBlur,
    s: number
  ): cg.FeBackdropBlur {
    const blur = initial.blur;
    switch (blur.type) {
      case "blur":
        return {
          ...initial,
          blur: {
            ...blur,
            radius: blur.radius * s,
          },
        };
      case "progressive-blur":
        return {
          ...initial,
          blur: {
            ...blur,
            radius: blur.radius * s,
            radius2: blur.radius2 * s,
          },
        };
    }
  }

  export function _fe_liquid_glass(
    initial: cg.FeLiquidGlass,
    s: number
  ): cg.FeLiquidGlass {
    return {
      ...initial,
      depth: (initial.depth ?? 0) * s,
      radius: (initial.radius ?? 0) * s,
    };
  }

  export function _fe_noise(initial: cg.FeNoise, s: number): cg.FeNoise {
    return {
      ...initial,
      noise_size: (initial.noise_size ?? 0) * s,
    };
  }

  export function _vector_network(
    initial: vn.VectorNetwork,
    s: number
  ): vn.VectorNetwork {
    const vne = new vn.VectorNetworkEditor(initial);
    vne.scale([s, s]);
    return vne.value;
  }

  export function apply_node(node: grida.program.nodes.Node, s: number) {
    const n = node as NodeScaleProps;

    // Layout-ish lengths (treat as regular numeric fields; do not bake non-numeric values)
    scale_number_in_place(n, "left", s);
    scale_number_in_place(n, "top", s);
    scale_number_in_place(n, "right", s);
    scale_number_in_place(n, "bottom", s);
    scale_number_in_place(n, "width", s);
    scale_number_in_place(n, "height", s);

    // General geometry-ish lengths
    scale_number_in_place(n, "corner_radius", s);
    scale_number_in_place(n, "rectangular_corner_radius_top_left", s);
    scale_number_in_place(n, "rectangular_corner_radius_top_right", s);
    scale_number_in_place(n, "rectangular_corner_radius_bottom_left", s);
    scale_number_in_place(n, "rectangular_corner_radius_bottom_right", s);

    // Padding (number or per-side)
    const padding = n.padding;
    if (typeof padding === "number") {
      n.padding = padding * s;
    } else if (padding && typeof padding === "object") {
      n.padding = {
        ...padding,
        padding_top:
          scale_number(padding.padding_top, s) ?? padding.padding_top,
        padding_right:
          scale_number(padding.padding_right, s) ?? padding.padding_right,
        padding_bottom:
          scale_number(padding.padding_bottom, s) ?? padding.padding_bottom,
        padding_left:
          scale_number(padding.padding_left, s) ?? padding.padding_left,
      };
    }

    scale_number_in_place(n, "main_axis_gap", s);
    scale_number_in_place(n, "cross_axis_gap", s);

    // Stroke
    scale_number_in_place(n, "stroke_width", s);
    scale_number_in_place(n, "rectangular_stroke_width_top", s);
    scale_number_in_place(n, "rectangular_stroke_width_right", s);
    scale_number_in_place(n, "rectangular_stroke_width_bottom", s);
    scale_number_in_place(n, "rectangular_stroke_width_left", s);
    scale_number_array_in_place(n, "stroke_dash_array", s);

    const swp = n.stroke_width_profile;
    if (swp) {
      n.stroke_width_profile = _stroke_width_profile(swp, s);
    }

    // Text
    if (node.type === "text") {
      scale_number_in_place(node, "font_size", s);
    }

    // Effects
    if (n.fe_shadows) {
      n.fe_shadows = n.fe_shadows.map((sh) => _fe_shadow(sh, s));
    }
    if (n.fe_blur) {
      n.fe_blur = _fe_blur(n.fe_blur, s);
    }
    if (n.fe_backdrop_blur) {
      n.fe_backdrop_blur = _fe_backdrop_blur(n.fe_backdrop_blur, s);
    }
    if (n.fe_liquid_glass) {
      n.fe_liquid_glass = _fe_liquid_glass(n.fe_liquid_glass, s);
    }
    if (n.fe_noises) {
      n.fe_noises = n.fe_noises.map((fx) => _fe_noise(fx, s));
    }

    // Vector geometry
    if (node.type === "vector") {
      node.vector_network = _vector_network(node.vector_network, s);
    }

    // NOTE: `svgpath.paths` scaling is intentionally not implemented here yet.
    // The `svgpath` node type is deprecated and rarely used in production.
  }
}
