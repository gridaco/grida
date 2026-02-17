import cg from "@grida/cg";
import type grida from "@grida/schema";
import vn from "@grida/vn";
import type * as figrest from "@figma/rest-api-spec";
import type * as figkiwi from "./fig-kiwi/schema";
import cmath from "@grida/cmath";
import kolor from "@grida/color";
import {
  extractImages as extractImagesFromFigKiwi,
  getBlobBytes,
  parseVectorNetworkBlob,
  readFigFile,
  type ParsedFigmaArchive,
} from "./fig-kiwi";

const _GRIDA_SYSTEM_EMBEDDED_CHECKER =
  "system://images/checker-16-strip-L98L92.png";

export namespace iofigma {
  /**
   * custom structs for bridging difference between rest api spec, kiwi spec and plugin sdk spec.
   */
  export namespace __ir {
    /**
     * ## HasLayoutTraitIR (extended layout trait)
     *
     * Figma’s REST API spec (`@figma/rest-api-spec`) defines `HasLayoutTrait` and includes
     * `preserveRatio?: boolean`, but it **does not** carry the richer aspect-ratio payload that
     * exists in other Figma sources (notably the Plugin SDK and the `.fig` Kiwi schema).
     *
     * - **REST API**: `preserveRatio?: boolean` (flag only; no target ratio vector)
     * - **Kiwi (.fig / clipboard)**: `proportionsConstrained?: boolean` and `targetAspectRatio?: OptionalVector`
     * - **Plugin SDK**: `targetAspectRatio?: Vector` (but `constrainProportions` is deprecated)
     *
     * We keep the REST surface area as the baseline, and extend it with `targetAspectRatio`
     * so downstream conversion can use a single aligned shape:
     *
     * - Use **`preserveRatio`** (REST field) as the normalized “locked” flag.
     * - Use **`targetAspectRatio`** (IR-only) as the normalized ratio vector when available.
     */
    export type HasLayoutTraitIR = figrest.HasLayoutTrait & {
      /**
       * Normalized target aspect ratio vector (w, h) when the source provides it.
       *
       * NOTE: This is **not** part of the REST API spec as of `@figma/rest-api-spec@0.35.0`.
       */
      targetAspectRatio?: figrest.Vector;
    };

    /**
     * Vector network shape returned by the Figma REST API as an **undocumented, volatile** field
     * on VECTOR nodes when the file is requested with `geometry=paths`.
     *
     * Alongside the well-known `fillGeometry` and `strokeGeometry` (SVG path strings), the API
     * may also include a `vectorNetwork` object with vertices, segments, and regions. This type
     * describes that object. It is not part of the official `@figma/rest-api-spec` and may change
     * or be removed at any time without notice.
     *
     * Use this type only when volatile APIs are enabled (see `disable_volatile_apis`); normalize
     * it to `__ir.VectorNetwork` before using in the import pipeline.
     *
     * @remarks
     * - First observed present in REST responses on **2026-02-17**. The type name is dated so that
     *   future changes to the API can be tracked with a new type if the shape diverges.
     * - As an undocumented volatile API, the response may have minor inconsistencies (e.g.
     *   `windingRule` may be `"EVENODD"` | `"NONZERO"` | `"nonzero"` | `"odd"`). Normalizers should handle all casings.
     *
     * @deprecated Volatile, versioned shape; the type name includes the snapshot date (2026-02-17)
     * so that future API changes can introduce a new type (e.g. 20260301) without breaking callers.
     * Search for "volatile" to locate related code (e.g. disable_volatile_apis) for removal.
     */
    export type VectorNetwork_restapi_volatile20260217 = {
      vertices: Array<{
        position: { x: number; y: number };
        meta?: 0 | unknown;
      }>;
      segments: Array<{
        start: number;
        startTangent: { x: number; y: number };
        end: number;
        endTangent: { x: number; y: number };
        meta?: 0 | unknown;
      }>;
      regions: Array<{
        loops: number[][];
        /** Volatile API may return inconsistent casing: EVENODD | NONZERO | nonzero | odd */
        windingRule: "EVENODD" | "NONZERO" | "nonzero" | "odd";
        meta?: 0 | unknown;
      }>;
    };

    /**
     * Vector network structure (vertices, segments, regions)
     * Matches the output of parseVectorNetworkBlob from blob-parser
     */
    export type VectorNetwork = {
      vertices: Array<{ styleID: number; x: number; y: number }>;
      segments: Array<{
        styleID: number;
        start: { vertex: number; dx: number; dy: number };
        end: { vertex: number; dx: number; dy: number };
      }>;
      regions: Array<{
        styleID: number;
        windingRule: "NONZERO" | "ODD";
        loops: Array<{ segments: number[] }>;
      }>;
    };

    /**
     * REST API VECTOR when using geometry=paths. Volatile API may also return vectorNetwork.
     * Use this type when passing REST response nodes that may include the undocumented vectorNetwork field.
     */
    export type VectorNodeRestInput = figrest.VectorNode & {
      vectorNetwork?: VectorNetwork_restapi_volatile20260217;
    };

    /**
     * - rest-api-spec - Not supported
     * - kiwi-spec - Supported
     * - plugin-sdk-spec - Supported
     */
    export type VectorNodeWithVectorNetworkDataPresent =
      figrest.CornerRadiusShapeTraits &
        figrest.AnnotationsTrait & {
          type: "X_VECTOR";
          vectorNetwork: VectorNetwork;
        };

    /**
     * - rest-api-spec - Not supported
     * - kiwi-spec - Supported
     * - plugin-sdk-spec - Supported
     */
    export type RegularPolygonNodeWithPointsDataPresent =
      figrest.CornerRadiusShapeTraits &
        figrest.AnnotationsTrait & {
          type: "X_REGULAR_POLYGON";
          pointCount: number;
        };

    /**
     * - rest-api-spec - Not supported
     * - kiwi-spec - Supported
     * - plugin-sdk-spec - Supported
     */
    export type StarNodeWithPointsDataPresent =
      figrest.CornerRadiusShapeTraits &
        figrest.AnnotationsTrait & {
          type: "X_STAR";
          pointCount: number;
          innerRadius: number;
        };
  }

  export namespace restful {
    export namespace map {
      export const strokeCapMap: Record<
        NonNullable<figrest.LineNode["strokeCap"]>,
        cg.StrokeCap | undefined
      > = {
        NONE: "butt",
        ROUND: "round",
        SQUARE: "square",
        //
        LINE_ARROW: undefined,
        TRIANGLE_ARROW: undefined,
        DIAMOND_FILLED: undefined,
        CIRCLE_FILLED: undefined,
        TRIANGLE_FILLED: undefined,
        WASHI_TAPE_1: undefined,
        WASHI_TAPE_2: undefined,
        WASHI_TAPE_3: undefined,
        WASHI_TAPE_4: undefined,
        WASHI_TAPE_5: undefined,
        WASHI_TAPE_6: undefined,
      };

      export const strokeJoinMap: Record<
        NonNullable<figrest.LineNode["strokeJoin"]>,
        cg.StrokeJoin
      > = {
        MITER: "miter",
        ROUND: "round",
        BEVEL: "bevel",
      };

      export const strokeAlignMap: Record<
        NonNullable<figrest.LineNode["strokeAlign"]>,
        cg.StrokeAlign | undefined
      > = {
        CENTER: "center",
        INSIDE: "inside",
        OUTSIDE: "outside",
      };

      export const textAlignMap: Record<
        NonNullable<figrest.TypeStyle["textAlignHorizontal"]>,
        cg.TextAlign | undefined
      > = {
        CENTER: "center",
        RIGHT: "right",
        LEFT: "left",
        JUSTIFIED: undefined,
      };

      export const textAlignVerticalMap: Record<
        NonNullable<figrest.TypeStyle["textAlignVertical"]>,
        cg.TextAlignVertical
      > = {
        CENTER: "center",
        TOP: "top",
        BOTTOM: "bottom",
      };

      export const textDecorationMap: Record<
        NonNullable<figrest.TypeStyle["textDecoration"]>,
        cg.TextDecorationLine | undefined
      > = {
        NONE: "none",
        STRIKETHROUGH: undefined,
        UNDERLINE: "underline",
      };

      export const windingRuleMap: Record<
        figrest.Path["windingRule"],
        cg.FillRule
      > = {
        EVENODD: "evenodd",
        NONZERO: "nonzero",
      };

      export const blendModeMap: Record<figrest.BlendMode, cg.BlendMode> = {
        PASS_THROUGH: "normal", // no-op here
        NORMAL: "normal", // Matches the default blend mode.
        DARKEN: "darken",
        MULTIPLY: "multiply",
        LINEAR_BURN: "darken", // No direct equivalent, closest is "darken".
        COLOR_BURN: "color-burn",
        LIGHTEN: "lighten",
        SCREEN: "screen",
        LINEAR_DODGE: "lighten", // No direct equivalent, closest is "lighten".
        COLOR_DODGE: "color-dodge",
        OVERLAY: "overlay",
        SOFT_LIGHT: "soft-light",
        HARD_LIGHT: "hard-light",
        DIFFERENCE: "difference",
        EXCLUSION: "exclusion",
        HUE: "hue",
        SATURATION: "saturation",
        COLOR: "color",
        LUMINOSITY: "luminosity",
      };

      export const layerBlendModeMap: Record<
        figrest.BlendMode,
        cg.LayerBlendMode
      > = {
        ...blendModeMap,
        PASS_THROUGH: "pass-through",
      };

      /**
       * Normalizes REST API volatile vector network shape to __ir.VectorNetwork.
       * Returns null if the payload is missing, not an array, or has invalid indices.
       */
      export function normalizeRestVectorNetworkToIR(
        rest: __ir.VectorNetwork_restapi_volatile20260217
      ): __ir.VectorNetwork | null {
        if (
          !Array.isArray(rest.vertices) ||
          !Array.isArray(rest.segments) ||
          !Array.isArray(rest.regions)
        ) {
          return null;
        }
        const vertexCount = rest.vertices.length;
        const segmentCount = rest.segments.length;

        for (const seg of rest.segments) {
          if (
            typeof seg.start !== "number" ||
            typeof seg.end !== "number" ||
            seg.start < 0 ||
            seg.start >= vertexCount ||
            seg.end < 0 ||
            seg.end >= vertexCount ||
            !seg.startTangent ||
            !seg.endTangent
          ) {
            return null;
          }
        }

        for (const region of rest.regions) {
          if (!Array.isArray(region.loops)) return null;
          for (const loop of region.loops) {
            if (!Array.isArray(loop)) return null;
            for (const segIdx of loop) {
              if (
                typeof segIdx !== "number" ||
                segIdx < 0 ||
                segIdx >= segmentCount
              ) {
                return null;
              }
            }
          }
        }

        const vertices: __ir.VectorNetwork["vertices"] = rest.vertices.map(
          (v) => ({
            x: v.position?.x ?? 0,
            y: v.position?.y ?? 0,
            styleID: 0,
          })
        );

        const segments: __ir.VectorNetwork["segments"] = rest.segments.map(
          (seg) => ({
            styleID: 0,
            start: {
              vertex: seg.start,
              dx: seg.startTangent.x,
              dy: seg.startTangent.y,
            },
            end: {
              vertex: seg.end,
              dx: seg.endTangent.x,
              dy: seg.endTangent.y,
            },
          })
        );

        const regions: __ir.VectorNetwork["regions"] = rest.regions.map(
          (region) => {
            const wr = region.windingRule?.toUpperCase?.();
            const windingRule: "NONZERO" | "ODD" =
              wr === "EVENODD" || wr === "ODD" ? "ODD" : "NONZERO";
            const loops = region.loops.map((loop) => ({ segments: loop }));
            return { styleID: 0, windingRule, loops };
          }
        );

        return { vertices, segments, regions };
      }
    }

    export namespace factory {
      /**
       * Result of converting Figma REST document to Grida format.
       *
       * - **document**: The packed scene document for insert.
       * - **imageRefsUsed**: Figma image refs that appear in the document and need registration.
       *   Caller should only download/register refs in this set to avoid bloat.
       */
      export interface FigmaImportResult {
        document: grida.program.document.IPackedSceneDocument;
        imageRefsUsed: string[];
      }

