import { produce, type Draft } from "immer";
import type grida from "@grida/schema";
import type { NodeChangeAction } from "../action";
import type cg from "@grida/cg";
import assert from "assert";
import cmath from "@grida/cmath";
import { editor } from "@/grida-canvas";

type UN = grida.program.nodes.UnknownNode;
// UnknownNodeProperties Keys
type UNPK = grida.program.nodes.UnknownNodePropertiesKey;
type DYN_TODO = grida.program.nodes.UnknownNode | any; // TODO: remove casting of this usage.

type PaintValue = grida.program.nodes.i.props.PropsPaintValue;

function normalizePaintValue(paint: PaintValue): PaintValue {
  if (!paint || typeof paint !== "object") {
    return paint;
  }

  if (!("type" in paint)) {
    return paint;
  }

  switch (paint.type) {
    case "solid":
    case "image":
    case "linear_gradient":
    case "radial_gradient":
    case "sweep_gradient":
    case "diamond_gradient":
      return { ...paint } as PaintValue;
    default:
      return paint;
  }
}

// TODO: LEGACY_PAINT_MODEL
function readPaints(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: "fill" | "stroke"
): PaintValue[] {
  const pluralKey = key === "fill" ? "fill_paints" : "stroke_paints";
  const paints: PaintValue[] = [];
  const existing = (draft as any)[pluralKey] as PaintValue[] | undefined;

  if (Array.isArray(existing) && existing.length > 0) {
    for (const paint of existing) {
      if (paint) {
        paints.push(normalizePaintValue(paint));
      }
    }
    return paints;
  }

  const single = (draft as any)[key] as PaintValue | undefined;
  if (single) {
    paints.push(normalizePaintValue(single));
  }

  return paints;
}

// TODO: LEGACY_PAINT_MODEL
function writePaints(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: "fill" | "stroke",
  paints: PaintValue[]
) {
  const pluralKey = key === "fill" ? "fill_paints" : "stroke_paints";

  if (!paints || paints.length === 0) {
    (draft as any)[pluralKey] = undefined;
    (draft as any)[key] = undefined;
    return;
  }

  const normalized = paints.map((paint) => normalizePaintValue(paint));
  (draft as any)[pluralKey] = normalized;
  (draft as any)[key] = normalized[0];
}

function applyPaintAtIndex(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: "fill" | "stroke",
  index: number,
  paint: PaintValue | null | undefined
) {
  const paints = readPaints(draft, key);

  if (paint === null || typeof paint === "undefined") {
    if (index < 0 || index >= paints.length) {
      return;
    }
    paints.splice(index, 1);
  } else {
    const normalized = normalizePaintValue(paint);
    if (index < 0) {
      return;
    }
    if (index < paints.length) {
      paints[index] = normalized;
    } else if (index === paints.length) {
      paints.push(normalized);
    } else if (paints.length === 0 && index === 0) {
      paints.push(normalized);
    } else {
      return;
    }
  }

  writePaints(draft, key, paints);
}

function insertPaintAtIndex(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: "fill" | "stroke",
  index: number,
  paint: PaintValue
) {
  const paints = readPaints(draft, key);
  const normalized = normalizePaintValue(paint);

  if (index < 0 || index > paints.length) {
    return;
  }

  paints.splice(index, 0, normalized);
  writePaints(draft, key, paints);
}

function defineNodeProperty<
  K extends keyof grida.program.nodes.UnknownNode,
>(handlers: {
  assert?: (node: grida.program.nodes.UnknownNode) => boolean;
  apply: (
    draft: grida.program.nodes.UnknownNodeProperties,
    value: NonNullable<grida.program.nodes.UnknownNode[K]>,
    prev?: grida.program.nodes.UnknownNode[K]
  ) => void;
}) {
  return handlers;
}

/**
 * properties without side effects (re-layout)
 */
const safe_properties: Partial<
  Omit<
    grida.program.nodes.UnknownNodeProperties<{
      assert?: (node: grida.program.nodes.UnknownNode) => boolean;
      apply: (
        draft: grida.program.nodes.UnknownNodeProperties,
        value: any,
        prev?: any
      ) => void;
    }>,
    "type"
  >
