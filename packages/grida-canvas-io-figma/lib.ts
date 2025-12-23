import cg from "@grida/cg";
import type grida from "@grida/schema";
import vn from "@grida/vn";
import type * as figrest from "@figma/rest-api-spec";
import type * as figkiwi from "./fig-kiwi/schema";
import cmath from "@grida/cmath";
import kolor from "@grida/color";
import {
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
    }

    export namespace factory {
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

      function paint(paint: figrest.Paint): cg.Paint | undefined {
        switch (paint.type) {
          case "SOLID": {
            return toSolidPaint(paint);
          }
          case "GRADIENT_LINEAR":
          case "GRADIENT_RADIAL":
          case "GRADIENT_ANGULAR":
          case "GRADIENT_DIAMOND": {
            return toGradientPaint(paint);
          }
          case "IMAGE":
            // Return image paint with empty src - renderer will use placeholder
            return {
              type: "image",
              src: _GRIDA_SYSTEM_EMBEDDED_CHECKER,
              fit: paint.scaleMode
                ? paint.scaleMode === "FILL"
                  ? "cover"
                  : paint.scaleMode === "FIT"
                    ? "contain"
                    : paint.scaleMode === "TILE"
                      ? "tile"
                      : "fill"
                : "cover",
              transform: paint.imageTransform
                ? [
                    [
                      paint.imageTransform[0][0],
                      paint.imageTransform[0][1],
                      paint.imageTransform[0][2],
                    ],
                    [
                      paint.imageTransform[1][0],
                      paint.imageTransform[1][1],
                      paint.imageTransform[1][2],
                    ],
                  ]
                : cmath.transform.identity,
              filters: paint.filters
                ? {
                    exposure: paint.filters.exposure ?? 0,
                    contrast: paint.filters.contrast ?? 0,
                    saturation: paint.filters.saturation ?? 0,
                    temperature: paint.filters.temperature ?? 0,
                    tint: paint.filters.tint ?? 0,
                    highlights: paint.filters.highlights ?? 0,
                    shadows: paint.filters.shadows ?? 0,
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
              blend_mode: map.blendModeMap[paint.blendMode],
              opacity: paint.opacity ?? 1,
              active: paint.visible ?? true,
            } satisfies cg.ImagePaint;
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
      ) {
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
          position: "absolute" as const,
          left: node.relativeTransform?.[0][2] ?? 0,
          top: node.relativeTransform?.[1][2] ?? 0,
          width: szx,
          height: szy,
          layout_target_aspect_ratio,
        };
      }

      /**
       * Fill properties - IFill
       */
      function fills_trait(fills: figrest.Paint[]) {
        const fills_paints = fills
          .map(paint)
          .filter((p): p is cg.Paint => p !== undefined);
        return {
          fill_paints: fills_paints.length > 0 ? fills_paints : undefined,
        };
      }

      /**
       * Stroke properties - IStroke
       */
      function stroke_trait(node: {
        strokes?: figrest.Paint[];
        strokeWeight?: number;
        strokeCap?: figrest.LineNode["strokeCap"];
        strokeJoin?: figrest.LineNode["strokeJoin"];
        strokeDashes?: number[];
        strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";
        strokeMiterAngle?: number;
      }) {
        const strokes_paints = (node.strokes ?? [])
          .map(paint)
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
      function text_stroke_trait(node: {
        strokes?: figrest.Paint[];
        strokeWeight?: number;
        strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";
      }) {
        const strokes_paints = (node.strokes ?? [])
          .map(paint)
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
                padding_top: paddingTop ?? 0,
                padding_right: paddingRight ?? 0,
                padding_bottom: paddingBottom ?? 0,
                padding_left: paddingLeft ?? 0,
              };

        return {
          expanded,
          padding,
          layout: "flow" as const,
          direction: "horizontal" as const,
          main_axis_alignment: "start" as const,
          cross_axis_alignment: "start" as const,
          main_axis_gap: node.itemSpacing ?? 0,
          cross_axis_gap: node.counterAxisSpacing ?? node.itemSpacing ?? 0,
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

      export type FactoryContext = {
        node_id_generator?: () => string;
        gradient_id_generator: () => string;
      };

      type InputNode =
        | (figrest.SubcanvasNode & Partial<__ir.HasLayoutTraitIR>)
        | __ir.VectorNodeWithVectorNetworkDataPresent
        | __ir.StarNodeWithPointsDataPresent
        | __ir.RegularPolygonNodeWithPointsDataPresent;

      export function document(
        node: InputNode,
        images: { [key: string]: string },
        context: FactoryContext
      ): grida.program.document.IPackedSceneDocument {
        const nodes: Record<string, grida.program.nodes.Node> = {};
        const graph: Record<string, string[]> = {};

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
          const gridaId = generateId();
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
              ...(options.useFill ? fills_trait(parentNode.fills) : {}),
              ...(options.useStroke
                ? stroke_trait(parentNode)
                : stroke_trait({
                    strokes: [],
                    strokeWeight: 0,
                  })),
              ...("effects" in parentNode && parentNode.effects
                ? effects_trait(parentNode.effects)
                : effects_trait(undefined)),
              type: "vector",
              vector_network: vectorNetwork,
              width: bbox.width,
              height: bbox.height,
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

          node.strokeGeometry.forEach((geometry, idx) => {
            const childId = `${parentGridaId}_stroke_${idx}`;
            const name = `${node.name || nodeTypeName} Stroke ${idx + 1}`;

            const childNode = createVectorNodeFromPath(
              geometry.path ?? "",
              geometry,
              node,
              childId,
              name,
              { useFill: false, useStroke: true }
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
            context
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
        // rootNode.position = "relative";
        // rootNode.left = 0;
        // rootNode.top = 0;

        if (!rootNode) {
          throw new Error("Failed to process root node");
        }

        // Generate a new scene ID
        const sceneId = generateId();

        return {
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
       * @returns
       */
      function node_without_children(
        node: InputNode,
        gridaId: string,
        images: { [key: string]: string },
        parent: FigmaParentNode | undefined,
        context: FactoryContext
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
              ...fills_trait(node.fills),
              ...style_trait({}),
              ...corner_radius_trait({ cornerRadius: 0 }),
              ...container_layout_trait({}, false),
              type: "container",
            } satisfies grida.program.nodes.ContainerNode;
          }
          //
          case "COMPONENT":
          case "INSTANCE":
          case "FRAME": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              ...fills_trait(node.fills),
              ...style_trait({
                overflow: node.clipsContent ? "clip" : undefined,
              }),
              ...corner_radius_trait(node),
              ...container_layout_trait(node, true),
              ...effects_trait(node.effects),
              type: "container",
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
              expanded: false,
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
              ...fills_trait(node.fills),
              ...text_stroke_trait(node),
              ...style_trait({}),
              ...effects_trait(node.effects),
              type: "text",
              text: node.characters,
              position: "absolute",
              left: constraints.left,
              top: constraints.top,
              right: constraints.right,
              bottom: constraints.bottom,
              width:
                figma_text_resizing_model === "WIDTH_AND_HEIGHT"
                  ? "auto"
                  : fixedwidth,
              height:
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
              ...fills_trait(node.fills),
              ...stroke_trait(node),
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
              ...fills_trait(node.fills),
              ...stroke_trait(node),
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
              ...fills_trait(node.fills),
              ...stroke_trait(node),
              ...effects_trait(node.effects),
              type: "boolean",
              op: mapBooleanOperation(node.booleanOperation),
              expanded: false,
            } satisfies grida.program.nodes.BooleanPathOperationNode;
          }
          case "LINE": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...stroke_trait(node),
              ...effects_trait(node.effects),
              type: "line",
              position: "absolute",
              left: node.relativeTransform![0][2],
              top: node.relativeTransform![1][2],
              width: node.size!.x,
              height: 0,
            } satisfies grida.program.nodes.LineNode;
          }
          case "SLICE": {
            return;
          }
          case "REGULAR_POLYGON":
          case "STAR":
          case "VECTOR": {
            // Nodes with HasGeometryTrait (REST API with geometry=paths) don't have
            // vector network data, only fillGeometry and strokeGeometry (SVG path strings).
            // We'll create a GroupNode with child VectorNodes in processNode.
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node),
              type: "group",
              expanded: false,
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
              ...fills_trait(node.fills),
              ...stroke_trait(node),
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
              ...fills_trait(node.fills),
              ...stroke_trait(node),
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
              ...fills_trait(node.fills),
              ...stroke_trait(node),
              ...effects_trait(node.effects),
              type: "polygon",
              point_count: node.pointCount,
            } satisfies grida.program.nodes.RegularPolygonNode;
          }

          // components
          case "COMPONENT_SET": {
            throw new Error(`Unsupported node type: ${node.type}`);
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
       * Mapping:
       * - frameMaskDisabled: true → clipsContent: true (mask disabled = clipping enabled)
       * - frameMaskDisabled: false → clipsContent: false (mask enabled = clipping disabled)
       * - frameMaskDisabled: undefined → clipsContent: false (default, no clipping)
       *
       * Note: This is separate from GROUP detection. GROUPs are handled separately
       * in the frame() function and always have clipsContent: false.
       */
      function kiwi_frame_clip_trait(nc: figkiwi.NodeChange) {
        // Map frameMaskDisabled directly to clipsContent, default to false
        const clipsContent = nc.frameMaskDisabled ?? false;
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
       * - frameMaskDisabled === false (real FRAMEs have true)
       * - resizeToFit === true (real FRAMEs don't have this property)
       * - No paints: fillPaints, strokePaints, and backgroundPaints are all empty/undefined
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
        } satisfies figrest.ComponentNode;
      }

      /**
       * Convert NodeChange to INSTANCE node
       */
      function instance(
        nc: figkiwi.NodeChange
      ): figrest.SubcanvasNode | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;

        return {
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
            const vectorNetwork = parseVectorNetworkBlob(blobBytes);

            if (vectorNetwork) {
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

    /**
     * Namespace for .fig file import functionality
     */
    export interface FigFileDocument {
      pages: FigPage[];
      metadata: {
        version: number;
      };
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
    export function parseFile(fileData: Uint8Array): FigFileDocument {
      const figData = readFigFile(fileData);
      const pages = extractPages(figData);

      return {
        pages,
        metadata: {
          version: figData.header.version,
        },
      };
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
    function extractPages(figData: ParsedFigmaArchive): FigPage[] {
      const nodeChanges = figData.message.nodeChanges || [];

      // Find all CANVAS nodes, excluding internal-only ones
      const canvasNodes = nodeChanges.filter(
        (nc) => nc.type === "CANVAS" && !nc.internalOnly
      );

      // Extract pages with sortkey information (no sorting - consumers can sort by sortkey property)
      return canvasNodes.map((canvas) => {
        const rootNodes = buildPageTree(canvas, nodeChanges, figData);
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
      figData: ParsedFigmaArchive
    ): any[] {
      const canvasGuid = canvas.guid;
      if (!canvasGuid) return [];

      const canvasGuidStr = guid(canvasGuid);

      // Convert all Kiwi nodes to REST API nodes
      const flatFigmaNodes = allNodeChanges
        .map((nc) => factory.node(nc, figData.message))
        .filter((node) => node !== undefined);

      // Build GUID maps
      const guidToNode = new Map<string, any>();
      const guidToKiwi = new Map<string, figkiwi.NodeChange>();

      allNodeChanges.forEach((nc) => {
        if (nc.guid) guidToKiwi.set(guid(nc.guid), nc);
      });

      flatFigmaNodes.forEach((node) => {
        guidToNode.set(node.id, node);
      });

      // Build parent-child relationships
      flatFigmaNodes.forEach((node) => {
        const kiwiNode = guidToKiwi.get(node.id);
        if (kiwiNode?.parentIndex?.guid) {
          const parentGuid = guid(kiwiNode.parentIndex.guid);
          const parentNode = guidToNode.get(parentGuid);

          if (parentNode && "children" in parentNode) {
            if (!parentNode.children) parentNode.children = [];
            (parentNode.children as any[]).push(node);
          }
        }
      });

      // Return root nodes (direct children of CANVAS)
      return flatFigmaNodes.filter((node) => {
        const kiwiNode = guidToKiwi.get(node.id);
        if (!kiwiNode?.parentIndex?.guid) return false;
        const parentGuid = guid(kiwiNode.parentIndex.guid);
        return parentGuid === canvasGuidStr;
      });
    }

    /**
     * Convert page to single packed document (bulk insert to avoid reducer nesting)
     */
    export function convertPageToScene(
      page: FigPage,
      context: restful.factory.FactoryContext
    ): grida.program.document.IPackedSceneDocument {
      const individualDocs = page.rootNodes.map((rootNode) =>
        restful.factory.document(rootNode, {}, context)
      );

      if (individualDocs.length === 1) return individualDocs[0];

      // Merge multiple roots into single document
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

      individualDocs.forEach((doc) => {
        Object.assign(merged.nodes, doc.nodes);
        Object.assign(merged.links, doc.links);
        Object.assign(merged.images, doc.images);
        Object.assign(merged.bitmaps, doc.bitmaps);
        Object.assign(merged.properties, doc.properties);
        merged.scene.children_refs.push(...doc.scene.children_refs);
      });

      return merged;
    }

    /**
     * @deprecated Use iofigma.kiwi.parseFile() instead
     * Legacy class-based API for backward compatibility
     */
    export class FigImporter {
      static parseFile(fileData: Uint8Array): FigFileDocument {
        return parseFile(fileData);
      }

      static convertPageToScene(
        page: FigPage,
        context: restful.factory.FactoryContext
      ): grida.program.document.IPackedSceneDocument {
        return convertPageToScene(page, context);
      }
    }
  }
}