      /**
       * Context for the REST document factory.
       *
       * @property node_id_generator - Optional ID generator for Grida node IDs.
       * @property gradient_id_generator - ID generator for gradient definitions.
       * @property resolve_image_src - Resolves a Figma image ref to a runtime src (e.g. res://images/&lt;ref&gt;).
       *   Caller owns resource availability; io-figma does not fetch or validate.
       *   @param imageRef - Figma image reference (hash string from API or Kiwi).
       *   @returns Runtime src string, or null to use placeholder.
       */
      export type FactoryContext = {
        node_id_generator?: () => string;
        gradient_id_generator: () => string;
        /**
         * Resolves a Figma image ref to a runtime src (e.g. res://images/&lt;ref&gt;).
         * Caller owns resource availability; io-figma does not fetch or validate.
         *
         * @param imageRef - Figma image reference (hash string from API or Kiwi).
         * @returns Runtime src string, or null to use placeholder.
         */
        resolve_image_src?: (imageRef: string) => string | null;
        /**
         * When true, use Figma node IDs as Grida node IDs instead of generating new ones.
         * Required for export-by-nodeId from .fig files.
         */
        preserve_figma_ids?: boolean;
        /**
         * When true, disable volatile/undocumented APIs (e.g. REST vectorNetwork on VECTOR nodes).
         * Default false: volatile APIs are enabled; vectorNetwork is used when present.
         * Set to true to always use fillGeometry/strokeGeometry (GroupNode + children) for VECTORs.
         */
        disable_volatile_apis?: boolean;
      };

      function toGradientPaint(paint: figrest.GradientPaint) {
        const type_map = {
          GRADIENT_LINEAR: "linear_gradient",
          GRADIENT_RADIAL: "radial_gradient",
          GRADIENT_ANGULAR: "sweep_gradient",
          GRADIENT_DIAMOND: "diamond_gradient",
        } as const;

        const type = type_map[paint.type as keyof typeof type_map];
        const handles = paint.gradientHandlePositions;
        const points: cmath.ui.gradient.ControlPoints = handles
          ? {
              A: [handles[0].x, handles[0].y],
              B: [handles[1].x, handles[1].y],
              C: [handles[2].x, handles[2].y],
            }
          : cmath.ui.gradient.baseControlPoints(type);

        return {
          type: type,
          transform: cmath.ui.gradient.transformFromControlPoints(points, type),
          stops: paint.gradientStops.map((stop) => ({
            offset: stop.position,
            color: kolor.colorformats.newRGBA32F(
              stop.color.r,
              stop.color.g,
              stop.color.b,
              stop.color.a
            ),
          })),
          blend_mode: map.blendModeMap[paint.blendMode],
          active: paint.visible ?? true,
          opacity: paint.opacity ?? 1,
        } as cg.GradientPaint;
      }

      function toSolidPaint(paint: figrest.SolidPaint): cg.SolidPaint {
        return {
          type: "solid",
          color: kolor.colorformats.RGBA32F.multiplyA32(
            kolor.colorformats.newRGBA32F(
              paint.color.r,
              paint.color.g,
              paint.color.b,
              paint.color.a
            ),
            paint.opacity
          ),
          active: paint.visible ?? true,
        };
      }

      function convertPaint(
        p: figrest.Paint,
        ctx: FactoryContext,
        imageRefsUsed: Set<string>
      ): cg.Paint | undefined {
        switch (p.type) {
          case "SOLID": {
            return toSolidPaint(p);
          }
          case "GRADIENT_LINEAR":
          case "GRADIENT_RADIAL":
          case "GRADIENT_ANGULAR":
          case "GRADIENT_DIAMOND": {
            return toGradientPaint(p);
          }
          case "IMAGE": {
            const imageRef = (p as figrest.ImagePaint).imageRef ?? "";
            const src =
              ctx.resolve_image_src?.(imageRef) ??
              _GRIDA_SYSTEM_EMBEDDED_CHECKER;
            if (src !== _GRIDA_SYSTEM_EMBEDDED_CHECKER && imageRef) {
              imageRefsUsed.add(imageRef);
            }
            return {
              type: "image",
              src,
              fit: p.scaleMode
                ? p.scaleMode === "FILL"
                  ? "cover"
                  : p.scaleMode === "FIT"
                    ? "contain"
                    : p.scaleMode === "TILE"
                      ? "tile"
                      : "fill"
                : "cover",
              transform: p.imageTransform
                ? [
                    [
                      p.imageTransform[0][0],
                      p.imageTransform[0][1],
                      p.imageTransform[0][2],
                    ],
                    [
                      p.imageTransform[1][0],
                      p.imageTransform[1][1],
                      p.imageTransform[1][2],
                    ],
                  ]
                : cmath.transform.identity,
              filters: p.filters
                ? {
                    exposure: p.filters.exposure ?? 0,
                    contrast: p.filters.contrast ?? 0,
                    saturation: p.filters.saturation ?? 0,
                    temperature: p.filters.temperature ?? 0,
                    tint: p.filters.tint ?? 0,
                    highlights: p.filters.highlights ?? 0,
                    shadows: p.filters.shadows ?? 0,
                  }
                : {
                    exposure: 0,
                    contrast: 0,
                    saturation: 0,
                    temperature: 0,
                    tint: 0,
                    highlights: 0,
                    shadows: 0,
                  },
              blend_mode: map.blendModeMap[p.blendMode],
              opacity: p.opacity ?? 1,
              active: p.visible ?? true,
            } satisfies cg.ImagePaint;
          }
          default:
            return undefined;
        }
      }

      function rectangleCornerRadius(
        rectangleCornerRadii?: number[] | [number, number, number, number],
        baseRadius: number = 0
      ): grida.program.nodes.i.IRectangularCornerRadius {
        // order: top-left, top-right, bottom-right, bottom-left (clockwise)
        return {
          rectangular_corner_radius_top_left:
            rectangleCornerRadii?.[0] ?? baseRadius,
          rectangular_corner_radius_top_right:
            rectangleCornerRadii?.[1] ?? baseRadius,
          rectangular_corner_radius_bottom_right:
            rectangleCornerRadii?.[2] ?? baseRadius,
          rectangular_corner_radius_bottom_left:
            rectangleCornerRadii?.[3] ?? baseRadius,
        };
      }

      /**
       * Trait functions for composable node property mapping
       * Each trait always returns a complete object (never undefined)
       */

      /**
       * Base node properties - IBaseNode, ISceneNode, IBlend, IZIndex, IRotation
       * Note: id is handled separately and not included here
       */
      function base_node_trait(node: {
        name: string;
        visible?: boolean;
        locked?: boolean;
        rotation?: number;
        opacity?: number;
        blendMode: figrest.BlendMode;
      }) {
        return {
          name: node.name,
          active: node.visible ?? true,
          locked: node.locked ?? false,
          rotation: node.rotation ?? 0,
          opacity: node.opacity ?? 1,
          blend_mode: map.layerBlendModeMap[node.blendMode],
          z_index: 0,
        };
      }

      /**
       * Positioning properties - IPositioning
       */
      function positioning_trait(
        node:
          | (figrest.HasLayoutTrait & Partial<__ir.HasLayoutTraitIR>)
          | {
              relativeTransform?: any;
              size?: any;
            }
      ): Pick<
        grida.program.nodes.ContainerNode,
        | "layout_positioning"
        | "layout_inset_left"
        | "layout_inset_top"
        | "layout_target_width"
        | "layout_target_height"
        | "layout_target_aspect_ratio"
      > {
        const szx = node.size?.x ?? 0;
        const szy = node.size?.y ?? 0;

        // Align spec: use REST `preserveRatio` as the canonical flag.
        const constrained =
          (node as figrest.HasLayoutTrait).preserveRatio === true;

        // Align spec: `targetAspectRatio` only exists in IR.
        const tar = (node as __ir.HasLayoutTraitIR).targetAspectRatio;

        const layout_target_aspect_ratio = constrained
          ? cmath.aspectRatio(tar?.x ?? szx, tar?.y ?? szy, 1000)
          : undefined;

        return {
          layout_positioning: "absolute" as const,
          layout_inset_left: node.relativeTransform?.[0][2] ?? 0,
          layout_inset_top: node.relativeTransform?.[1][2] ?? 0,
          layout_target_width: szx,
          layout_target_height: szy,
          layout_target_aspect_ratio,
        };
      }

      /**
       * Fill properties - IFill
       */
      function fills_trait(
        fills: figrest.Paint[],
        context: FactoryContext,
        imageRefsUsed: Set<string>
      ) {
        const fills_paints = fills
          .map((p) => convertPaint(p, context, imageRefsUsed))
          .filter((p): p is cg.Paint => p !== undefined);
        return {
          fill_paints: fills_paints.length > 0 ? fills_paints : undefined,
        };
      }

      /**
       * Stroke properties - IStroke
       */
      function stroke_trait(
        node: {
          strokes?: figrest.Paint[];
          strokeWeight?: number;
          strokeCap?: figrest.LineNode["strokeCap"];
          strokeJoin?: figrest.LineNode["strokeJoin"];
          strokeDashes?: number[];
          strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";
          strokeMiterAngle?: number;
        },
        context: FactoryContext,
        imageRefsUsed: Set<string>
      ) {
        const strokes_paints = (node.strokes ?? [])
          .map((p) => convertPaint(p, context, imageRefsUsed))
          .filter((p): p is cg.Paint => p !== undefined);
        return {
          stroke_paints: strokes_paints.length > 0 ? strokes_paints : undefined,
          stroke_width: node.strokeWeight ?? 0,
          stroke_cap: node.strokeCap
            ? (map.strokeCapMap[node.strokeCap] ?? "butt")
            : "butt",
          stroke_join: node.strokeJoin
            ? (map.strokeJoinMap[node.strokeJoin] ?? "miter")
            : "miter",
          stroke_dash_array: node.strokeDashes,
          stroke_align: node.strokeAlign
            ? (map.strokeAlignMap[node.strokeAlign] ?? "center")
            : undefined,
          stroke_miter_limit: node.strokeMiterAngle,
        };
      }

      /**
       * Text stroke properties - ITextStroke (simpler than IStroke)
       */
      function text_stroke_trait(
        node: {
          strokes?: figrest.Paint[];
          strokeWeight?: number;
          strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";
        },
        context: FactoryContext,
        imageRefsUsed: Set<string>
      ) {
        const strokes_paints = (node.strokes ?? [])
          .map((p) => convertPaint(p, context, imageRefsUsed))
          .filter((p): p is cg.Paint => p !== undefined);
        return {
          stroke_paints: strokes_paints.length > 0 ? strokes_paints : undefined,
          stroke_width: node.strokeWeight ?? 0,
          stroke_align: node.strokeAlign
            ? (map.strokeAlignMap[node.strokeAlign] ?? "inside")
            : undefined,
        };
      }

      /**
       * Corner radius properties - ICornerRadius, IRectangularCornerRadius
       */
      function corner_radius_trait(node: {
        cornerRadius?: number;
        rectangleCornerRadii?: number[];
        cornerSmoothing?: number;
      }) {
        const baseRadius = node.cornerRadius ?? 0;
        return {
          corner_radius: baseRadius,
          corner_smoothing: node.cornerSmoothing,
          ...rectangleCornerRadius(node.rectangleCornerRadii, baseRadius),
        };
      }

      /**
       * Effects properties - IEffects
       * Renamed from layer_effects_trait, ensures always returns object
       */
      function effects_trait(effects?: figrest.Effect[]) {
        if (!effects || effects.length === 0) {
          return {
            fe_blur: undefined,
            fe_backdrop_blur: undefined,
            fe_shadows: undefined,
          };
        }

        const shadows: cg.FeShadow[] = [];
        let layerBlur: cg.FeLayerBlur | undefined;
        let backdropBlur: cg.FeBackdropBlur | undefined;

        effects.forEach((effect) => {
          if (!effect.visible) return;

          switch (effect.type) {
            case "DROP_SHADOW":
              shadows.push({
                type: "shadow",
                dx: effect.offset.x,
                dy: effect.offset.y,
                blur: effect.radius,
                spread: effect.spread ?? 0,
                color: kolor.colorformats.newRGBA32F(
                  effect.color.r,
                  effect.color.g,
                  effect.color.b,
                  effect.color.a
                ),
                inset: false,
              });
              break;

            case "INNER_SHADOW":
              shadows.push({
                type: "shadow",
                dx: effect.offset.x,
                dy: effect.offset.y,
                blur: effect.radius,
                spread: effect.spread ?? 0,
                color: kolor.colorformats.newRGBA32F(
                  effect.color.r,
                  effect.color.g,
                  effect.color.b,
                  effect.color.a
                ),
                inset: true,
              });
              break;

            case "LAYER_BLUR":
              layerBlur = {
                type: "filter-blur",
                blur: { type: "blur", radius: effect.radius },
                active: true,
              };
              break;

            case "BACKGROUND_BLUR":
              backdropBlur = {
                type: "backdrop-filter-blur",
                blur: { type: "blur", radius: effect.radius },
                active: true,
              };
              break;
          }
        });

        return {
          fe_shadows: shadows.length > 0 ? shadows : undefined,
          fe_blur: layerBlur,
          fe_backdrop_blur: backdropBlur,
        };
      }