> = {
  active: defineNodeProperty<"active">({
    assert: (node) => typeof node.active === "boolean",
    apply: (draft, value, prev) => {
      (draft as UN).active = value;
    },
  }),
  locked: defineNodeProperty<"locked">({
    assert: (node) => typeof node.locked === "boolean",
    apply: (draft, value, prev) => {
      (draft as UN).locked = value;
    },
  }),
  name: defineNodeProperty<"name">({
    assert: (node) => typeof node.name === "string",
    apply: (draft, value, prev) => {
      (draft as UN).name = value;
    },
  }),
  layout_positioning: defineNodeProperty<"layout_positioning">({
    apply: (draft, value, prev) => {
      (draft as UN).layout_positioning = value;
    },
  }),
  layout_inset_left: defineNodeProperty<"layout_inset_left">({
    apply: (draft, value, prev) => {
      (draft as UN).layout_inset_left = value;
    },
  }),
  layout_inset_top: defineNodeProperty<"layout_inset_top">({
    apply: (draft, value, prev) => {
      (draft as UN).layout_inset_top = value;
    },
  }),
  layout_inset_right: defineNodeProperty<"layout_inset_right">({
    apply: (draft, value, prev) => {
      (draft as UN).layout_inset_right = value;
    },
  }),
  layout_inset_bottom: defineNodeProperty<"layout_inset_bottom">({
    apply: (draft, value, prev) => {
      (draft as UN).layout_inset_bottom = value;
    },
  }),
  layout_target_width: defineNodeProperty<"layout_target_width">({
    apply: (draft, value, prev) => {
      if (typeof value === "number") {
        draft.layout_target_width = ranged(0, value);
      } else {
        (draft as UN).layout_target_width = value;
      }
    },
  }),
  layout_target_height: defineNodeProperty<"layout_target_height">({
    apply: (draft, value, prev) => {
      if (typeof value === "number") {
        draft.layout_target_height = ranged(0, value);
      } else {
        (draft as UN).layout_target_height = value;
      }
    },
  }),
  layout_target_aspect_ratio: defineNodeProperty<"layout_target_aspect_ratio">({
    apply: (draft, value, prev) => {
      (draft as UN).layout_target_aspect_ratio = value;
    },
  }),
  rotation: defineNodeProperty<"rotation">({
    assert: (node) => typeof node.rotation === "number",
    apply: (draft, value, prev) => {
      (draft as UN).rotation = value;
    },
  }),
  href: defineNodeProperty<"href">({
    assert: (node) => typeof node.href === "string",
    apply: (draft, value, prev) => {
      (draft as UN).href = value;
    },
  }),
  target: defineNodeProperty<"target">({
    assert: (node) => typeof node.target === "string",
    apply: (draft, value, prev) => {
      (draft as UN).target = value;
    },
  }),
  cursor: defineNodeProperty<"cursor">({
    assert: (node) => typeof node.cursor === "string",
    apply: (draft, value, prev) => {
      (draft as UN).cursor = value;
    },
  }),
  src: defineNodeProperty<"src">({
    assert: (node) => typeof node.src === "string",
    apply: (draft, value, prev) => {
      (draft as UN).src = value;
    },
  }),
  opacity: defineNodeProperty<"opacity">({
    assert: (node) => typeof node.opacity === "number",
    apply: (draft, value, prev) => {
      (draft as UN).opacity = ranged(0, value, 1);
    },
  }),
  blend_mode: defineNodeProperty<"blend_mode">({
    assert: (node) => typeof node.blend_mode === "string",
    apply: (draft, value, prev) => {
      (draft as UN).blend_mode = value;
    },
  }),
  mask: defineNodeProperty<"mask">({
    assert: (node) => typeof node.mask === "string",
    apply: (draft, value, prev) => {
      (draft as UN).mask = value;
    },
  }),
  fill: defineNodeProperty<"fill">({
    assert: (node) =>
      node.type === "vector" ||
      node.type === "image" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "tspan" ||
      node.type === "richtext" ||
      node.type === "container" ||
      node.type === "component",
    apply: (draft, value, prev) => {
      const target = draft as grida.program.nodes.UnknownNodeProperties;
      const next = value as unknown as PaintValue | null;

      if (next === null) {
        writePaints(target, "fill", []);
        return;
      }

      writePaints(target, "fill", [next]);
    },
  }),
  fill_paints: defineNodeProperty<"fill_paints">({
    apply: (draft, value, prev) => {
      const target = draft as grida.program.nodes.UnknownNodeProperties;
      const paints = Array.isArray(value)
        ? (value as unknown as PaintValue[])
        : [];

      if (!paints.length) {
        writePaints(target, "fill", []);
        return;
      }

      writePaints(target, "fill", paints);
    },
  }),
  corner_radius: defineNodeProperty<"corner_radius">({
    apply: (draft, value, prev) => {
      // TODO: make [corner_radius < (Math.min(width, height) / 2)]
      (draft as UN).corner_radius = value;
    },
  }),
  rectangular_corner_radius_top_left:
    defineNodeProperty<"rectangular_corner_radius_top_left">({
      apply: (draft, value, prev) => {
        (draft as UN).rectangular_corner_radius_top_left = value;
      },
    }),
  rectangular_corner_radius_top_right:
    defineNodeProperty<"rectangular_corner_radius_top_right">({
      apply: (draft, value, prev) => {
        (draft as UN).rectangular_corner_radius_top_right = value;
      },
    }),
  rectangular_corner_radius_bottom_right:
    defineNodeProperty<"rectangular_corner_radius_bottom_right">({
      apply: (draft, value, prev) => {
        (draft as UN).rectangular_corner_radius_bottom_right = value;
      },
    }),
  rectangular_corner_radius_bottom_left:
    defineNodeProperty<"rectangular_corner_radius_bottom_left">({
      apply: (draft, value, prev) => {
        (draft as UN).rectangular_corner_radius_bottom_left = value;
      },
    }),
  corner_smoothing: defineNodeProperty<"corner_smoothing">({
    apply: (draft, value, prev) => {
      (draft as UN).corner_smoothing = cmath.clamp(value, 0, 1);
    },
  }),
  point_count: defineNodeProperty<"point_count">({
    assert: (node) => typeof node.point_count === "number",
    apply: (draft, value, prev) => {
      (draft as UN).point_count = cmath.clamp(value, 3, 60);
    },
  }),
  inner_radius: defineNodeProperty<"inner_radius">({
    assert: (node) => typeof node.inner_radius === "number",
    apply: (draft, value, prev) => {
      (draft as UN).inner_radius = cmath.clamp(value, 0, 1);
    },
  }),
  angle: defineNodeProperty<"angle">({
    assert: (node) => typeof node.angle === "number",
    apply: (draft, value, prev) => {
      (draft as UN).angle = cmath.clamp(value, 0, 360);
    },
  }),
  angle_offset: defineNodeProperty<"angle_offset">({
    assert: (node) => typeof node.angle_offset === "number",
    apply: (draft, value, prev) => {
      (draft as UN).angle_offset = cmath.clamp(value, 0, 360);
    },
  }),
  border: defineNodeProperty<"border">({
    assert: (node) =>
      // node.type === "text" ||
      node.type === "image" ||
      node.type === "video" ||
      node.type === "container" ||
      node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).border = value;
    },
  }),
  stroke: defineNodeProperty<"stroke">({
    assert: (node) =>
      node.type === "vector" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "tspan",
    apply: (draft, value, prev) => {
      const target = draft as grida.program.nodes.UnknownNodeProperties;
      const next = value as unknown as PaintValue | null;

      if (next === null) {
        writePaints(target, "stroke", []);
        return;
      }

      writePaints(target, "stroke", [next]);
    },
  }),
  stroke_paints: defineNodeProperty<"stroke_paints">({
    apply: (draft, value, prev) => {
      const target = draft as grida.program.nodes.UnknownNodeProperties;
      const paints = Array.isArray(value)
        ? (value as unknown as PaintValue[])
        : [];

      if (!paints.length) {
        writePaints(target, "stroke", []);
        return;
      }

      writePaints(target, "stroke", paints);
    },
  }),
  stroke_width: defineNodeProperty<"stroke_width">({
    assert: (node) =>
      node.type === "vector" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).stroke_width = ranged(
        0,
        value,
        editor.config.DEFAULT_MAX_STROKE_WIDTH
      );
    },
  }),
  rectangular_stroke_width_top:
    defineNodeProperty<"rectangular_stroke_width_top">({
      assert: (node) => node.type === "rectangle",
      apply: (draft, value, prev) => {
        (draft as UN).rectangular_stroke_width_top = ranged(
          0,
          value,
          editor.config.DEFAULT_MAX_STROKE_WIDTH
        );
      },
    }),
  rectangular_stroke_width_right:
    defineNodeProperty<"rectangular_stroke_width_right">({
      assert: (node) => node.type === "rectangle",
      apply: (draft, value, prev) => {
        (draft as UN).rectangular_stroke_width_right = ranged(
          0,
          value,
          editor.config.DEFAULT_MAX_STROKE_WIDTH
        );
      },
    }),
  rectangular_stroke_width_bottom:
    defineNodeProperty<"rectangular_stroke_width_bottom">({
      assert: (node) => node.type === "rectangle",
      apply: (draft, value, prev) => {
        (draft as UN).rectangular_stroke_width_bottom = ranged(
          0,
          value,
          editor.config.DEFAULT_MAX_STROKE_WIDTH
        );
      },
    }),
  rectangular_stroke_width_left:
    defineNodeProperty<"rectangular_stroke_width_left">({
      assert: (node) => node.type === "rectangle",
      apply: (draft, value, prev) => {
        (draft as UN).rectangular_stroke_width_left = ranged(
          0,
          value,
          editor.config.DEFAULT_MAX_STROKE_WIDTH
        );
      },
    }),
  stroke_align: defineNodeProperty<"stroke_align">({
    assert: (node) =>
      node.type === "vector" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).stroke_align = value;
    },
  }),
  stroke_cap: defineNodeProperty<"stroke_cap">({
    apply: (draft, value, prev) => {
      (draft as UN).stroke_cap = value;
    },
  }),
  stroke_join: defineNodeProperty<"stroke_join">({
    apply: (draft, value, prev) => {
      (draft as UN).stroke_join = value;
    },
  }),
  stroke_miter_limit: defineNodeProperty<"stroke_miter_limit">({
    apply: (draft, value, prev) => {
      (draft as UN).stroke_miter_limit = value;
    },
  }),
  stroke_dash_array: defineNodeProperty<"stroke_dash_array">({
    assert: (node) =>
      node.type === "vector" ||
      node.type === "line" ||
      node.type === "rectangle" ||
      node.type === "ellipse" ||
      node.type === "polygon" ||
      node.type === "star" ||
      node.type === "image" ||
      node.type === "container" ||
      node.type === "boolean",
    apply: (draft, value, prev) => {
      (draft as UN).stroke_dash_array = value;
    },
  }),
  fe_shadows: defineNodeProperty<"fe_shadows">({
    apply: (draft, value, prev) => {
      (draft as UN).fe_shadows = value?.map((s) => ({
        ...s,
        active: s.active ?? true,
        dx: ranged(
          -editor.config.DEFAULT_MAX_SHADOW_OFFSET,
          s.dx,
          editor.config.DEFAULT_MAX_SHADOW_OFFSET
        ),
        dy: ranged(
          -editor.config.DEFAULT_MAX_SHADOW_OFFSET,
          s.dy,
          editor.config.DEFAULT_MAX_SHADOW_OFFSET
        ),
        blur: ranged(0, s.blur, editor.config.DEFAULT_MAX_BLUR_RADIUS),
        spread: ranged(
          -editor.config.DEFAULT_MAX_SHADOW_SPREAD,
          s.spread,
          editor.config.DEFAULT_MAX_SHADOW_SPREAD
        ),
      }));
    },
  }),
  fe_blur: defineNodeProperty<"fe_blur">({
    apply: (draft, value, prev) => {
      if (value) {
        (draft as UN).fe_blur = {
          ...value,
          blur: {
            ...value.blur,
            ...(value.blur.type === "blur"
              ? {
                  radius: ranged(
                    0,
                    value.blur.radius,
                    editor.config.DEFAULT_MAX_BLUR_RADIUS
                  ),
                }
              : {
                  radius: ranged(
                    0,
                    value.blur.radius,
                    editor.config.DEFAULT_MAX_BLUR_RADIUS
                  ),
                  radius2: ranged(
                    0,
                    value.blur.radius2,
                    editor.config.DEFAULT_MAX_BLUR_RADIUS
                  ),
                }),
          },
          active: value.active ?? true,
        };
      } else {
        (draft as UN).fe_blur = undefined;
      }
    },
  }),
  fe_backdrop_blur: defineNodeProperty<"fe_backdrop_blur">({
    apply: (draft, value, prev) => {
      if (value) {
        (draft as UN).fe_backdrop_blur = {
          ...value,
          blur: {
            ...value.blur,
            ...(value.blur.type === "blur"
              ? {
                  radius: ranged(
                    0,
                    value.blur.radius,
                    editor.config.DEFAULT_MAX_BLUR_RADIUS
                  ),
                }
              : {
                  radius: ranged(
                    0,
                    value.blur.radius,
                    editor.config.DEFAULT_MAX_BLUR_RADIUS
                  ),
                  radius2: ranged(
                    0,
                    value.blur.radius2,
                    editor.config.DEFAULT_MAX_BLUR_RADIUS
                  ),
                }),
          },
          active: value.active ?? true,
        };
      } else {
        (draft as UN).fe_backdrop_blur = undefined;
      }
    },
  }),
  fe_liquid_glass: defineNodeProperty<"fe_liquid_glass">({
    apply: (draft, value, prev) => {
      if (value) {
        value = {
          ...value,
          active: value.active ?? true,
          light_intensity: cmath.clamp(value.light_intensity, 0, 1),
          light_angle: value.light_angle,
          // refraction is now normalized 0-1, maps to IOR 1.0-2.0
          refraction: cmath.clamp(value.refraction, 0, 1),
          // depth is now absolute pixels [1.0+]
          depth: cmath.clamp(
            value.depth,
            1.0,
            editor.config.DEFAULT_MAX_LIQUID_GLASS_DEPTH
          ),
          dispersion: cmath.clamp(value.dispersion, 0, 1),
          radius: ranged(
            0,
            value.radius,
            editor.config.DEFAULT_MAX_LIQUID_GLASS_BLUR_RADIUS
          ),
        } satisfies cg.FeLiquidGlass;
      }
      (draft as UN).fe_liquid_glass = value;
    },
  }),
  fe_noises: defineNodeProperty<"fe_noises">({
    apply: (draft, value, prev) => {
      (draft as UN).fe_noises = value?.map((n) => ({
        ...n,
        active: n.active ?? true,
        noise_size: Math.max(0.001, n.noise_size),
        density: cmath.clamp(n.density, 0, 1),
        num_octaves: Math.min(4, Math.max(1, n.num_octaves ?? 3)),
      }));
    },
  }),
  z_index: defineNodeProperty<"z_index">({
    assert: (node) => typeof node.z_index === "number",
    apply: (draft, value, prev) => {
      (draft as UN).z_index = value;
    },
  }),
  fit: defineNodeProperty<"fit">({
    assert: (node) => node.type === "image",
    apply: (draft, value, prev) => {
      (draft as UN).fit = value;
    },
  }),
  padding_top: defineNodeProperty<"padding_top">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).padding_top = value;
    },
  }),
  padding_right: defineNodeProperty<"padding_right">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).padding_right = value;
    },
  }),
  padding_bottom: defineNodeProperty<"padding_bottom">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).padding_bottom = value;
    },
  }),
  padding_left: defineNodeProperty<"padding_left">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).padding_left = value;
    },
  }),
  clips_content: defineNodeProperty<"clips_content">({
    assert: (node) => node.type === "container",
    apply: (draft, value, prev) => {
      (draft as UN).clips_content = value;
    },
  }),
  layout_mode: defineNodeProperty<"layout_mode">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (_draft, value, prev) => {
      const draft = _draft as UN;
      draft.layout_mode = value;
      if (prev !== "flex" && value === "flex") {
        // initialize flex layout
        // each property cannot be undefined, but for older version compatibility, we need to set default value (only when not set)
        if (!draft.layout_direction) draft.layout_direction = "horizontal";
        if (!draft.main_axis_alignment) draft.main_axis_alignment = "start";
        if (!draft.cross_axis_alignment) draft.cross_axis_alignment = "start";
        if (!draft.main_axis_gap) draft.main_axis_gap = 0;
        if (!draft.cross_axis_gap) draft.cross_axis_gap = 0;
      }
    },
  }),
  layout_direction: defineNodeProperty<"layout_direction">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).layout_direction = value;
    },
  }),
  main_axis_alignment: defineNodeProperty<"main_axis_alignment">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).main_axis_alignment = value;
    },
  }),
  cross_axis_alignment: defineNodeProperty<"cross_axis_alignment">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).cross_axis_alignment = value;
    },
  }),
  main_axis_gap: defineNodeProperty<"main_axis_gap">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).main_axis_gap = value;
    },
  }),
  cross_axis_gap: defineNodeProperty<"cross_axis_gap">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).cross_axis_gap = value;
    },
  }),
  layout_wrap: defineNodeProperty<"layout_wrap">({
    assert: (node) => node.type === "container" || node.type === "component",
    apply: (draft, value, prev) => {
      (draft as UN).layout_wrap = value;
    },
  }),
  text_align: defineNodeProperty<"text_align">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).text_align = value;
    },
  }),
  text_align_vertical: defineNodeProperty<"text_align_vertical">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).text_align_vertical = value;
    },
  }),
  text_decoration_line: defineNodeProperty<"text_decoration_line">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).text_decoration_line = value;
    },
  }),
  text_decoration_style: defineNodeProperty<"text_decoration_style">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).text_decoration_style = value;
    },
  }),
  text_decoration_color: defineNodeProperty<"text_decoration_color">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).text_decoration_color = value;
    },
  }),
  text_decoration_skip_ink: defineNodeProperty<"text_decoration_skip_ink">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).text_decoration_skip_ink = value;
    },
  }),
  text_decoration_thickness: defineNodeProperty<"text_decoration_thickness">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).text_decoration_thickness = value;
    },
  }),
  text_transform: defineNodeProperty<"text_transform">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).text_transform = value;
    },
  }),
  font_style_italic: defineNodeProperty<"font_style_italic">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).font_style_italic = value;
    },
  }),
  font_postscript_name: defineNodeProperty<"font_postscript_name">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).font_postscript_name = value;
    },
  }),
  font_weight: defineNodeProperty<"font_weight">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).font_weight = value;
    },
  }),
  font_kerning: defineNodeProperty<"font_kerning">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).font_kerning = value;
    },
  }),
  font_width: defineNodeProperty<"font_width">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).font_width = value;
    },
  }),
  font_features: defineNodeProperty<"font_features">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).font_features = value;
    },
  }),
  font_variations: defineNodeProperty<"font_variations">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).font_variations = value;
    },
  }),
  font_optical_sizing: defineNodeProperty<"font_optical_sizing">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).font_optical_sizing = value;
    },
  }),
  font_size: defineNodeProperty<"font_size">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).font_size = ranged(1, value);
    },
  }),
  line_height: defineNodeProperty<"line_height">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).line_height = ranged(0, value);
    },
  }),
  letter_spacing: defineNodeProperty<"letter_spacing">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).letter_spacing = value;
    },
  }),
  word_spacing: defineNodeProperty<"word_spacing">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).word_spacing = value;
    },
  }),
  max_length: defineNodeProperty<"max_length">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).max_length = value;
    },
  }),
  max_lines: defineNodeProperty<"max_lines">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).max_lines = value ? ranged(1, value) : null;
    },
  }),
  text: defineNodeProperty<"text">({
    assert: (node) => node.type === "tspan",
    apply: (draft, value, prev) => {
      (draft as UN).text = value ?? null;
    },
  }),
};