      /**
       * Container layout properties - IExpandable, IPadding, IFlexContainer
       */
      function container_layout_trait(
        node: {
          paddingLeft?: number;
          paddingRight?: number;
          paddingTop?: number;
          paddingBottom?: number;
          itemSpacing?: number;
          counterAxisSpacing?: number;
        },
        expanded: boolean
      ) {
        const { paddingLeft, paddingRight, paddingTop, paddingBottom } = node;
        const padding =
          paddingTop === paddingRight &&
          paddingTop === paddingBottom &&
          paddingTop === paddingLeft
            ? (paddingTop ?? 0)
            : {
                layout_padding_top: paddingTop ?? 0,
                layout_padding_right: paddingRight ?? 0,
                layout_padding_bottom: paddingBottom ?? 0,
                layout_padding_left: paddingLeft ?? 0,
              };

        return {
          expanded,
          padding,
          layout_mode: "flow" as const,
          layout_direction: "horizontal" as const,
          layout_main_axis_alignment: "start" as const,
          layout_cross_axis_alignment: "start" as const,
          layout_main_axis_gap: node.itemSpacing ?? 0,
          layout_cross_axis_gap:
            node.counterAxisSpacing ?? node.itemSpacing ?? 0,
        };
      }

      /**
       * Arc data properties - IEllipseArcData
       */
      function arc_data_trait(node: {
        arcData: figrest.EllipseNode["arcData"];
      }) {
        return {
          inner_radius: node.arcData.innerRadius,
          angle_offset: cmath.rad2deg(node.arcData.startingAngle),
          angle: cmath.rad2deg(
            node.arcData.endingAngle - node.arcData.startingAngle
          ),
        };
      }

      /**
       * Style properties - ICSSStylable
       */
      function style_trait(style: Record<string, any>) {
        return { style };
      }

      /**
       * Map Figma BooleanOperation to Grida BooleanOperation
       */
      function mapBooleanOperation(
        op: figrest.BooleanOperationNode["booleanOperation"]
      ): cg.BooleanOperation {
        const map = {
          UNION: "union",
          SUBTRACT: "difference",
          INTERSECT: "intersection",
          EXCLUDE: "xor",
        } as const;
        return map[op] ?? "union";
      }

      type FigmaParentNode =
        | figrest.BooleanOperationNode
        | figrest.InstanceNode
        | figrest.FrameNode
        | figrest.GroupNode;

      type InputNode =
        | (figrest.SubcanvasNode & Partial<__ir.HasLayoutTraitIR>)
        | __ir.VectorNodeRestInput
        | __ir.VectorNodeWithVectorNetworkDataPresent
        | __ir.StarNodeWithPointsDataPresent
        | __ir.RegularPolygonNodeWithPointsDataPresent;

      export function document(
        node: InputNode,
        images: { [key: string]: string },
        context: FactoryContext
      ): FigmaImportResult {
        const nodes: Record<string, grida.program.nodes.Node> = {};
        const graph: Record<string, string[]> = {};
        const imageRefsUsed = new Set<string>();

        // Map from Figma ID (ephemeral) to Grida ID (final)
        const figma_id_to_grida_id = new Map<string, string>();

        // ID generator function - use provided generator or fallback
        let counter = 0;
        const generateId =
          context.node_id_generator ||
          (() => `figma-import-${Date.now()}-${++counter}`);

        // Helper to get or create Grida ID for a Figma ID
        const getOrCreateGridaId = (figmaId: string): string => {
          const existing = figma_id_to_grida_id.get(figmaId);
          if (existing) return existing;
          const gridaId = context.preserve_figma_ids ? figmaId : generateId();
          figma_id_to_grida_id.set(figmaId, gridaId);
          return gridaId;
        };

        /**
         * Type guard to check if a node implements HasGeometryTrait.
         * Nodes with fillGeometry or strokeGeometry need special handling.
         */
        function hasGeometryTrait(
          node: InputNode
        ): node is InputNode & figrest.HasGeometryTrait {
          return "fillGeometry" in node || "strokeGeometry" in node;
        }

        /**
         * Creates a VectorNode from SVG path data.
         * Used for converting nodes with HasGeometryTrait (REST API with geometry=paths).
         * Applies to VECTOR, STAR, REGULAR_POLYGON, and other shape nodes.
         */
        /**
         * When true, the path is stroke geometry from REST API (outlined stroke shape).
         * Stroke color must be applied as fill; the child should have no stroke.
         */
        function createVectorNodeFromPath(
          pathData: string,
          geometry: {
            windingRule: figrest.Path["windingRule"];
          },
          parentNode: InputNode & figrest.HasGeometryTrait,
          childId: string,
          name: string,
          options: {
            useFill: boolean;
            useStroke: boolean;
            /** Stroke geometry is an outlined path: apply stroke color as fill, no stroke. */
            strokeAsFill?: boolean;
          }
        ): grida.program.nodes.VectorNode | null {
          if (!pathData) return null;

          try {
            const vectorNetwork = vn.fromSVGPathData(pathData);
            const bbox = vn.getBBox(vectorNetwork);

            // Note: In test environment with mocked svg-pathdata, vector networks may be empty.
            // This is expected and the positioning logic will still work correctly.

            // The SVG path coordinates are already in the parent VECTOR node's coordinate space.
            // We keep the vector network coordinates as-is and position the child at its bbox origin
            // relative to the parent GroupNode. This preserves the correct spatial relationships
            // between fill and stroke geometries.
            const strokeAsFill = options.strokeAsFill === true;
            return {
              id: childId,
              ...base_node_trait({
                name,
                visible: "visible" in parentNode ? parentNode.visible : true,
                locked: "locked" in parentNode ? parentNode.locked : false,
                rotation: 0,
                opacity:
                  "opacity" in parentNode && parentNode.opacity !== undefined
                    ? parentNode.opacity
                    : 1,
                blendMode:
                  "blendMode" in parentNode && parentNode.blendMode
                    ? parentNode.blendMode
                    : "NORMAL",
              }),
              ...positioning_trait({
                relativeTransform: [
                  [1, 0, bbox.x],
                  [0, 1, bbox.y],
                ],
                size: { x: bbox.width, y: bbox.height },
              }),
              ...(strokeAsFill
                ? {
                    ...fills_trait(
                      parentNode.strokes ?? [],
                      context,
                      imageRefsUsed
                    ),
                    ...stroke_trait(
                      { strokes: [], strokeWeight: 0 },
                      context,
                      imageRefsUsed
                    ),
                  }
                : {
                    ...(options.useFill
                      ? fills_trait(parentNode.fills, context, imageRefsUsed)
                      : {}),
                    ...(options.useStroke
                      ? stroke_trait(parentNode, context, imageRefsUsed)
                      : stroke_trait(
                          { strokes: [], strokeWeight: 0 },
                          context,
                          imageRefsUsed
                        )),
                  }),
              ...("effects" in parentNode && parentNode.effects
                ? effects_trait(parentNode.effects)
                : effects_trait(undefined)),
              type: "vector",
              vector_network: vectorNetwork,
              layout_target_width: bbox.width,
              layout_target_height: bbox.height,
              fill_rule: map.windingRuleMap[geometry.windingRule] ?? "nonzero",
            };
          } catch (e) {
            console.warn(
              `Failed to convert path to vector network (${name}):`,
              e
            );
            return null;
          }
        }

        /**
         * Processes fill geometries from a node with HasGeometryTrait.
         * Returns array of child node IDs that were successfully created.
         */
        function processFillGeometries(
          node: InputNode & figrest.HasGeometryTrait,
          parentGridaId: string,
          nodeTypeName: string
        ): string[] {
          if (!node.fillGeometry?.length) return [];

          const childIds: string[] = [];

          node.fillGeometry.forEach((geometry, idx) => {
            const childId = `${parentGridaId}_fill_${idx}`;
            const name = `${node.name || nodeTypeName} Fill ${idx + 1}`;

            const childNode = createVectorNodeFromPath(
              geometry.path ?? "",
              geometry,
              node,
              childId,
              name,
              { useFill: true, useStroke: false }
            );

            if (childNode) {
              nodes[childId] = childNode;
              childIds.push(childId);
            }
          });

          return childIds;
        }

        /**
         * Processes stroke geometries from a node with HasGeometryTrait.
         * Returns array of child node IDs that were successfully created.
         */
        function processStrokeGeometries(
          node: InputNode & figrest.HasGeometryTrait,
          parentGridaId: string,
          nodeTypeName: string
        ): string[] {
          if (!node.strokeGeometry?.length) return [];

          const childIds: string[] = [];

          console.log("node.strokeGeometry", node.strokeGeometry);
          node.strokeGeometry.forEach((geometry, idx) => {
            const childId = `${parentGridaId}_stroke_${idx}`;
            const name = `${node.name || nodeTypeName} Stroke ${idx + 1}`;

            const childNode = createVectorNodeFromPath(
              geometry.path ?? "",
              geometry,
              node,
              childId,
              name,
              { useFill: false, useStroke: false, strokeAsFill: true }
            );

            if (childNode) {
              nodes[childId] = childNode;
              childIds.push(childId);
            }
          });

          return childIds;
        }

        /**
         * Processes nodes with HasGeometryTrait from REST API (with geometry=paths parameter).
         * Converts fill/stroke geometries to child VectorNodes under a GroupNode.
         * Applies to VECTOR, STAR, REGULAR_POLYGON, and other shape nodes.
         */
        function processNodeWithGeometryTrait(
          node: InputNode & figrest.HasGeometryTrait,
          groupNode: grida.program.nodes.GroupNode
        ): void {
          const nodeTypeName =
            "type" in node ? node.type.replace("_", " ") : "Shape";

          const fillChildIds = processFillGeometries(
            node,
            groupNode.id,
            nodeTypeName
          );
          const strokeChildIds = processStrokeGeometries(
            node,
            groupNode.id,
            nodeTypeName
          );

          const allChildIds = [...fillChildIds, ...strokeChildIds];

          if (allChildIds.length > 0) {
            graph[groupNode.id] = allChildIds;
          }
        }

        function attachGeometryChildrenIfPresent(
          currentNode: InputNode,
          processedNode: grida.program.nodes.Node
        ): void {
          if (processedNode.type !== "group") return;
          if (!hasGeometryTrait(currentNode)) return;

          const hasAnyGeometry =
            (currentNode.fillGeometry?.length ?? 0) > 0 ||
            (currentNode.strokeGeometry?.length ?? 0) > 0;
          if (!hasAnyGeometry) return;

          processNodeWithGeometryTrait(
            currentNode,
            processedNode as grida.program.nodes.GroupNode
          );
        }

        function processNode(
          currentNode: InputNode,
          parent?: FigmaParentNode
        ): grida.program.nodes.Node | undefined {
          const gridaId = getOrCreateGridaId(currentNode.id);

          const processedNode = node_without_children(
            currentNode,
            gridaId,
            images,
            parent,
            context,
            imageRefsUsed
          );

          if (!processedNode) {
            return undefined;
          }

          // Add the node to the flat structure
          nodes[processedNode.id] = processedNode;

          attachGeometryChildrenIfPresent(currentNode, processedNode);

          // If the node has children, process them recursively
          if ("children" in currentNode && currentNode.children?.length) {
            graph[processedNode.id] = currentNode.children
              .map((c) => {
                return processNode(c, currentNode as FigmaParentNode);
              }) // Process each child
              .filter((child) => child !== undefined) // Remove undefined nodes
              .map((child) => child!.id); // Map to IDs
          }

          return processedNode;
        }

        const rootNode = processNode(node) as grida.program.nodes.ContainerNode;
        // Keep absolute positioning from Figma (all Figma nodes are absolute by default)
        // rootNode.layout_positioning = "relative";
        // rootNode.layout_inset_left = 0;
        // rootNode.layout_inset_top = 0;

        if (!rootNode) {
          throw new Error("Failed to process root node");
        }

        // Generate a new scene ID
        const sceneId = generateId();

        const packed: grida.program.document.IPackedSceneDocument = {
          nodes,
          links: graph,
          scene: {
            type: "scene",
            id: sceneId,
            name: rootNode.name,
            children_refs: [rootNode.id],
            guides: [],
            edges: [],
            constraints: {
              children: "multiple",
            },
          },
          // TODO:
          bitmaps: {},
          images: {},
          properties: {},
        };

        return {
          document: packed,
          imageRefsUsed: Array.from(imageRefsUsed),
        };
      }