function applyNodeProperty<K extends keyof grida.program.nodes.UnknownNode>(
  draft: grida.program.nodes.UnknownNodeProperties,
  key: K,
  value: grida.program.nodes.UnknownNode[K]
) {
  if (!(key in safe_properties)) {
    throw new Error(`property handler not found: "${key}"`);
  }
  const property = safe_properties[key as keyof typeof safe_properties];
  if (property) {
    const prev = (draft as any)[key];
    // TODO: assert - decide pre or after
    property.apply(draft, value, prev);
  }
}

export default function nodeReducer<
  N extends Partial<grida.program.nodes.Node>,
>(node: N, action: NodeChangeAction): N {
  return produce(node, (draft) => {
    switch (action.type) {
      case "node/change/*": {
        const { type: _, node_id: __, ...values } = action as NodeChangeAction;

        for (const [key, value] of Object.entries(values)) {
          applyNodeProperty(
            draft as grida.program.nodes.UnknownNodeProperties,
            key as keyof grida.program.nodes.UnknownNode,
            value
          );
        }
        break;
      }
      // keep
      case "node/change/positioning": {
        const pos = draft as grida.program.nodes.i.IPositioning;
        if (
          ("layout_positioning" satisfies UNPK) in action &&
          action.layout_positioning
        ) {
          pos.layout_positioning = action.layout_positioning;
        }
        if (("layout_inset_left" satisfies UNPK) in action)
          pos.layout_inset_left = action.layout_inset_left;
        if (("layout_inset_top" satisfies UNPK) in action)
          pos.layout_inset_top = action.layout_inset_top;
        if (("layout_inset_right" satisfies UNPK) in action)
          pos.layout_inset_right = action.layout_inset_right;
        if (("layout_inset_bottom" satisfies UNPK) in action)
          pos.layout_inset_bottom = action.layout_inset_bottom;
        break;
      }
      // keep
      case "node/change/positioning-mode": {
        const { layout_positioning: position } = action;
        (draft as grida.program.nodes.i.IPositioning).layout_positioning =
          position;
        switch (position) {
          case "absolute": {
            break;
          }
          case "relative": {
            (draft as grida.program.nodes.i.IPositioning).layout_inset_left =
              undefined;
            (draft as grida.program.nodes.i.IPositioning).layout_inset_top =
              undefined;
            (draft as grida.program.nodes.i.IPositioning).layout_inset_right =
              undefined;
            (draft as grida.program.nodes.i.IPositioning).layout_inset_bottom =
              undefined;
          }
        }
        break;
      }
      case "node/change/component": {
        assert(draft.type === "instance");
        draft.component_id = action.component_id;
        break;
      }
      case "node/change/props": {
        assert(draft.type === "instance" || draft.type === "template_instance");
        draft.props = Object.assign({}, draft.props, action.props);
        break;
      }
      case "node/change/style": {
        // assert(draft.type !== 'template_instance')
        (draft as Draft<grida.program.nodes.i.ICSSStylable>).style =
          Object.assign(
            {},
            (draft as Draft<grida.program.nodes.i.ICSSStylable>).style,
            action.style
          );
        break;
      }
      case "node/change/fontFamily": {
        assert(draft.type === "tspan");
        draft.font_family = action.fontFamily;
        break;
      }

      default: {
        throw new Error(
          `unknown action type: "${(action as NodeChangeAction).type as string}"`
        );
      }
    }
  });
}

const ranged = (min: number, value: number, max?: number) => {
  if (max === undefined) {
    return Math.max(min, value);
  }
  return Math.min(Math.max(value, min), max);
};