      /**
       * Creates a Node data from figma input, while ignoring the figma's children.
       *
       * It still follows the node structure and returns with empty array `{ children: [] }` if the node requires children property.
       *
       * @param node
       * @param gridaId The generated Grida ID for this node (not the Figma ID)
       * @param images
       * @param parent
       * @param context
       * @param imageRefsUsed - Mutable set to collect image refs that need registration
       * @returns
       */
      function node_without_children(
        node: InputNode,
        gridaId: string,
        images: { [key: string]: string },
        parent: FigmaParentNode | undefined,
        context: FactoryContext,
        imageRefsUsed: Set<string>
      ): grida.program.nodes.Node | undefined {
        switch (node.type) {
          case "SECTION": {
            return {
              id: gridaId,
              ...base_node_trait({
                name: node.name,
                visible: node.visible,
                locked: node.locked,
                rotation: node.rotation,
                opacity: 1,
                blendMode: "PASS_THROUGH",
              }),
              ...positioning_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...style_trait({}),
              ...corner_radius_trait({ cornerRadius: 0 }),
              ...container_layout_trait({}, false),
              type: "container",
              clips_content: false,
            } satisfies grida.program.nodes.ContainerNode;
          }
          //
          case "COMPONENT":
          case "INSTANCE":
          case "FRAME":
          // Fallback: treat COMPONENT_SET as FRAME for rendering. Grida does not yet
          // support component semantics; proper variant/swap support to be added later.
          case "COMPONENT_SET": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...style_trait({
                overflow: node.clipsContent ? "clip" : undefined,
              }),
              ...corner_radius_trait(node),
              ...container_layout_trait(node, true),
              ...effects_trait(node.effects),
              type: "container",
              // In Figma, FRAME/COMPONENT/INSTANCE clip by default unless explicitly disabled
              // So undefined means "use default" which is "clipping enabled" (true)
              clips_content: node.clipsContent !== false,
            } satisfies grida.program.nodes.ContainerNode;
          }
          case "GROUP": {
            // Note:
            // Group is a transparent container without layout, fills, or strokes.
            // Children of group has constraints relative to the parent of the group.
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              type: "group",
            } satisfies grida.program.nodes.GroupNode;
          }
          case "TEXT": {
            const figma_text_resizing_model = node.style.textAutoResize;
            const figma_constraints_horizontal = node.constraints?.horizontal;
            const figma_constraints_vertical = node.constraints?.vertical;

            const fixedwidth = node.size!.x;
            const fixedheight = node.size!.y;

            const fixedleft = node.relativeTransform![0][2];
            const fixedtop = node.relativeTransform![1][2];
            const fixedright = parent?.size
              ? parent.size.x - fixedleft - fixedwidth
              : undefined;
            const fixedbottom = parent?.size
              ? parent.size.y - fixedtop - fixedheight
              : undefined;

            const constraints = {
              left:
                figma_constraints_horizontal !== "RIGHT"
                  ? fixedleft
                  : undefined,
              right:
                figma_constraints_horizontal !== "LEFT"
                  ? fixedright
                  : undefined,
              top:
                figma_constraints_vertical !== "BOTTOM" ? fixedtop : undefined,
              bottom:
                figma_constraints_vertical !== "TOP" ? fixedbottom : undefined,
            };

            return {
              id: gridaId,
              ...base_node_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...text_stroke_trait(node, context, imageRefsUsed),
              ...style_trait({}),
              ...effects_trait(node.effects),
              type: "tspan",
              text: node.characters,
              layout_positioning: "absolute",
              layout_inset_left: constraints.left,
              layout_inset_top: constraints.top,
              layout_inset_right: constraints.right,
              layout_inset_bottom: constraints.bottom,
              layout_target_width:
                figma_text_resizing_model === "WIDTH_AND_HEIGHT"
                  ? "auto"
                  : fixedwidth,
              layout_target_height:
                figma_text_resizing_model === "WIDTH_AND_HEIGHT" ||
                figma_text_resizing_model === "HEIGHT"
                  ? "auto"
                  : fixedheight,
              text_align: node.style.textAlignHorizontal
                ? (map.textAlignMap[node.style.textAlignHorizontal] ?? "left")
                : "left",
              text_align_vertical: node.style.textAlignVertical
                ? map.textAlignVerticalMap[node.style.textAlignVertical]
                : "top",
              text_decoration_line: node.style.textDecoration
                ? (map.textDecorationMap[node.style.textDecoration] ?? "none")
                : "none",
              line_height: node.style.lineHeightPercentFontSize
                ? node.style.lineHeightPercentFontSize / 100
                : 1.2,
              letter_spacing: node.style.letterSpacing,
              font_size: node.style.fontSize ?? 0,
              font_family: node.style.fontFamily,
              font_weight:
                (node.style.fontWeight as cg.NFontWeight) ?? (400 as const),
              font_kerning: true,
            };
          }
          case "RECTANGLE": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...corner_radius_trait(node),
              ...effects_trait(node.effects),
              type: "rectangle",
            } satisfies grida.program.nodes.RectangleNode;
          }
          case "ELLIPSE": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...arc_data_trait(node),
              ...effects_trait(node.effects),
              type: "ellipse",
            } satisfies grida.program.nodes.EllipseNode;
          }
          case "BOOLEAN_OPERATION": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...effects_trait(node.effects),
              type: "boolean",
              op: mapBooleanOperation(node.booleanOperation),
            } satisfies grida.program.nodes.BooleanPathOperationNode;
          }
          case "LINE": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...stroke_trait(node, context, imageRefsUsed),
              ...effects_trait(node.effects),
              type: "line",
              layout_positioning: "absolute",
              layout_inset_left: node.relativeTransform![0][2],
              layout_inset_top: node.relativeTransform![1][2],
              layout_target_width: node.size!.x,
              layout_target_height: 0,
            } satisfies grida.program.nodes.LineNode;
          }
          case "SLICE": {
            return;
          }
          case "REGULAR_POLYGON":
          case "STAR":
          case "VECTOR": {
            // When REST API returns prerelease vectorNetwork, use it for a single VectorNode; otherwise GroupNode + fill/stroke children.
            const useRestVectorNetwork =
              context.disable_volatile_apis !== true &&
              "vectorNetwork" in node &&
              node.vectorNetwork != null;
            if (useRestVectorNetwork) {
              try {
                const ir = restful.map.normalizeRestVectorNetworkToIR(
                  node.vectorNetwork as __ir.VectorNetwork_restapi_volatile20260217
                );
                if (ir) {
                  const gridaVectorNetwork: vn.VectorNetwork = {
                    vertices: ir.vertices.map((v) => [v.x, v.y]),
                    segments: ir.segments.map((seg) => ({
                      a: seg.start.vertex,
                      b: seg.end.vertex,
                      ta: [seg.start.dx, seg.start.dy],
                      tb: [seg.end.dx, seg.end.dy],
                    })),
                  };
                  return {
                    id: gridaId,
                    ...base_node_trait(node),
                    ...positioning_trait(node),
                    ...fills_trait(node.fills, context, imageRefsUsed),
                    ...stroke_trait(node, context, imageRefsUsed),
                    ...corner_radius_trait(node),
                    ...effects_trait(node.effects),
                    type: "vector",
                    vector_network: gridaVectorNetwork,
                  } satisfies grida.program.nodes.VectorNode;
                }
              } catch {
                // Fall through to GroupNode + fillGeometry/strokeGeometry path
              }
            }
            // Nodes with HasGeometryTrait (REST API with geometry=paths) without vectorNetwork
            // or with invalid vectorNetwork: create GroupNode with child VectorNodes in processNode.
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              type: "group",
            } satisfies grida.program.nodes.GroupNode;
          }

          // IR nodes - extended types with additional data
          case "X_VECTOR": {
            // Convert Figma VectorNetwork to Grida vn.VectorNetwork format
            const gridaVectorNetwork: vn.VectorNetwork = {
              vertices: node.vectorNetwork.vertices.map((v) => [v.x, v.y]),
              segments: node.vectorNetwork.segments.map((seg) => ({
                a: seg.start.vertex,
                b: seg.end.vertex,
                ta: [seg.start.dx, seg.start.dy],
                tb: [seg.end.dx, seg.end.dy],
              })),
            };

            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...corner_radius_trait(node),
              ...effects_trait(node.effects),
              type: "vector",
              vector_network: gridaVectorNetwork,
            } satisfies grida.program.nodes.VectorNode;
          }
          case "X_STAR": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...effects_trait(node.effects),
              type: "star",
              point_count: node.pointCount,
              inner_radius: node.innerRadius,
            } satisfies grida.program.nodes.RegularStarPolygonNode;
          }
          case "X_REGULAR_POLYGON": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...effects_trait(node.effects),
              type: "polygon",
              point_count: node.pointCount,
            } satisfies grida.program.nodes.RegularPolygonNode;
          }

          // figjam
          case "LINK_UNFURL":
          case "EMBED":
          case "CONNECTOR":
          case "STICKY":
          case "TABLE":
          case "SHAPE_WITH_TEXT":
          case "TABLE_CELL":
          case "WASHI_TAPE":
          case "WIDGET":
            throw new Error(`Unknown node type: ${node.type}`);
        }
      }
    }

    //
  }

  /**
   * Namespace for converting Kiwi format (from .fig files and clipboard) to Figma REST API types
   */
  export namespace kiwi {
    /**
     * Convert Kiwi GUID to string ID
     * Format: `sessionID:localID`
     */
    export function guid(kiwi: { sessionID: number; localID: number }): string {
      return `${kiwi.sessionID}:${kiwi.localID}`;
    }

    export namespace map {
      /**
       * Convert Kiwi figrest.BlendMode to Figma REST API BlendMode
       * Defaults to "PASS_THROUGH"
       */
      export function blendMode(
        kiwi: figkiwi.BlendMode | undefined
      ): figrest.BlendMode {
        return (kiwi ?? "PASS_THROUGH") as figrest.BlendMode; // They use the same names
      }

      /**
       * Convert Kiwi StrokeAlign to Figma REST API StrokeAlign
       */
      export function strokeAlign(
        kiwi: figkiwi.StrokeAlign
      ): "INSIDE" | "OUTSIDE" | "CENTER" {
        return kiwi as "INSIDE" | "OUTSIDE" | "CENTER";
      }

      /**
       * Convert Kiwi StrokeCap to Figma REST API StrokeCap
       */
      export function strokeCap(
        kiwi: figkiwi.StrokeCap
      ): figrest.LineNode["strokeCap"] {
        // Kiwi has more cap types than REST API, map what we can
        switch (kiwi) {
          case "NONE":
            return "NONE";
          case "ROUND":
            return "ROUND";
          case "SQUARE":
            return "SQUARE";
          case "ARROW_LINES":
            return "LINE_ARROW";
          case "ARROW_EQUILATERAL":
            return "TRIANGLE_ARROW";
          case "DIAMOND_FILLED":
            return "DIAMOND_FILLED";
          case "TRIANGLE_FILLED":
            return "TRIANGLE_FILLED";
          case "CIRCLE_FILLED":
            return "CIRCLE_FILLED";
          default:
            return "NONE";
        }
      }

      /**
       * Convert Kiwi StrokeJoin to Figma REST API StrokeJoin
       */
      export function strokeJoin(
        kiwi: figkiwi.StrokeJoin
      ): "MITER" | "BEVEL" | "ROUND" {
        return kiwi as "MITER" | "BEVEL" | "ROUND";
      }
    }

    export namespace factory {
      /**
       * Convert Kiwi Color to Figma REST API Color
       */
      function color(kiwi: figkiwi.Color): {
        r: number;
        g: number;
        b: number;
        a: number;
      } {
        return {
          r: kiwi.r,
          g: kiwi.g,
          b: kiwi.b,
          a: kiwi.a,
        };
      }

      /**
       * Convert Kiwi Vector to Figma REST API Vector
       */
      function vector(kiwi: figkiwi.Vector): { x: number; y: number } {
        return {
          x: kiwi.x,
          y: kiwi.y,
        };
      }

      /**
       * Convert Kiwi Matrix to Figma REST API Transform
       */
      function transform(
        kiwi: figkiwi.Matrix
      ): [[number, number, number], [number, number, number]] {
        return [
          [kiwi.m00, kiwi.m01, kiwi.m02],
          [kiwi.m10, kiwi.m11, kiwi.m12],
        ];
      }

      /**
       * Extract rotation angle in degrees from a 2x3 transform matrix
       * For a rotation matrix: [[cos(θ), -sin(θ), tx], [sin(θ), cos(θ), ty]]
       * We can extract θ using atan2(m10, m00)
       */
      function extractRotationFromMatrix(matrix: figkiwi.Matrix): number {
        const radians = Math.atan2(matrix.m10, matrix.m00);
        return (radians * 180) / Math.PI;
      }

      /**
       * Convert Kiwi GUID to string ID
       * @deprecated Use iofigma.kiwi.guid() instead
       */
      const guid = iofigma.kiwi.guid;

      /**
       * Calculate absolute bounding box from transform and size
       */
      function absoluteBounds(
        relativeTransform: [[number, number, number], [number, number, number]],
        size: { x: number; y: number }
      ): { x: number; y: number; width: number; height: number } {
        const x = relativeTransform[0][2];
        const y = relativeTransform[1][2];
        return {
          x,
          y,
          width: size.x,
          height: size.y,
        };
      }

      /**
       * Convert Kiwi figrest.Paint to Figma REST API Paint
       */
      function paint(kiwi: figkiwi.Paint): figrest.Paint | undefined {
        if (!kiwi.type) return undefined;

        switch (kiwi.type) {
          case "SOLID": {
            return {
              type: "SOLID",
              visible: kiwi.visible ?? true,
              opacity: kiwi.opacity ?? 1,
              blendMode: map.blendMode(kiwi.blendMode),
              color: kiwi.color
                ? color(kiwi.color)
                : { r: 0, g: 0, b: 0, a: 1 }, // Default to black if missing
            } satisfies figrest.SolidPaint;
          }
          case "GRADIENT_LINEAR":
          case "GRADIENT_RADIAL":
          case "GRADIENT_ANGULAR":
          case "GRADIENT_DIAMOND": {
            const gradientStops =
              kiwi.stops?.map((stop) => ({
                color: color(stop.color),
                position: stop.position,
              })) ?? [];

            const gradientHandlePositions = kiwi.transform
              ? [
                  { x: kiwi.transform.m02, y: kiwi.transform.m12 },
                  {
                    x: kiwi.transform.m00 + kiwi.transform.m02,
                    y: kiwi.transform.m10 + kiwi.transform.m12,
                  },
                  {
                    x: kiwi.transform.m01 + kiwi.transform.m02,
                    y: kiwi.transform.m11 + kiwi.transform.m12,
                  },
                ]
              : [
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                  { x: 0, y: 1 },
                ];

            return {
              type: kiwi.type,
              visible: kiwi.visible ?? true,
              opacity: kiwi.opacity ?? 1,
              blendMode: kiwi.blendMode
                ? map.blendMode(kiwi.blendMode)
                : "NORMAL",
              gradientStops,
              gradientHandlePositions,
            } as figrest.GradientPaint;
          }
          case "IMAGE": {
            // Return image paint - REST API → Grida layer will handle missing images
            const scaleMode = kiwi.imageScaleMode || "FILL";
            // Convert Uint8Array hash to hex string for imageRef
            const imageRef = kiwi.image?.hash
              ? Array.from(kiwi.image.hash)
                  .map((b) => b.toString(16).padStart(2, "0"))
                  .join("")
              : "";
            return {
              type: "IMAGE",
              visible: kiwi.visible ?? true,
              opacity: kiwi.opacity ?? 1,
              blendMode: kiwi.blendMode
                ? map.blendMode(kiwi.blendMode)
                : "NORMAL",
              scaleMode: scaleMode as "FILL" | "FIT" | "TILE" | "STRETCH",
              imageRef,
              rotation: kiwi.rotation,
              scalingFactor: kiwi.scale,
            } satisfies figrest.ImagePaint;
          }
          default:
            return undefined;
        }
      }

      /**
       * Convert array of Kiwi Paints to Figma REST API Paints
       */
      function paints(kiwiPaints?: figkiwi.Paint[]): figrest.Paint[] {
        if (!kiwiPaints) return [];
        return kiwiPaints
          .map(paint)
          .filter((p): p is figrest.Paint => p !== undefined);
      }

      /**
       * Convert Kiwi Effects to Figma REST API Effects
       */
      function effects(kiwiEffects?: figkiwi.Effect[]): figrest.Effect[] {
        if (!kiwiEffects) return [];

        return kiwiEffects
          .map((effect): figrest.Effect | undefined => {
            if (!effect.type) return undefined;

            switch (effect.type) {
              case "DROP_SHADOW":
                return {
                  type: "DROP_SHADOW",
                  visible: effect.visible ?? true,
                  color: effect.color
                    ? color(effect.color)
                    : { r: 0, g: 0, b: 0, a: 0.5 },
                  blendMode: effect.blendMode
                    ? map.blendMode(effect.blendMode)
                    : "NORMAL",
                  offset: effect.offset
                    ? vector(effect.offset)
                    : { x: 0, y: 0 },
                  radius: effect.radius ?? 0,
                  spread: effect.spread ?? 0,
                  showShadowBehindNode: effect.showShadowBehindNode ?? false,
                } satisfies figrest.DropShadowEffect;

              case "INNER_SHADOW":
                return {
                  type: "INNER_SHADOW",
                  visible: effect.visible ?? true,
                  color: effect.color
                    ? color(effect.color)
                    : { r: 0, g: 0, b: 0, a: 0.5 },
                  blendMode: effect.blendMode
                    ? map.blendMode(effect.blendMode)
                    : "NORMAL",
                  offset: effect.offset
                    ? vector(effect.offset)
                    : { x: 0, y: 0 },
                  radius: effect.radius ?? 0,
                  spread: effect.spread ?? 0,
                } satisfies figrest.InnerShadowEffect;

              case "FOREGROUND_BLUR":
                return {
                  type: "LAYER_BLUR",
                  visible: effect.visible ?? true,
                  radius: effect.radius ?? 0,
                } satisfies figrest.BlurEffect;

              case "BACKGROUND_BLUR":
                return {
                  type: "BACKGROUND_BLUR",
                  visible: effect.visible ?? true,
                  radius: effect.radius ?? 0,
                } satisfies figrest.BlurEffect;

              default:
                return undefined;
            }
          })
          .filter((e): e is figrest.Effect => e !== undefined);
      }

      /**
       * Kiwi → REST API Trait functions
       * Each trait mirrors Figma REST API spec traits
       */

      /**
       * IsLayerTrait - Base properties for all layer nodes
       */
      function kiwi_is_layer_trait<T extends string>(
        nc: figkiwi.NodeChange,
        type: T
      ) {
        return {
          id: guid(nc.guid!),
          name: nc.name!,
          type,
          visible: nc.visible ?? true,
          locked: nc.locked ?? false,
          scrollBehavior: "SCROLLS" as const,
          rotation: nc.transform ? extractRotationFromMatrix(nc.transform) : 0,
        };
      }

      /**
       * HasBlendModeAndOpacityTrait
       */
      function kiwi_blend_opacity_trait(nc: figkiwi.NodeChange) {
        return {
          opacity: nc.opacity ?? 1,
          blendMode: map.blendMode(nc.blendMode),
        };
      }

      /**
       * HasLayoutTrait - Size, transform, and bounds
       */
      function kiwi_layout_trait(nc: figkiwi.NodeChange) {
        const relTrans = nc.transform
          ? transform(nc.transform)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ];
        const sz = nc.size ? vector(nc.size) : { x: 0, y: 0 };
        const bounds = absoluteBounds(
          relTrans as [[number, number, number], [number, number, number]],
          sz
        );
        const preserveRatio =
          nc.proportionsConstrained === true ? true : undefined;
        const targetAspectRatio = nc.targetAspectRatio?.value
          ? vector(nc.targetAspectRatio.value)
          : undefined;

        return {
          size: sz,
          relativeTransform: relTrans,
          absoluteBoundingBox: bounds,
          absoluteRenderBounds: bounds,
          preserveRatio,
          targetAspectRatio,
        } satisfies __ir.HasLayoutTraitIR;
      }

      /**
       * HasGeometryTrait - Fills and strokes (MinimalFillsTrait + MinimalStrokesTrait)
       */
      function kiwi_geometry_trait(nc: figkiwi.NodeChange) {
        return {
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "INSIDE",
          strokeCap: nc.strokeCap ? map.strokeCap(nc.strokeCap) : "NONE",
          strokeJoin: nc.strokeJoin ? map.strokeJoin(nc.strokeJoin) : "MITER",
          strokeMiterAngle: nc.miterLimit,
        };
      }

      /**
       * CornerTrait - Corner radius properties
       */
      function kiwi_corner_trait(nc: figkiwi.NodeChange) {
        return {
          cornerRadius: nc.cornerRadius ?? 0,
          cornerSmoothing: nc.cornerSmoothing,
          rectangleCornerRadii: nc.rectangleCornerRadiiIndependent
            ? [
                nc.rectangleTopLeftCornerRadius ?? 0,
                nc.rectangleTopRightCornerRadius ?? 0,
                nc.rectangleBottomRightCornerRadius ?? 0,
                nc.rectangleBottomLeftCornerRadius ?? 0,
              ]
            : undefined,
        };
      }

      /**
       * HasEffectsTrait
       */
      function kiwi_effects_trait(nc: figkiwi.NodeChange) {
        return {
          effects: effects(nc.effects),
        };
      }

      /**
       * HasExportSettingsTrait
       * Maps Kiwi exportSettings → REST. Skips MP4 (refig unsupported).
       */
      function kiwi_has_export_settings_trait(nc: figkiwi.NodeChange) {
        const settings = nc.exportSettings;
        if (!settings?.length) return {};
        const FMT = ["PNG", "JPG", "SVG", "PDF"] as const;
        const FMT_STR: Record<string, (typeof FMT)[number] | null> = {
          PNG: "PNG",
          JPEG: "JPG",
          JPG: "JPG",
          SVG: "SVG",
          PDF: "PDF",
        };
        const CSTR = ["SCALE", "WIDTH", "HEIGHT"] as const;
        const CSTR_STR: Record<string, (typeof CSTR)[number]> = {
          CONTENT_SCALE: "SCALE",
          CONTENT_WIDTH: "WIDTH",
          CONTENT_HEIGHT: "HEIGHT",
        };
        const fmt = (t: string | number | undefined) =>
          typeof t === "string"
            ? (FMT_STR[t] ?? null)
            : typeof t === "number" && t < 4
              ? FMT[t]
              : null;
        const cstr = (t: string | number | undefined) =>
          typeof t === "string"
            ? (CSTR_STR[t] ?? "SCALE")
            : typeof t === "number" && t < 3
              ? CSTR[t]
              : "SCALE";

        const exportSettings = settings
          .map((s) => {
            const f = fmt(s.imageType);
            if (!f) return null;
            const c = s.constraint;
            return {
              format: f,
              suffix: s.suffix ?? "",
              constraint: { type: cstr(c?.type), value: c?.value ?? 1 },
            };
          })
          .filter((x): x is figrest.ExportSetting => x !== null);
        return exportSettings.length ? { exportSettings } : {};
      }

      /**
       * HasChildrenTrait
       */
      function kiwi_children_trait() {
        return {
          children: [] as figrest.SubcanvasNode[],
        };
      }

      /**
       * HasFramePropertiesTrait - Clips content
       * Maps frameMaskDisabled to clipsContent.
       *
       * Mapping (CORRECTED based on fixture analysis):
       * - frameMaskDisabled: true → clipsContent: false (mask disabled = clipping disabled)
       * - frameMaskDisabled: false → clipsContent: true (mask enabled = clipping enabled)
       * - frameMaskDisabled: undefined → clipsContent: true (default, clipping enabled - Figma frames clip by default)
       *
       * Note: This is separate from GROUP detection. GROUPs are handled separately
       * in the frame() function and always have clipsContent: false.
       */
      function kiwi_frame_clip_trait(nc: figkiwi.NodeChange) {
        // Map frameMaskDisabled to clipsContent
        // In Figma, frames clip by default unless explicitly disabled
        // frameMaskDisabled: true means clipping is DISABLED
        // frameMaskDisabled: false means clipping is ENABLED
        // undefined means "use default" which is "clipping enabled" (true)
        const clipsContent = nc.frameMaskDisabled !== true;
        return { clipsContent };
      }

      /**
       * Arc data for ellipse nodes
       */
      function kiwi_arc_data_trait(nc: figkiwi.NodeChange) {
        return {
          arcData: nc.arcData
            ? {
                startingAngle: nc.arcData.startingAngle ?? 0,
                endingAngle: nc.arcData.endingAngle ?? 2 * Math.PI,
                innerRadius: nc.arcData.innerRadius ?? 0,
              }
            : {
                startingAngle: 0,
                endingAngle: 2 * Math.PI,
                innerRadius: 0,
              },
        };
      }

      /**
       * TypePropertiesTrait - Text-specific properties
       */
      function kiwi_text_style_trait(nc: figkiwi.NodeChange) {
        const characters = nc.textData?.characters ?? "";
        return {
          characters,
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "INSIDE",
          style: {
            fontFamily: nc.fontName?.family ?? "Inter",
            fontPostScriptName: nc.fontName?.postscript,
            fontWeight: 400,
            fontSize: nc.fontSize ?? 12,
            textAlignHorizontal: nc.textAlignHorizontal ?? "LEFT",
            textAlignVertical: nc.textAlignVertical ?? "TOP",
            letterSpacing:
              nc.letterSpacing?.units === "PERCENT"
                ? nc.letterSpacing.value / 100
                : nc.letterSpacing?.units === "PIXELS"
                  ? nc.letterSpacing.value
                  : (nc.letterSpacing?.value ?? 0),
            lineHeightPx:
              nc.lineHeight?.units === "PIXELS"
                ? nc.lineHeight.value
                : undefined,
            lineHeightPercent:
              nc.lineHeight?.units === "PERCENT"
                ? nc.lineHeight.value
                : undefined,
            lineHeightPercentFontSize:
              nc.lineHeight?.units === "PERCENT" ? nc.lineHeight.value : 100,
            textAutoResize: nc.textAutoResize ?? "WIDTH_AND_HEIGHT",
            textCase:
              nc.textCase === "ORIGINAL"
                ? undefined
                : (nc.textCase ?? undefined),
            textDecoration: nc.textDecoration ?? "NONE",
          },
          characterStyleOverrides: [],
          styleOverrideTable: {},
          lineTypes: [],
          lineIndentations: [],
        };
      }

      /**
       * Convert NodeChange to RECTANGLE node
       */
      function rectangle(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "RECTANGLE"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          ...kiwi_geometry_trait(nc),
          ...kiwi_corner_trait(nc),
          ...kiwi_effects_trait(nc),
        } satisfies figrest.RectangleNode;
      }

      /**
       * Convert NodeChange to ELLIPSE node
       */
      function ellipse(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "ELLIPSE"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          ...kiwi_geometry_trait(nc),
          ...kiwi_arc_data_trait(nc),
          ...kiwi_effects_trait(nc),
        } satisfies figrest.EllipseNode;
      }

      /**
       * Convert NodeChange to LINE node
       */
      function line(nc: figkiwi.NodeChange): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "LINE"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          fills: [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "CENTER",
          strokeCap: nc.strokeCap ? map.strokeCap(nc.strokeCap) : "NONE",
          strokeJoin: nc.strokeJoin ? map.strokeJoin(nc.strokeJoin) : "MITER",
          strokeMiterAngle: nc.miterLimit,
          ...kiwi_effects_trait(nc),
        } satisfies figrest.LineNode;
      }

      /**
       * Convert NodeChange to TEXT node
       */
      function text(nc: figkiwi.NodeChange): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "TEXT"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          ...kiwi_text_style_trait(nc),
          ...kiwi_effects_trait(nc),
        } satisfies figrest.TextNode;
      }

      /**
       * Detect if a FRAME node is actually a GROUP-originated FRAME
       *
       * Figma converts GROUP nodes to FRAME nodes in both clipboard and .fig files.
       * We can detect GROUP-originated FRAMEs using:
       * - frameMaskDisabled === false (note: real FRAMEs can have either true or false, so this alone is not sufficient)
       * - resizeToFit === true (real FRAMEs typically have undefined)
       * - No paints: fillPaints, strokePaints, and backgroundPaints are all empty/undefined (GROUPs never have paints)
       *   (GROUPs don't have fills or strokes, so this is an additional safety check)
       *
       * See: https://grida.co/docs/wg/feat-fig/glossary/fig.kiwi.md for detailed documentation
       */
      function isGroupOriginatedFrame(nc: figkiwi.NodeChange): boolean {
        if (nc.type !== "FRAME") {
          return false;
        }

        // Check primary indicators
        if (nc.frameMaskDisabled !== false || nc.resizeToFit !== true) {
          return false;
        }

        // Additional safety check: GROUPs have no paints
        const hasNoFills = !nc.fillPaints || nc.fillPaints.length === 0;
        const hasNoStrokes = !nc.strokePaints || nc.strokePaints.length === 0;
        const hasNoBackgroundPaints =
          !nc.backgroundPaints || nc.backgroundPaints.length === 0;

        return hasNoFills && hasNoStrokes && hasNoBackgroundPaints;
      }

      /**
       * Convert NodeChange to FRAME node
       *
       * Note: If the FRAME is detected as GROUP-originated (via frameMaskDisabled and resizeToFit),
       * it will be converted to GroupNode instead of FrameNode.
       */
      function frame(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        // Check if this FRAME is actually a GROUP-originated FRAME
        if (isGroupOriginatedFrame(nc)) {
          // Convert to GroupNode instead of FrameNode
          return {
            ...kiwi_is_layer_trait(nc, "GROUP"),
            ...kiwi_blend_opacity_trait(nc),
            ...kiwi_layout_trait(nc),
            ...kiwi_children_trait(),
            clipsContent: false,
            fills: [],
            ...kiwi_effects_trait(nc),
          } satisfies figrest.GroupNode;
        }

        // Regular FRAME node
        return {
          ...kiwi_is_layer_trait(nc, "FRAME"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          ...kiwi_geometry_trait(nc),
          ...kiwi_corner_trait(nc),
          ...kiwi_frame_clip_trait(nc),
          ...kiwi_children_trait(),
          ...kiwi_effects_trait(nc),
          ...kiwi_has_export_settings_trait(nc),
        } satisfies figrest.FrameNode;
      }

      /**
       * Convert NodeChange to SECTION node
       */
      function section(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "SECTION"),
          ...kiwi_layout_trait(nc),
          ...kiwi_geometry_trait(nc),
          sectionContentsHidden: nc.sectionContentsHidden ?? false,
          ...kiwi_children_trait(),
          ...kiwi_has_export_settings_trait(nc),
        } satisfies figrest.SectionNode;
      }

      /**
       * Convert NodeChange to COMPONENT (SYMBOL in Kiwi) node
       */
      function component(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "COMPONENT"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          ...kiwi_geometry_trait(nc),
          ...kiwi_corner_trait(nc),
          ...kiwi_frame_clip_trait(nc),
          ...kiwi_children_trait(),
          ...kiwi_effects_trait(nc),
          ...kiwi_has_export_settings_trait(nc),
        } satisfies figrest.ComponentNode;
      }

      /**
       * Convert NodeChange to INSTANCE node
       */
      function instance(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        const node = {
          ...kiwi_is_layer_trait(nc, "INSTANCE"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          componentId: nc.symbolData?.symbolID
            ? guid(nc.symbolData.symbolID)
            : "",
          overrides: [],
          ...kiwi_geometry_trait(nc),
          ...kiwi_corner_trait(nc),
          ...kiwi_frame_clip_trait(nc),
          ...kiwi_children_trait(),
          ...kiwi_effects_trait(nc),
        } satisfies figrest.InstanceNode;

        // Minimal override support (fixtures-based):
        // In observed clipboard payloads, overrides are provided as a NodeChange-like patch object
        // under `symbolData.symbolOverrides`, often without guid/type, carrying fillPaints/strokePaints.
        // Treat such entries as root-level overrides for the instance node.
        //
        // TODO(kiwi-overrides): implement full override resolution.
        // - Targeted overrides should be applied to the referenced nested nodes (by guid/path),
        //   not only the instance root.
        // - Handle instance swaps (`overriddenSymbolID` / symbol swap), nested overrides,
        //   and non-paint fields (text styles, effects, layout, etc.).
        const symbolOverrides = nc.symbolData?.symbolOverrides;
        if (Array.isArray(symbolOverrides) && symbolOverrides.length > 0) {
          const o0 = symbolOverrides[0] as figkiwi.NodeChange;

          // Only treat as root patch when the override entry is not targeted.
          // (Targeted overrides should carry guid/type/parentIndex and are applied during flattening.)
          const looksLikeRootPatch =
            o0.guid === undefined &&
            o0.type === undefined &&
            o0.parentIndex?.guid === undefined;

          if (looksLikeRootPatch) {
            // FIXME(kiwi-overrides): this assumes a single root-level patch entry.
            // Real payloads may contain multiple override entries and/or targeted overrides
            // even when the first entry looks like a patch.
            if (o0.fillPaints !== undefined) {
              node.fills = paints(o0.fillPaints);
            }
            if (o0.strokePaints !== undefined) {
              node.strokes = paints(o0.strokePaints);
            }
            if (o0.strokeWeight !== undefined) {
              node.strokeWeight = o0.strokeWeight ?? 0;
            }
            if (o0.strokeAlign !== undefined) {
              node.strokeAlign = map.strokeAlign(o0.strokeAlign);
            }
            if (o0.strokeCap !== undefined) {
              node.strokeCap = map.strokeCap(o0.strokeCap);
            }
            if (o0.strokeJoin !== undefined) {
              node.strokeJoin = map.strokeJoin(o0.strokeJoin);
            }
            if (o0.miterLimit !== undefined) {
              node.strokeMiterAngle = o0.miterLimit;
            }
            if (o0.opacity !== undefined) {
              node.opacity = o0.opacity;
            }
            if (o0.blendMode !== undefined) {
              node.blendMode = map.blendMode(o0.blendMode);
            }
            if (o0.visible !== undefined) {
              node.visible = o0.visible;
            }
          }
        }

        return node;
      }

      /**
       * Convert NodeChange to GROUP node
       */
      function group(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "GROUP"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          ...kiwi_children_trait(),
          clipsContent: false,
          fills: [],
          ...kiwi_effects_trait(nc),
        } satisfies figrest.GroupNode;
      }

      /**
       * Convert Kiwi WindingRule to Figma REST API windingRule
       */
      function windingRule(kiwi: "NONZERO" | "ODD"): "NONZERO" | "EVENODD" {
        return kiwi === "ODD" ? "EVENODD" : "NONZERO";
      }

      /**
       * Convert NodeChange to VECTOR node or X_VECTOR with parsed vector network
       */
      function vectorNode(
        nc: figkiwi.NodeChange,
        message: figkiwi.Message
      ):
        | figrest.SubcanvasNode
        | __ir.VectorNodeWithVectorNetworkDataPresent
        | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        // Try to parse vector network blob if available
        if (nc.vectorData?.vectorNetworkBlob !== undefined) {
          const blobBytes = getBlobBytes(
            nc.vectorData.vectorNetworkBlob,
            message
          );

          if (blobBytes) {
            const parsed = parseVectorNetworkBlob(blobBytes);

            if (parsed) {
              const vectorNetwork = scaleVectorNetworkFromNormalizedSize({
                network: parsed,
                normalizedSize: nc.vectorData?.normalizedSize,
                size: nc.size,
              });

              // Return X_VECTOR with parsed network data
              return {
                ...kiwi_is_layer_trait(nc, "X_VECTOR"),
                ...kiwi_blend_opacity_trait(nc),
                ...kiwi_layout_trait(nc),
                ...kiwi_geometry_trait(nc),
                ...kiwi_effects_trait(nc),
                cornerRadius: nc.cornerRadius ?? 0,
                vectorNetwork,
              } as __ir.VectorNodeWithVectorNetworkDataPresent;
            }
          }
        }

        // Fallback to regular VECTOR with fillGeometry/strokeGeometry
        return {
          ...kiwi_is_layer_trait(nc, "VECTOR"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          ...kiwi_geometry_trait(nc),
          fillGeometry: nc.fillGeometry?.map((path) => ({
            path: "",
            windingRule: path.windingRule
              ? windingRule(path.windingRule)
              : "NONZERO",
          })),
          strokeGeometry: nc.strokeGeometry?.map((path) => ({
            path: "",
            windingRule: path.windingRule
              ? windingRule(path.windingRule)
              : "NONZERO",
          })),
          ...kiwi_effects_trait(nc),
        } satisfies figrest.VectorNode;
      }

      /**
       * Convert NodeChange to X_STAR node with point count and inner radius
       */
      function star(
        nc: figkiwi.NodeChange
      ): __ir.StarNodeWithPointsDataPresent | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "X_STAR"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          ...kiwi_geometry_trait(nc),
          ...kiwi_effects_trait(nc),
          cornerRadius: nc.cornerRadius ?? 0,
          pointCount: nc.count ?? 5,
          innerRadius: nc.starInnerScale ?? 0.5,
        } as __ir.StarNodeWithPointsDataPresent;
      }

      /**
       * Scale a parsed vector network from `vectorData.normalizedSize` space into `NodeChange.size` space.
       *
       * IMPORTANT (vector network coordinate space):
       * In observed real-world `.fig`/clipboard payloads, `vectorNetworkBlob` coordinates are often expressed
       * in the `vectorData.normalizedSize` coordinate space, while the node's rendered size is `NodeChange.size`.
       *
       * Mapping:
       * - sx = size.x / normalizedSize.x
       * - sy = size.y / normalizedSize.y
       *
       * Applies to both:
       * - vertex positions (x, y)
       * - segment tangents (dx, dy)
       */
      function scaleVectorNetworkFromNormalizedSize(params: {
        network: __ir.VectorNetwork;
        normalizedSize: figkiwi.Vector | undefined;
        size: figkiwi.Vector | undefined;
      }): __ir.VectorNetwork {
        const { network, normalizedSize, size } = params;

        const sx =
          normalizedSize &&
          size &&
          normalizedSize.x !== 0 &&
          normalizedSize.x !== undefined
            ? (size.x ?? 0) / normalizedSize.x
            : 1;
        const sy =
          normalizedSize &&
          size &&
          normalizedSize.y !== 0 &&
          normalizedSize.y !== undefined
            ? (size.y ?? 0) / normalizedSize.y
            : 1;

        if (sx === 1 && sy === 1) return network;

        return {
          vertices: network.vertices.map((v) => ({
            ...v,
            x: v.x * sx,
            y: v.y * sy,
          })),
          segments: network.segments.map((s) => ({
            ...s,
            start: {
              ...s.start,
              dx: s.start.dx * sx,
              dy: s.start.dy * sy,
            },
            end: {
              ...s.end,
              dx: s.end.dx * sx,
              dy: s.end.dy * sy,
            },
          })),
          regions: network.regions,
        };
      }

      /**
       * Convert NodeChange to BOOLEAN_OPERATION node
       */
      function booleanOperation(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "BOOLEAN_OPERATION"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          booleanOperation: (nc.booleanOperation ?? "UNION") as
            | "UNION"
            | "INTERSECT"
            | "SUBTRACT"
            | "EXCLUDE",
          ...kiwi_geometry_trait(nc),
          ...kiwi_children_trait(),
          ...kiwi_effects_trait(nc),
        } satisfies figrest.BooleanOperationNode;
      }

      /**
       * Convert NodeChange to X_REGULAR_POLYGON node with point count
       */
      function regularPolygon(
        nc: figkiwi.NodeChange
      ): __ir.RegularPolygonNodeWithPointsDataPresent | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
          ...kiwi_is_layer_trait(nc, "X_REGULAR_POLYGON"),
          ...kiwi_blend_opacity_trait(nc),
          ...kiwi_layout_trait(nc),
          ...kiwi_geometry_trait(nc),
          ...kiwi_effects_trait(nc),
          cornerRadius: nc.cornerRadius ?? 0,
          pointCount: nc.count ?? 3,
        } as __ir.RegularPolygonNodeWithPointsDataPresent;
      }

      /**
       * Main converter: NodeChange → SubcanvasNode or IR node
       *
       * Converts a Kiwi NodeChange to Figma REST API SubcanvasNode or intermediate representation (IR) node.
       * This enables the conversion pipeline: Kiwi → Figma IR → Grida
       *
       * @param nodeChange Kiwi NodeChange from .fig file or clipboard
       * @param message Message containing blobs array (required for vector network parsing)
       * @returns Figma REST API compatible node, IR node, or undefined if unsupported/invalid
       */
      export function node(
        nodeChange: figkiwi.NodeChange,
        message: figkiwi.Message
      ):
        | figrest.SubcanvasNode
        | __ir.VectorNodeWithVectorNetworkDataPresent
        | __ir.StarNodeWithPointsDataPresent
        | __ir.RegularPolygonNodeWithPointsDataPresent
        | undefined {
        if (!nodeChange.type) return undefined;

        switch (nodeChange.type) {
          case "RECTANGLE":
          case "ROUNDED_RECTANGLE":
            return rectangle(nodeChange);
          case "ELLIPSE":
            return ellipse(nodeChange);
          case "LINE":
            return line(nodeChange);
          case "TEXT":
            return text(nodeChange);
          case "FRAME":
            return frame(nodeChange);
          case "SECTION":
            return section(nodeChange);
          case "SYMBOL":
            return component(nodeChange);
          case "INSTANCE":
            return instance(nodeChange);
          case "GROUP":
            return group(nodeChange);
          case "VECTOR":
            return vectorNode(nodeChange, message);
          case "REGULAR_POLYGON":
            return regularPolygon(nodeChange);
          case "STAR":
            return star(nodeChange);
          case "BOOLEAN_OPERATION":
            return booleanOperation(nodeChange);
          default:
            return undefined;
        }
      }
    }

    export type BuildTreeOptions = {
      /**
       * Fallback behavior for environments that do not support a real component/instance system.
       *
       * When enabled, `INSTANCE` nodes are turned into normal container trees by inlining/cloning
       * the referenced `SYMBOL` subtree (resolved via `INSTANCE.symbolData.symbolID -> SYMBOL.guid`).
       *
       * This is primarily needed for clipboard payloads where the `SYMBOL` definition lives under
       * an internal-only canvas (`CANVAS.internalOnly === true`).
       */
      flattenInstances?: boolean;
    };

    type AnyFigmaNode = NonNullable<
      ReturnType<typeof iofigma.kiwi.factory.node>
    >;

    function buildGuidToKiwiMap(
      nodeChanges: figkiwi.NodeChange[]
    ): Map<string, figkiwi.NodeChange> {
      const guidToKiwi = new Map<string, figkiwi.NodeChange>();
      nodeChanges.forEach((nc) => {
        if (nc.guid) guidToKiwi.set(iofigma.kiwi.guid(nc.guid), nc);
      });
      return guidToKiwi;
    }

    function buildFlatFigmaNodes(
      nodeChanges: figkiwi.NodeChange[],
      message: figkiwi.Message
    ): { flat: AnyFigmaNode[]; guidToNode: Map<string, AnyFigmaNode> } {
      const flat = nodeChanges
        .map((nc) => iofigma.kiwi.factory.node(nc, message))
        .filter((node) => node !== undefined) as AnyFigmaNode[];

      const guidToNode = new Map<string, AnyFigmaNode>();
      flat.forEach((node) => guidToNode.set((node as any).id, node));
      return { flat, guidToNode };
    }

    function buildChildrenRelationsInPlace(
      flatNodes: AnyFigmaNode[],
      guidToNode: Map<string, AnyFigmaNode>,
      guidToKiwi: Map<string, figkiwi.NodeChange>
    ) {
      // Attach children arrays by consulting parentIndex in Kiwi
      flatNodes.forEach((node) => {
        const kiwiNode = guidToKiwi.get((node as any).id);
        if (!kiwiNode?.parentIndex?.guid) return;

        const parentGuid = iofigma.kiwi.guid(kiwiNode.parentIndex.guid);
        const parentNode = guidToNode.get(parentGuid);

        if (parentNode && "children" in (parentNode as any)) {
          if (!(parentNode as any).children) (parentNode as any).children = [];
          ((parentNode as any).children as any[]).push(node);
        }
      });

      // Sort children by parentIndex.position (fractional index string), if present
      guidToNode.forEach((parentNode) => {
        if (
          !("children" in (parentNode as any)) ||
          !(parentNode as any).children
        )
          return;

        ((parentNode as any).children as any[]).sort((a, b) => {
          const aKiwi = guidToKiwi.get((a as any).id);
          const bKiwi = guidToKiwi.get((b as any).id);
          const aPos = aKiwi?.parentIndex?.position ?? "";
          const bPos = bKiwi?.parentIndex?.position ?? "";
          return aPos.localeCompare(bPos);
        });
      });
    }

    function inheritContainerPropsFromComponentIfMissing(
      instanceNode: any,
      componentNode: any
    ) {
      // This is a conservative copy: only fill missing/empty fields on the instance.
      if (!instanceNode || !componentNode) return;

      if (
        (instanceNode.fills === undefined || instanceNode.fills.length === 0) &&
        componentNode.fills?.length
      ) {
        instanceNode.fills = componentNode.fills;
      }
      if (
        (instanceNode.strokes === undefined ||
          instanceNode.strokes.length === 0) &&
        componentNode.strokes?.length
      ) {
        instanceNode.strokes = componentNode.strokes;
      }
      if (
        (instanceNode.effects === undefined ||
          instanceNode.effects.length === 0) &&
        componentNode.effects?.length
      ) {
        instanceNode.effects = componentNode.effects;
      }
      if (
        instanceNode.clipsContent === undefined &&
        componentNode.clipsContent !== undefined
      ) {
        instanceNode.clipsContent = componentNode.clipsContent;
      }
      if (
        instanceNode.cornerRadius === undefined &&
        componentNode.cornerRadius !== undefined
      ) {
        instanceNode.cornerRadius = componentNode.cornerRadius;
      }
    }

    function cloneTreeWithNewIdsAndFlattenInstances(params: {
      node: any;
      idPrefix: string;
      guidToNode: Map<string, AnyFigmaNode>;
      options: BuildTreeOptions;
      componentStack: string[];
      idCounter: { n: number };
      symbolOverrideByGuid?: Map<string, figkiwi.NodeChange>;
    }): any {
      const { node, idPrefix, guidToNode, options, componentStack, idCounter } =
        params;
      const symbolOverrideByGuid = params.symbolOverrideByGuid;

      const originalId = (node as any).id;
      const newId = `${idPrefix}::${idCounter.n++}::${originalId}`;

      // Shallow clone
      const cloned: any = { ...(node as any), id: newId };

      // Apply targeted overrides (by guid) to cloned nodes.
      // Note: Rest node ids are guid strings (sessionID:localID).
      const override = symbolOverrideByGuid?.get(originalId);
      if (override) {
        // Minimal: text overrides (characters)
        if (
          cloned.type === "TEXT" &&
          typeof override.textData?.characters === "string"
        ) {
          cloned.characters = override.textData.characters;
        }
        // Optional common fields that are safe to apply in practice:
        if (override.visible !== undefined) cloned.visible = override.visible;
        if (override.opacity !== undefined) cloned.opacity = override.opacity;
        // TODO(kiwi-overrides): apply more targeted overrides when needed.
        // - Paint overrides: requires converting Kiwi Paints (override.fillPaints/strokePaints)
        //   onto REST nodes here (we currently only do root-level paints in instance()).
        // - Text style overrides: font, size, fills, etc.
        // - Layout/geometry overrides, effect overrides, etc.
        // - Instance swaps (`overriddenSymbolID`) and nested instance overrides.
      }

      // Children clone (default: clone existing children)
      if ("children" in cloned && Array.isArray(cloned.children)) {
        cloned.children = cloned.children.map((child: any) =>
          cloneTreeWithNewIdsAndFlattenInstances({
            node: child,
            idPrefix,
            guidToNode,
            options,
            componentStack,
            idCounter,
            symbolOverrideByGuid,
          })
        );
      }

      // Fallback: inline/clone component children for INSTANCE
      if (options.flattenInstances && cloned.type === "INSTANCE") {
        const componentId: string | undefined = cloned.componentId;
        if (componentId) {
          // Cycle guard: INSTANCE -> component -> INSTANCE -> same component...
          if (componentStack.includes(componentId)) {
            return cloned;
          }

          const componentNode: any = guidToNode.get(componentId);
          if (componentNode) {
            inheritContainerPropsFromComponentIfMissing(cloned, componentNode);

            const componentChildren = componentNode.children ?? [];
            const nextStack = [...componentStack, componentId];
            cloned.children = (componentChildren as any[]).map((child) =>
              cloneTreeWithNewIdsAndFlattenInstances({
                node: child,
                idPrefix,
                guidToNode,
                options,
                componentStack: nextStack,
                idCounter,
                symbolOverrideByGuid,
              })
            );
          }
        }
      }

      return cloned;
    }

    function flattenInstancesInPlace(params: {
      rootNodes: AnyFigmaNode[];
      guidToNode: Map<string, AnyFigmaNode>;
      guidToKiwi: Map<string, figkiwi.NodeChange>;
      options: BuildTreeOptions;
    }) {
      const { rootNodes, guidToNode, guidToKiwi, options } = params;
      if (!options.flattenInstances) return;

      const visit = (node: any) => {
        if (!node) return;

        if (node.type === "INSTANCE" && node.componentId) {
          const componentNode: any = guidToNode.get(node.componentId);
          if (componentNode?.children?.length) {
            inheritContainerPropsFromComponentIfMissing(node, componentNode);
            const symbolOverrideByGuid = new Map<string, figkiwi.NodeChange>();
            const kiwiInstance = guidToKiwi.get(node.id);
            const instOverrides = kiwiInstance?.symbolData?.symbolOverrides;
            (instOverrides ?? []).forEach((o) => {
              if (o.guid)
                symbolOverrideByGuid.set(iofigma.kiwi.guid(o.guid), o);
            });

            const idCounter = { n: 0 };
            node.children = (componentNode.children as any[]).map((child) =>
              cloneTreeWithNewIdsAndFlattenInstances({
                node: child,
                idPrefix: node.id,
                guidToNode,
                options,
                componentStack: [node.componentId],
                idCounter,
                symbolOverrideByGuid,
              })
            );
          }
        }

        if (Array.isArray(node.children)) {
          node.children.forEach(visit);
        }
      };

      rootNodes.forEach(visit);
    }

    /**
     * Build a clipboard-friendly root node list (Kiwi NodeChanges → REST nodes with hierarchy).
     *
     * - Builds hierarchy using `parentIndex.guid` and sorts by `parentIndex.position`.
     * - When `options.flattenInstances === true`, `INSTANCE` nodes inline/clone referenced `SYMBOL` subtrees.
     */
    export function buildClipboardRootNodes(params: {
      nodeChanges: figkiwi.NodeChange[];
      message: figkiwi.Message;
      options?: BuildTreeOptions;
    }): AnyFigmaNode[] {
      const {
        nodeChanges,
        message,
        options = { flattenInstances: true },
      } = params;

      const guidToKiwi = buildGuidToKiwiMap(nodeChanges);
      const { flat, guidToNode } = buildFlatFigmaNodes(nodeChanges, message);

      buildChildrenRelationsInPlace(flat, guidToNode, guidToKiwi);

      // In clipboard payloads, component definitions may live under internal-only canvases.
      // We treat those canvases as a repository and exclude their direct children from roots.
      const internalCanvasGuids = new Set<string>();
      nodeChanges.forEach((nc) => {
        if (nc.type === "CANVAS" && nc.internalOnly === true && nc.guid) {
          internalCanvasGuids.add(iofigma.kiwi.guid(nc.guid));
        }
      });

      const rootNodes = flat.filter((node) => {
        const kiwi = guidToKiwi.get((node as any).id);
        if (!kiwi?.parentIndex?.guid) return true;

        const parentGuid = iofigma.kiwi.guid(kiwi.parentIndex.guid);
        const parentKiwi = guidToKiwi.get(parentGuid);

        // Exclude items that are direct children of internal-only canvases
        if (
          parentKiwi?.type === "CANVAS" &&
          internalCanvasGuids.has(parentGuid)
        ) {
          return false;
        }

        return (
          !parentKiwi ||
          parentKiwi.type === "CANVAS" ||
          parentKiwi.type === "DOCUMENT"
        );
      });

      flattenInstancesInPlace({ rootNodes, guidToNode, guidToKiwi, options });
      return rootNodes;
    }

    /**
     * Build a tree for a specific CANVAS node (used for .fig file import).
     *
     * Note: This can also be used for clipboard payloads when you want a specific page.
     */
    function buildCanvasRootNodes(params: {
      canvasGuid: figkiwi.GUID;
      nodeChanges: figkiwi.NodeChange[];
      message: figkiwi.Message;
      options?: BuildTreeOptions;
    }): AnyFigmaNode[] {
      const { canvasGuid, nodeChanges, message, options = {} } = params;

      const canvasGuidStr = iofigma.kiwi.guid(canvasGuid);
      const guidToKiwi = buildGuidToKiwiMap(nodeChanges);
      const { flat, guidToNode } = buildFlatFigmaNodes(nodeChanges, message);

      buildChildrenRelationsInPlace(flat, guidToNode, guidToKiwi);

      const rootNodes = flat.filter((node) => {
        const kiwiNode = guidToKiwi.get((node as any).id);
        if (!kiwiNode?.parentIndex?.guid) return false;
        const parentGuid = iofigma.kiwi.guid(kiwiNode.parentIndex.guid);
        return parentGuid === canvasGuidStr;
      });

      flattenInstancesInPlace({ rootNodes, guidToNode, guidToKiwi, options });
      return rootNodes;
    }

    /**
     * Namespace for .fig file import functionality
     */
    export interface FigFileDocument {
      pages: FigPage[];
      metadata: {
        version: number;
      };
      /** ZIP contents from the .fig archive (for extractImages etc.). */
      zip_files?: { [key: string]: Uint8Array };
    }

    export interface FigPage {
      name: string;
      canvas: figkiwi.NodeChange;
      rootNodes: any[]; // Converted REST API nodes with complete children
      /**
       * Sort key from parentIndex.position (fractional index string)
       * Use this to sort pages to preserve original Figma order.
       * Compare lexicographically: pageA.sortkey.localeCompare(pageB.sortkey)
       * Examples: "!", "Qd&", "QeU", "Qf"
       */
      sortkey: string;
    }

    /**
     * Parse and extract pages from a .fig file
     * @param fileData - The .fig file as Uint8Array
     * @returns Document with pages ready for import
     */
    export function parseFile(
      fileData: Uint8Array,
      options: BuildTreeOptions = {}
    ): FigFileDocument {
      const figData = readFigFile(fileData);
      const pages = extractPages(figData, options);

      return {
        pages,
        metadata: {
          version: figData.header.version,
        },
        zip_files: figData.zip_files,
      };
    }

    /**
     * Extract images from .fig ZIP archive.
     * @param zipFiles - Raw ZIP contents from FigFileDocument.zip_files or ParsedFigmaArchive.zip_files
     * @returns Map of hash (hex string) to image bytes
     */
    export function extractImages(
      zipFiles: { [key: string]: Uint8Array } | undefined
    ): Map<string, Uint8Array> {
      return extractImagesFromFigKiwi(zipFiles);
    }

    /**
     * Extract pages (CANVAS nodes) with their complete hierarchies
     * Skips internal-only canvases (component libraries)
     * Pages include sortkey property from parentIndex.position for sorting
     * Note: CANVAS nodes use parentIndex.position (fractional index strings) for ordering,
     * not sortPosition. These are lexicographically sortable strings like "!", "Qd&", "QeU", etc.
     *
     * To sort pages: pages.sort((a, b) => a.sortkey.localeCompare(b.sortkey))
     */
    function extractPages(
      figData: ParsedFigmaArchive,
      options: BuildTreeOptions
    ): FigPage[] {
      const nodeChanges = figData.message.nodeChanges || [];

      // Find all CANVAS nodes, excluding internal-only ones
      const canvasNodes = nodeChanges.filter(
        (nc) => nc.type === "CANVAS" && !nc.internalOnly
      );

      // Extract pages with sortkey information (no sorting - consumers can sort by sortkey property)
      return canvasNodes.map((canvas) => {
        const rootNodes = buildPageTree(canvas, nodeChanges, figData, options);
        const sortkey = canvas.parentIndex?.position ?? "";

        return {
          name: canvas.name || "Untitled Page",
          canvas,
          rootNodes,
          sortkey, // Fractional index string for lexicographic sorting
        };
      });
    }

    /**
     * Build complete tree for a single page (matches clipboard import logic)
     */
    function buildPageTree(
      canvas: figkiwi.NodeChange,
      allNodeChanges: figkiwi.NodeChange[],
      figData: ParsedFigmaArchive,
      options: BuildTreeOptions
    ): any[] {
      const canvasGuid = canvas.guid;
      if (!canvasGuid) return [];
      return buildCanvasRootNodes({
        canvasGuid,
        nodeChanges: allNodeChanges,
        message: figData.message,
        options,
      });
    }

    /**
     * Convert page to single packed document (bulk insert to avoid reducer nesting).
     * Returns {@link restful.factory.FigmaImportResult} with merged document and imageRefsUsed.
     */
    export function convertPageToScene(
      page: FigPage,
      context: iofigma.restful.factory.FactoryContext
    ): iofigma.restful.factory.FigmaImportResult {
      // IMPORTANT:
      // When converting multiple root nodes, each `restful.factory.document()` call maintains its
      // own local ID mapping. If the caller doesn't provide a `node_id_generator`, the fallback
      // generator inside `document()` can easily collide across calls (same timestamp + reset counter),
      // causing Object.assign merges to overwrite previously converted roots.
      //
      // To avoid dropping roots, ensure we always use a shared node_id_generator across all roots.
      let counter = 0;
      const sharedNodeIdGenerator =
        context.node_id_generator ??
        (() => `figma-import-${Date.now()}-${++counter}`);
      const sharedContext: iofigma.restful.factory.FactoryContext = {
        ...context,
        node_id_generator: sharedNodeIdGenerator,
      };

      const individualResults = page.rootNodes.map((rootNode) =>
        iofigma.restful.factory.document(rootNode, {}, sharedContext)
      );

      if (individualResults.length === 1) return individualResults[0];

      // Merge multiple roots into single document
      const imageRefsUsed = new Set<string>();
      const merged: grida.program.document.IPackedSceneDocument = {
        bitmaps: {},
        images: {},
        nodes: {},
        links: {},
        properties: {},
        scene: {
          type: "scene",
          id: "tmp",
          name: page.name,
          children_refs: [],
          guides: [],
          edges: [],
          constraints: { children: "multiple" },
          // TODO: convert it to our format, number.
          // order: page.sortkey,
        },
      };

      individualResults.forEach((result) => {
        const doc = result.document;
        Object.assign(merged.nodes, doc.nodes);
        Object.assign(merged.links, doc.links);
        Object.assign(merged.images, doc.images);
        Object.assign(merged.bitmaps, doc.bitmaps);
        Object.assign(merged.properties, doc.properties);
        merged.scene.children_refs.push(...doc.scene.children_refs);
        result.imageRefsUsed.forEach((ref: string) => imageRefsUsed.add(ref));
      });

      return {
        document: merged,
        imageRefsUsed: Array.from(imageRefsUsed),
      };
    }

    /**
     * @deprecated Use iofigma.kiwi.parseFile() instead
     * Legacy class-based API for backward compatibility
     */
    export class FigImporter {
      static parseFile(
        fileData: Uint8Array,
        options: BuildTreeOptions = {}
      ): FigFileDocument {
        return parseFile(fileData, options);
      }

      static convertPageToScene(
        page: FigPage,
        context: iofigma.restful.factory.FactoryContext
      ): iofigma.restful.factory.FigmaImportResult {
        return convertPageToScene(page, context);
      }
    }
  }
}
