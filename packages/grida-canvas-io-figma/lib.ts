/**
 * @fileoverview
 * @grida/io-figma — Figma data conversion utilities
 *
 * Converts Figma clipboard (Kiwi) and REST API formats into the Grida Canvas schema.
 *
 * @see https://grida.co/docs/wg/feat-fig/glossary/fig.kiwi — Fig.kiwi format glossary
 *
 * ## TODO — Auto-layout conversion (not implemented)
 *
 * Currently ALL nodes are emitted with `layout_positioning: "absolute"` and
 * `layout_mode: "flow"`. Figma auto-layout properties (`layoutMode`,
 * `layoutAlign`, `layoutGrow`, `primaryAxisAlignItems`,
 * `counterAxisAlignItems`, `layoutPositioning`, sizing modes, `layoutWrap`)
 * are completely dropped during conversion. Positions are always derived
 * from `absoluteBoundingBox` / `relativeTransform`.
 *
 * This means:
 * - The output is always safe for `skip_layout` (no flex containers exist)
 * - Auto-layout semantics are lost — re-layout in Grida won't match Figma
 * - Resizing a container won't reflow children as it would in Figma
 *
 * To support true auto-layout round-trip:
 * - Map `layoutMode` → `layout_mode: "flex"`
 * - Map `layoutAlign`, `layoutGrow`, `layoutPositioning` per child
 * - Map `primaryAxisAlignItems` / `counterAxisAlignItems` → alignment
 * - Map `primaryAxisSizingMode` / `counterAxisSizingMode` → sizing
 * - Map `layoutWrap` → `layout_wrap`
 * - Only set `layout_positioning: "absolute"` for children with
 *   `layoutPositioning: "ABSOLUTE"` in Figma
 *
 * ## TODO — Kiwi → REST (not yet fully mapped)
 *
 * - **Rich text**: `characterStyleOverrides` and `styleOverrideTable` are always empty.
 *   Kiwi has `textData.characterStyleIDs` and `textData.styleOverrideTable` (NodeChange[]).
 *   Full support would require per-run font resolution and building the REST override map.
 * - **lineTypes / lineIndentations**: Now derived from `textData.lines`
 *   (lineType: PLAIN→NONE, ORDERED_LIST→ORDERED, UNORDERED_LIST→UNORDERED; indentationLevel).
 *   Faux-list rendering (faux-list.ts) converts these into inline bullet/number prefixes
 *   since Grida has no native list model.
 * - **fontVariant***: `fontVariantCommonLigatures`, etc. are not mapped.
 * - **textTracking vs letterSpacing**: Only letterSpacing is used; clarify canonical source.
 */
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
  readFigFileFromStream,
  type ParsedFigmaArchive,
} from "./fig-kiwi";
import {
  applyFauxList,
  shiftCharOverrides,
  type FigmaLineType,
} from "./faux-list";

const _GRIDA_SYSTEM_EMBEDDED_CHECKER =
  "system://images/checker-16-strip-L98L92.png";

const DEFAULT_FONT_SIZE = 14;

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

    /**
     * Slide node from Figma Deck (.fig with fig-deck prelude).
     *
     * - rest-api-spec - Not supported (Figma REST API has no Deck/Slides types)
     * - kiwi-spec - SLIDE, INTERACTIVE_SLIDE_ELEMENT
     *
     * Structurally equivalent to a FrameNode (children, fills, clips, layout).
     * INTERACTIVE_SLIDE_ELEMENT is also mapped here since it behaves as a
     * frame-like interactive element within a slide.
     */
    export type SlideNodeIR = Omit<figrest.FrameNode, "type"> & {
      type: "X_SLIDE";
      slideMetadata?: {
        speakerNotes?: string;
        isSkipped?: boolean;
        slideNumber?: string;
      };
    };

    /**
     * Slide grid container from Figma Deck.
     *
     * - rest-api-spec - Not supported
     * - kiwi-spec - SLIDE_GRID
     */
    export type SlideGridNodeIR = Omit<figrest.FrameNode, "type"> & {
      type: "X_SLIDE_GRID";
    };

    /**
     * Slide row container from Figma Deck.
     *
     * - rest-api-spec - Not supported
     * - kiwi-spec - SLIDE_ROW
     */
    export type SlideRowNodeIR = Omit<figrest.FrameNode, "type"> & {
      type: "X_SLIDE_ROW";
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
       * Apply a 2×2 affine transform to all coordinates in an SVG path string,
       * then translate so the bounding box starts at (0, 0).
       *
       * Used to bake non-representable transforms (flips, skews) into path data
       * when the Grida node model can only store (x, y, rotation).
       *
       * @param pathData - SVG path d attribute string
       * @param a - relativeTransform[0][0]
       * @param c - relativeTransform[0][1]
       * @param b - relativeTransform[1][0]
       * @param d - relativeTransform[1][1]
       * @returns Transformed path and the offset applied, or null if transform is
       *   identity (or near-identity pure rotation, which the caller handles via rotation).
       */
      function transformSvgPath(
        pathData: string,
        a: number,
        c: number,
        b: number,
        d: number
      ): { path: string; width: number; height: number } | null {
        // Identity check — no transform needed
        const isIdentity =
          Math.abs(a - 1) < 1e-6 &&
          Math.abs(d - 1) < 1e-6 &&
          Math.abs(b) < 1e-6 &&
          Math.abs(c) < 1e-6;
        if (isIdentity) return null;

        const det = a * d - b * c;

        // Parse path: extract command groups
        const cmdRegex = /([MLHVCSQTAZmlhvcsqtaz])/g;
        const numRegex = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

        type CmdGroup = { cmd: string; nums: number[] };
        const groups: CmdGroup[] = [];
        let lastIdx = 0;
        let m: RegExpExecArray | null;

        // Split into (command, numbers[]) pairs
        const cmds: { cmd: string; pos: number }[] = [];
        while ((m = cmdRegex.exec(pathData)) !== null) {
          cmds.push({ cmd: m[0], pos: m.index });
        }

        let numI = 0;
        const allNums: { val: number; pos: number }[] = [];
        while ((m = numRegex.exec(pathData)) !== null) {
          allNums.push({ val: parseFloat(m[0]), pos: m.index });
        }

        for (let ci = 0; ci < cmds.length; ci++) {
          const nextPos =
            ci + 1 < cmds.length ? cmds[ci + 1].pos : pathData.length;
          const nums: number[] = [];
          while (numI < allNums.length && allNums[numI].pos < nextPos) {
            nums.push(allNums[numI].val);
            numI++;
          }
          groups.push({ cmd: cmds[ci].cmd, nums });
        }

        const xf = (x: number, y: number): [number, number] => [
          a * x + c * y,
          b * x + d * y,
        ];

        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        const track = (x: number, y: number) => {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        };

        // Transform absolute coordinate pairs in each command
        for (const g of groups) {
          const isRel =
            g.cmd === g.cmd.toLowerCase() && g.cmd !== "z" && g.cmd !== "Z";
          const cu = g.cmd.toUpperCase();

          switch (cu) {
            case "M":
            case "L":
            case "T":
              for (let i = 0; i + 1 < g.nums.length; i += 2) {
                const [nx, ny] = xf(g.nums[i], g.nums[i + 1]);
                g.nums[i] = nx;
                g.nums[i + 1] = ny;
                if (!isRel) track(nx, ny);
              }
              break;
            case "H":
              // H/V cannot survive non-diagonal 2×2; promote to L
              // For diagonal transforms (flips), H stays H
              if (Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9) {
                for (let i = 0; i < g.nums.length; i++) {
                  g.nums[i] = a * g.nums[i];
                  if (!isRel) track(g.nums[i], 0);
                }
              }
              break;
            case "V":
              if (Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9) {
                for (let i = 0; i < g.nums.length; i++) {
                  g.nums[i] = d * g.nums[i];
                  if (!isRel) track(0, g.nums[i]);
                }
              }
              break;
            case "C":
              for (let i = 0; i + 5 < g.nums.length; i += 6) {
                const [x1, y1] = xf(g.nums[i], g.nums[i + 1]);
                const [x2, y2] = xf(g.nums[i + 2], g.nums[i + 3]);
                const [x3, y3] = xf(g.nums[i + 4], g.nums[i + 5]);
                g.nums[i] = x1;
                g.nums[i + 1] = y1;
                g.nums[i + 2] = x2;
                g.nums[i + 3] = y2;
                g.nums[i + 4] = x3;
                g.nums[i + 5] = y3;
                if (!isRel) {
                  track(x1, y1);
                  track(x2, y2);
                  track(x3, y3);
                }
              }
              break;
            case "S":
            case "Q":
              for (let i = 0; i + 3 < g.nums.length; i += 4) {
                const [x1, y1] = xf(g.nums[i], g.nums[i + 1]);
                const [x2, y2] = xf(g.nums[i + 2], g.nums[i + 3]);
                g.nums[i] = x1;
                g.nums[i + 1] = y1;
                g.nums[i + 2] = x2;
                g.nums[i + 3] = y2;
                if (!isRel) {
                  track(x1, y1);
                  track(x2, y2);
                }
              }
              break;
            case "A":
              for (let i = 0; i + 6 < g.nums.length; i += 7) {
                const [nx, ny] = xf(g.nums[i + 5], g.nums[i + 6]);
                g.nums[i + 5] = nx;
                g.nums[i + 6] = ny;
                // Flip sweep flag when determinant is negative
                if (det < 0) g.nums[i + 4] = g.nums[i + 4] === 0 ? 1 : 0;
                if (!isRel) track(nx, ny);
              }
              break;
            case "Z":
              break;
          }
        }

        // Offset so min corner is at (0, 0)
        const ox = isFinite(minX) ? minX : 0;
        const oy = isFinite(minY) ? minY : 0;

        for (const g of groups) {
          const isRel =
            g.cmd === g.cmd.toLowerCase() && g.cmd !== "z" && g.cmd !== "Z";
          if (isRel) continue;
          const cu = g.cmd.toUpperCase();
          switch (cu) {
            case "M":
            case "L":
            case "T":
              for (let i = 0; i + 1 < g.nums.length; i += 2) {
                g.nums[i] -= ox;
                g.nums[i + 1] -= oy;
              }
              break;
            case "H":
              for (let i = 0; i < g.nums.length; i++) g.nums[i] -= ox;
              break;
            case "V":
              for (let i = 0; i < g.nums.length; i++) g.nums[i] -= oy;
              break;
            case "C":
              for (let i = 0; i + 5 < g.nums.length; i += 6) {
                g.nums[i] -= ox;
                g.nums[i + 1] -= oy;
                g.nums[i + 2] -= ox;
                g.nums[i + 3] -= oy;
                g.nums[i + 4] -= ox;
                g.nums[i + 5] -= oy;
              }
              break;
            case "S":
            case "Q":
              for (let i = 0; i + 3 < g.nums.length; i += 4) {
                g.nums[i] -= ox;
                g.nums[i + 1] -= oy;
                g.nums[i + 2] -= ox;
                g.nums[i + 3] -= oy;
              }
              break;
            case "A":
              for (let i = 0; i + 6 < g.nums.length; i += 7) {
                g.nums[i + 5] -= ox;
                g.nums[i + 6] -= oy;
              }
              break;
          }
        }

        const path = groups
          .map((g) => {
            if (g.cmd.toUpperCase() === "Z") return g.cmd;
            return (
              g.cmd + g.nums.map((n) => String(Number(n.toFixed(6)))).join(" ")
            );
          })
          .join("");

        return {
          path,
          width: isFinite(maxX - minX) ? maxX - minX : 0,
          height: isFinite(maxY - minY) ? maxY - minY : 0,
        };
      }

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
        /**
         * When true, convert fillGeometry/strokeGeometry to Path nodes (raw SVG path data)
         * instead of Vector nodes (vector network). Use for render-only pipelines (e.g. refig)
         * to avoid vn.fromSVGPathData conversions. Path nodes are not editable in the editor.
         * @default false
         */
        prefer_path_for_geometry?: boolean;
        /**
         * When true, image paints whose ref cannot be resolved via `resolve_image_src`
         * are replaced with a built-in checker pattern placeholder.
         * When false, unresolved refs are kept as `res://images/<ref>` so the lazy
         * image loading system can request them at render time.
         * @default true
         */
        placeholder_for_missing_images?: boolean;
        /**
         * When true, TEXT nodes always use concrete width/height from
         * absoluteBoundingBox, ignoring Figma's `textAutoResize` ("auto"
         * sizing). This produces fixed-size text frames whose dimensions
         * match Figma's rendered output exactly.
         *
         * Use this when the consumer skips layout computation (e.g.
         * `skip_layout` mode) and needs pre-resolved text dimensions.
         *
         * When false (default), TEXT nodes respect `textAutoResize`:
         * "WIDTH_AND_HEIGHT" sets both to auto, "HEIGHT" sets height to
         * auto. These require layout-time text measurement to resolve.
         *
         * **Caveat:** The fixed dimensions come from Figma's own renderer
         * and font metrics. If the rendering environment uses different
         * fonts or a different text shaper, the actual text extent may
         * not match the baked-in size — text may overflow or leave extra
         * whitespace. Only use this flag when font fidelity cannot be
         * guaranteed or when layout computation is explicitly skipped.
         *
         * @default false
         */
        prefer_fixed_text_sizing?: boolean;

        /**
         * When true, disable faux-list rendering for TEXT nodes.
         *
         * By default (`false`), Figma list metadata (`lineTypes`,
         * `lineIndentations`) is converted into inline bullet/number
         * prefixes and whitespace indentation baked into the text string.
         * This is a **lossy, one-shot approximation** — the faux
         * formatting is only correct at import time. Subsequent text
         * edits (reflow, line insertion/deletion, copy-paste) will NOT
         * update the synthetic bullets or numbering because there is no
         * underlying list model to drive them.
         *
         * Set to `true` to skip this transform entirely and preserve the
         * raw text as Figma stores it (without visible bullets/numbers).
         *
         * TODO: Remove this flag once Grida has native list support.
         *
         * @default false
         */
        disable_faux_list?: boolean;

        // -- Shared buffers (performance) --
        // When provided, factory.document() writes directly into these
        // pre-allocated collections instead of creating its own, eliminating
        // the Object.assign merge passes in the caller.

        /**
         * Shared nodes dictionary. When set, `factory.document()` inserts
         * converted nodes here instead of allocating a local `nodes` object.
         */
        _shared_nodes?: Record<string, grida.program.nodes.Node>;
        /**
         * Shared links (parent→children) dictionary.
         */
        _shared_links?: Record<string, string[]>;
        /**
         * Shared mutable set for collecting image refs used across all roots.
         */
        _shared_image_refs_used?: Set<string>;
        /**
         * Shared Figma-ID → Grida-ID map. Avoids per-root Map allocations
         * when converting many root nodes.
         */
        _shared_figma_id_map?: Map<string, string>;
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
            const usePlaceholder = ctx.placeholder_for_missing_images !== false;
            const resolved = imageRef
              ? (ctx.resolve_image_src?.(imageRef) ?? null)
              : null;
            const src =
              resolved ??
              (imageRef
                ? usePlaceholder
                  ? _GRIDA_SYSTEM_EMBEDDED_CHECKER
                  : `res://images/${imageRef}`
                : _GRIDA_SYSTEM_EMBEDDED_CHECKER);
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
          // Figma REST API `rotation` is in radians. Store as-is; the Rust
          // side handles the unit per node type (Container uses radians
          // directly via AffineTransform::new; other node types with
          // prefer_path_for_geometry bake the transform into path data and
          // set rotation=0).
          rotation: node.rotation ?? 0,
          opacity: node.opacity ?? 1,
          blend_mode: map.layerBlendModeMap[node.blendMode],
          z_index: 0,
        };
      }

      /**
       * Positioning properties - IPositioning
       *
       * When `size` and `relativeTransform` are absent (e.g. Figma REST API
       * responses fetched without the `geometry=paths` query parameter), falls
       * back to `absoluteBoundingBox` for dimensions and computes insets from
       * absolute positions relative to the parent node's absolute bounding box.
       */
      function positioning_trait(
        node:
          | (figrest.HasLayoutTrait & Partial<__ir.HasLayoutTraitIR>)
          | {
              relativeTransform?: any;
              size?: any;
              absoluteBoundingBox?: any;
            },
        parent?: {
          absoluteBoundingBox?: { x: number; y: number } | null;
        } | null
      ): Pick<
        grida.program.nodes.ContainerNode,
        | "layout_positioning"
        | "layout_inset_left"
        | "layout_inset_top"
        | "layout_target_width"
        | "layout_target_height"
        | "layout_target_aspect_ratio"
      > {
        // Fallback: REST API without geometry=paths omits `size` and
        // `relativeTransform`; use absoluteBoundingBox as the source of truth.
        const absBox = (node as any).absoluteBoundingBox as
          | { x: number; y: number; width: number; height: number }
          | null
          | undefined;

        const szx = node.size?.x ?? absBox?.width ?? 0;
        const szy = node.size?.y ?? absBox?.height ?? 0;

        // Align spec: use REST `preserveRatio` as the canonical flag.
        const constrained =
          (node as figrest.HasLayoutTrait).preserveRatio === true;

        // Align spec: `targetAspectRatio` only exists in IR.
        const tar = (node as __ir.HasLayoutTraitIR).targetAspectRatio;

        const layout_target_aspect_ratio = constrained
          ? cmath.aspectRatio(tar?.x ?? szx, tar?.y ?? szy, 1000)
          : undefined;

        let inset_left: number;
        let inset_top: number;
        if (node.relativeTransform != null) {
          inset_left = node.relativeTransform[0][2];
          inset_top = node.relativeTransform[1][2];
        } else if (absBox != null) {
          // Compute relative position from absolute bounding boxes.
          // When there is no parent, the node sits at origin in the exported scene.
          const parentAbsBox = parent?.absoluteBoundingBox;
          inset_left = absBox.x - (parentAbsBox?.x ?? absBox.x);
          inset_top = absBox.y - (parentAbsBox?.y ?? absBox.y);
        } else {
          inset_left = 0;
          inset_top = 0;
        }

        return {
          layout_positioning: "absolute" as const,
          layout_inset_left: inset_left,
          layout_inset_top: inset_top,
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
       * Per-side stroke width properties for rectangular nodes.
       * Extracts `individualStrokeWeights` from Figma REST API / Kiwi intermediate format.
       */
      function rectangular_stroke_width_trait(node: {
        individualStrokeWeights?: {
          top: number;
          right: number;
          bottom: number;
          left: number;
        };
      }) {
        if (!node.individualStrokeWeights) return {};
        const { top, right, bottom, left } = node.individualStrokeWeights;
        return {
          rectangular_stroke_width_top: top,
          rectangular_stroke_width_right: right,
          rectangular_stroke_width_bottom: bottom,
          rectangular_stroke_width_left: left,
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
        | figrest.GroupNode
        | __ir.SlideNodeIR
        | __ir.SlideGridNodeIR
        | __ir.SlideRowNodeIR;

      type InputNode =
        | (figrest.SubcanvasNode & Partial<__ir.HasLayoutTraitIR>)
        | __ir.VectorNodeRestInput
        | __ir.VectorNodeWithVectorNetworkDataPresent
        | __ir.StarNodeWithPointsDataPresent
        | __ir.RegularPolygonNodeWithPointsDataPresent
        | __ir.SlideNodeIR
        | __ir.SlideGridNodeIR
        | __ir.SlideRowNodeIR;

      export function document(
        node: InputNode,
        images: { [key: string]: string },
        context: FactoryContext
      ): FigmaImportResult {
        const nodes: Record<string, grida.program.nodes.Node> =
          context._shared_nodes ?? {};
        const graph: Record<string, string[]> = context._shared_links ?? {};
        const imageRefsUsed: Set<string> =
          context._shared_image_refs_used ?? new Set<string>();

        // Map from Figma ID (ephemeral) to Grida ID (final)
        const figma_id_to_grida_id =
          context._shared_figma_id_map ?? new Map<string, string>();

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
         * Extracts width/height from a node with layout traits (Figma REST API).
         * Uses absoluteBoundingBox or size; avoids parsing path data.
         */
        function getParentBounds(node: InputNode & figrest.HasGeometryTrait): {
          width: number;
          height: number;
        } {
          const box =
            "absoluteBoundingBox" in node
              ? node.absoluteBoundingBox
              : undefined;
          const sz = "size" in node ? node.size : undefined;
          return {
            width: box?.width ?? sz?.x ?? 0,
            height: box?.height ?? sz?.y ?? 0,
          };
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
          },
          /** Per-path fill override (resolved from fillOverrideTable). Defaults to parentNode.fills. */
          fillOverrides?: figrest.Paint[]
        ): grida.program.nodes.VectorNode | null {
          if (!pathData) return null;

          try {
            const vectorNetwork = vn.fromSVGPathData(pathData);
            const { width, height } = getParentBounds(parentNode);

            // Use parent node bounds instead of computing bbox from path; Figma path data aligns with node coordinate space.
            const strokeAsFill = options.strokeAsFill === true;
            const effectiveFills = fillOverrides ?? parentNode.fills;
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
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                size: { x: width, y: height },
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
                      ? fills_trait(effectiveFills, context, imageRefsUsed)
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
              layout_target_width: width,
              layout_target_height: height,
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
         * Creates a PathNode from SVG path data.
         * Used when prefer_path_for_geometry is true for render-only pipelines.
         */
        function createPathNodeFromPath(
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
            strokeAsFill?: boolean;
          },
          /** Per-path fill override (resolved from fillOverrideTable). Defaults to parentNode.fills. */
          fillOverrides?: figrest.Paint[]
        ): grida.program.nodes.PathNode | null {
          if (!pathData) return null;

          try {
            const { width, height } = getParentBounds(parentNode);
            const strokeAsFill = options.strokeAsFill === true;
            const effectiveFills = fillOverrides ?? parentNode.fills;
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
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                size: { x: width, y: height },
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
                      ? fills_trait(effectiveFills, context, imageRefsUsed)
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
              type: "path",
              data: pathData,
              layout_target_width: width,
              layout_target_height: height,
              fill_rule: map.windingRuleMap[geometry.windingRule] ?? "nonzero",
            };
          } catch (e) {
            console.warn(`Failed to create path node (${name}):`, e);
            return null;
          }
        }

        /**
         * Resolves the effective fills for a fillGeometry path, accounting
         * for per-region fill overrides via `fillOverrideTable`.
         *
         * Lookup rules (from the Figma REST API spec):
         * - Path has no `overrideID`           → use node-level `fills`
         * - `fillOverrideTable[id]` is `null`  → use node-level `fills`
         * - `fillOverrideTable[id]` is absent  → use node-level `fills`
         * - `fillOverrideTable[id].fills` exists → use those fills instead
         */
        function resolveFillOverride(
          geometry: figrest.Path,
          node: InputNode & figrest.HasGeometryTrait
        ): figrest.Paint[] {
          if (geometry.overrideID == null) return node.fills;

          const table = node.fillOverrideTable;
          if (!table) return node.fills;

          const key = String(geometry.overrideID);
          if (!(key in table)) return node.fills;

          const override = table[key];
          if (override == null) return node.fills;

          // PaintOverride.fills is the per-region fill array.
          // An empty array means explicitly no fill (transparent).
          return override.fills ?? node.fills;
        }

        /**
         * Processes fill geometries from a node with HasGeometryTrait.
         * Returns array of child node IDs that were successfully created.
         */
        function processFillGeometries(
          node: InputNode & figrest.HasGeometryTrait,
          parentGridaId: string,
          nodeTypeName: string,
          pathTransform?: {
            a: number;
            c: number;
            b: number;
            d: number;
          }
        ): string[] {
          if (!node.fillGeometry?.length) return [];

          const childIds: string[] = [];

          node.fillGeometry.forEach((geometry, idx) => {
            const childId = `${parentGridaId}_fill_${idx}`;
            const name = `${node.name || nodeTypeName} Fill ${idx + 1}`;

            // Resolve per-path fill overrides from fillOverrideTable.
            const effectiveFills = resolveFillOverride(geometry, node);

            // Pre-transform path data if the node has a non-rotational transform
            let pathData = geometry.path ?? "";
            if (pathTransform && pathData) {
              const result = transformSvgPath(
                pathData,
                pathTransform.a,
                pathTransform.c,
                pathTransform.b,
                pathTransform.d
              );
              if (result) pathData = result.path;
            }

            const childNode = context.prefer_path_for_geometry
              ? createPathNodeFromPath(
                  pathData,
                  geometry,
                  node,
                  childId,
                  name,
                  { useFill: true, useStroke: false },
                  effectiveFills
                )
              : createVectorNodeFromPath(
                  geometry.path ?? "",
                  geometry,
                  node,
                  childId,
                  name,
                  { useFill: true, useStroke: false },
                  effectiveFills
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
          nodeTypeName: string,
          pathTransform?: {
            a: number;
            c: number;
            b: number;
            d: number;
          }
        ): string[] {
          if (!node.strokeGeometry?.length) return [];

          const childIds: string[] = [];

          node.strokeGeometry.forEach((geometry, idx) => {
            const childId = `${parentGridaId}_stroke_${idx}`;
            const name = `${node.name || nodeTypeName} Stroke ${idx + 1}`;

            let pathData = geometry.path ?? "";
            if (pathTransform && pathData) {
              const result = transformSvgPath(
                pathData,
                pathTransform.a,
                pathTransform.c,
                pathTransform.b,
                pathTransform.d
              );
              if (result) pathData = result.path;
            }

            const childNode = context.prefer_path_for_geometry
              ? createPathNodeFromPath(
                  pathData,
                  geometry,
                  node,
                  childId,
                  name,
                  { useFill: false, useStroke: false, strokeAsFill: true }
                )
              : createVectorNodeFromPath(
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
         * Resolve how fill and stroke geometry children should be ordered
         * and whether stroke geometry should be included at all.
         *
         * ## Why this exists
         *
         * The Figma REST API `geometry=paths` returns `fillGeometry` and
         * `strokeGeometry` as **independent, alignment-unaware shapes**.
         * The `strokeAlign` property is a **compositing instruction** —
         * it controls paint order and clipping, not the geometry itself.
         *
         * The `strokeGeometry` is always a CENTER-style stroke expansion.
         * To produce the correct visual for non-CENTER alignments, the
         * consumer must composite fill and stroke in a specific order.
         *
         * ## Compositing rules
         *
         * | `strokeAlign` | Child order           | Clipping          | Status          |
         * |---------------|-----------------------|-------------------|-----------------|
         * | `CENTER`      | fill first, stroke    | none              | **Implemented** |
         * | `OUTSIDE`     | stroke first, fill    | none              | **Implemented** |
         * | `INSIDE`      | fill first, stroke    | clip to fill      | **Not yet** (see TODO) |
         *
         * For OUTSIDE, drawing stroke first then fill on top works because
         * the fill shape exactly covers the inward half of the too-wide
         * stroke band, leaving only the outward half visible. This is the
         * same principle as CSS `paint-order: stroke fill`.
         *
         * ## INSIDE stroke — boolean intersection
         *
         * INSIDE strokes require clipping `strokeGeometry` to the
         * `fillGeometry` shape to remove the outward half of the stroke
         * band. This is modeled as a `BooleanPathOperationNode` with
         * `op: "intersection"` wrapping the fill and stroke geometry.
         * The Rust renderer evaluates this via Skia `Path::op(Intersect)`.
         *
         * When INSIDE is detected, this function returns
         * `{ type: "inside", fillChildIds, strokeChildIds }` so the
         * caller can create the boolean wrapper node.
         *
         * ## Tracking
         *
         * See `docs/wg/feat-fig/stroke-geometry-alignment.md` for the
         * full analysis with measurements.
         * Grep: `resolveStrokeGeometryCompositing`
         */
        function resolveStrokeGeometryCompositing(
          node: InputNode & figrest.HasGeometryTrait,
          fillChildIds: string[],
          strokeChildIds: string[]
        ):
          | { type: "ordered"; childIds: string[] }
          | {
              type: "inside";
              fillChildIds: string[];
              strokeChildIds: string[];
            } {
          if (strokeChildIds.length === 0) {
            return { type: "ordered", childIds: [...fillChildIds] };
          }

          const align = node.strokeAlign ?? "CENTER";

          switch (align) {
            // CENTER: geometry is correct as-is. Fill first, stroke on top.
            case "CENTER":
              return {
                type: "ordered",
                childIds: [...fillChildIds, ...strokeChildIds],
              };

            // OUTSIDE: stroke first, fill on top. The fill covers the
            // inward half of the stroke band, leaving only the outward
            // half visible.
            case "OUTSIDE":
              return {
                type: "ordered",
                childIds: [...strokeChildIds, ...fillChildIds],
              };

            // INSIDE: wrap fill + stroke in a boolean intersection.
            // The fill defines the clip mask; the stroke is the clipped
            // content. The Rust renderer evaluates this via
            // Skia Path::op(Intersect).
            case "INSIDE":
              return {
                type: "inside",
                fillChildIds: [...fillChildIds],
                strokeChildIds: [...strokeChildIds],
              };

            default:
              return {
                type: "ordered",
                childIds: [...fillChildIds, ...strokeChildIds],
              };
          }
        }

        /**
         * Processes nodes with HasGeometryTrait from REST API (with geometry=paths parameter).
         * Converts fill/stroke geometries to child VectorNodes under a GroupNode.
         * Applies to VECTOR, STAR, REGULAR_POLYGON, BOOLEAN_OPERATION, and other shape nodes.
         *
         * When the node's relativeTransform contains a non-rotational component
         * (flip or skew), the 2×2 part is baked into the SVG path data and the
         * group node's position is derived from absoluteBoundingBox instead.
         * This is necessary because the Grida node model only supports
         * (x, y, rotation) and cannot represent flips.
         */
        function processNodeWithGeometryTrait(
          node: InputNode & figrest.HasGeometryTrait,
          groupNode: grida.program.nodes.GroupNode
        ): void {
          const nodeTypeName =
            "type" in node ? node.type.replace("_", " ") : "Shape";

          // Detect non-rotational transforms (flips/skews) that need to be
          // baked into the path data because the Grida node model only stores
          // (x, y, rotation).
          let pathTransform:
            | { a: number; c: number; b: number; d: number }
            | undefined;

          if (
            context.prefer_path_for_geometry &&
            node.relativeTransform != null
          ) {
            const rt = node.relativeTransform;
            const a = rt[0][0],
              c = rt[0][1],
              b = rt[1][0],
              dd = rt[1][1];
            const result = transformSvgPath("M0 0", a, c, b, dd);
            if (result !== null) {
              // Non-rotational 2×2 — need to bake into paths
              pathTransform = { a, c, b, d: dd };

              // Compute the AABB of the transformed local rect in parent
              // space. The four corners of the local rect (0,0,w,h)
              // transformed by the 2×2 + translation:
              const tx = rt[0][2],
                ty = rt[1][2];
              const w = node.size?.x ?? 0,
                h = node.size?.y ?? 0;
              const corners = [
                [tx, ty],
                [a * w + tx, b * w + ty],
                [c * h + tx, dd * h + ty],
                [a * w + c * h + tx, b * w + dd * h + ty],
              ];
              const aabbX = Math.min(...corners.map((p) => p[0]));
              const aabbY = Math.min(...corners.map((p) => p[1]));
              const aabbW = Math.max(...corners.map((p) => p[0])) - aabbX;
              const aabbH = Math.max(...corners.map((p) => p[1])) - aabbY;

              // Override the group's position to the AABB top-left
              // (relative to parent) with no rotation, since the 2×2
              // transform is now baked into the path data.
              (groupNode as any).layout_inset_left = aabbX;
              (groupNode as any).layout_inset_top = aabbY;
              (groupNode as any).rotation = 0;
              (groupNode as any).layout_target_width = aabbW;
              (groupNode as any).layout_target_height = aabbH;
            }
          }

          const fillChildIds = processFillGeometries(
            node,
            groupNode.id,
            nodeTypeName,
            pathTransform
          );

          const strokeChildIds = processStrokeGeometries(
            node,
            groupNode.id,
            nodeTypeName,
            pathTransform
          );

          const composited = resolveStrokeGeometryCompositing(
            node,
            fillChildIds,
            strokeChildIds
          );

          if (composited.type === "inside") {
            // INSIDE stroke: clip stroke geometry to fill boundary
            // using BooleanPathOperationNode(intersection).
            //
            // The Rust renderer's boolean_operation_path() applies the
            // node's `op` to children[1..] against children[0]. So for
            // `op: intersection`, children = [A, B] gives A ∩ B.
            //
            // When there are multiple fill or stroke geometry paths,
            // we must first union them into single operands, otherwise
            // intersection is applied pairwise across all children:
            //   [f0, f1, s0] with op=intersect → f0 ∩ f1 ∩ s0 (wrong)
            //   vs. (f0 ∪ f1) ∩ (s0)                           (correct)
            //
            // Structure (general case):
            //   GroupNode (the geometry group)
            //     ├─ fill children (visible — render the shape fill)
            //     └─ BooleanOp(intersection)
            //          ├─ BooleanOp(union) { fill_clones }  — clip mask
            //          └─ BooleanOp(union) { stroke_children } — clipped
            //
            // Simplified when single fill / single stroke (no union
            // wrappers needed — direct children of the intersection).

            const { width, height } = getParentBounds(node);
            const boolNodeId = `${groupNode.id}_inside_stroke_bool`;

            // Helper: create a BooleanPathOperationNode shell
            const makeBoolShell = (
              id: string,
              name: string,
              op: "union" | "intersection"
            ): grida.program.nodes.BooleanPathOperationNode => ({
              id,
              name,
              active: true,
              locked: false,
              opacity: 1,
              rotation: 0,
              layout_positioning: "absolute",
              layout_inset_left: 0,
              layout_inset_top: 0,
              layout_target_width: width,
              layout_target_height: height,
              stroke_width: 0,
              stroke_cap: "butt",
              stroke_join: "miter",
              type: "boolean",
              op,
            });

            // Clone fill paths for the boolean node (they define the
            // clip boundary; originals outside render the actual fill).
            const cloneFillChildren = (): string[] => {
              const ids: string[] = [];
              for (const origFillId of composited.fillChildIds) {
                const origNode = nodes[origFillId];
                if (!origNode) continue;
                const cloneId = `${boolNodeId}_clip_${origFillId}`;
                nodes[cloneId] = {
                  ...origNode,
                  id: cloneId,
                  name: `${origNode.name} (clip)`,
                } as any;
                ids.push(cloneId);
              }
              return ids;
            };

            const fillCloneIds = cloneFillChildren();

            // Build the two operands for the intersection.
            // If an operand has multiple paths, wrap in union first.
            let fillOperandId: string;
            if (fillCloneIds.length === 1) {
              fillOperandId = fillCloneIds[0];
            } else {
              fillOperandId = `${boolNodeId}_fill_union`;
              nodes[fillOperandId] = makeBoolShell(
                fillOperandId,
                "Fill Union (clip)",
                "union"
              );
              graph[fillOperandId] = fillCloneIds;
            }

            let strokeOperandId: string;
            if (composited.strokeChildIds.length === 1) {
              strokeOperandId = composited.strokeChildIds[0];
            } else {
              strokeOperandId = `${boolNodeId}_stroke_union`;
              nodes[strokeOperandId] = makeBoolShell(
                strokeOperandId,
                "Stroke Union",
                "union"
              );
              graph[strokeOperandId] = [...composited.strokeChildIds];
            }

            // The boolean intersection produces the clipped stroke
            // band as a path. The renderer paints this path using the
            // *boolean node's own* fills (not children's paints).
            // Apply the original stroke color as fill on the boolean
            // node so the clipped stroke band is visible.
            const strokeAsFill = fills_trait(
              node.strokes ?? [],
              context,
              imageRefsUsed
            );

            const boolNode: grida.program.nodes.BooleanPathOperationNode = {
              ...makeBoolShell(boolNodeId, "Inside Stroke", "intersection"),
              ...strokeAsFill,
            };

            nodes[boolNodeId] = boolNode;
            graph[boolNodeId] = [fillOperandId, strokeOperandId];

            // Group children: original fill paths + the boolean node
            const allChildIds = [...composited.fillChildIds, boolNodeId];
            if (allChildIds.length > 0) {
              graph[groupNode.id] = allChildIds;
            }
          } else {
            // CENTER / OUTSIDE / default: simple ordered children.
            const orderedIds = composited.childIds;
            const orderedSet = new Set(orderedIds);

            // Deactivate stroke nodes excluded by compositing resolution.
            // Nodes stay in the tree to keep the graph structure valid,
            // but won't render.
            for (const id of strokeChildIds) {
              if (!orderedSet.has(id)) {
                (nodes[id] as any).active = false;
              }
            }

            // All children (including deactivated ones) must be linked in
            // the graph to avoid orphaned nodes. Use the composited order
            // for active nodes, append deactivated ones at the end.
            const deactivated = strokeChildIds.filter(
              (id) => !orderedSet.has(id)
            );
            const allChildIds = [...orderedIds, ...deactivated];

            if (allChildIds.length > 0) {
              graph[groupNode.id] = allChildIds;
            }
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

          // For BOOLEAN_OPERATION nodes converted to groups with geometry,
          // skip processing children — the boolean result is already baked
          // into fillGeometry/strokeGeometry and the children are just the
          // construction inputs (not visible in the final output).
          const isBoolGeometryGroup =
            "type" in currentNode &&
            (currentNode as any).type === "BOOLEAN_OPERATION" &&
            processedNode.type === "group";

          // When a container (FRAME/INSTANCE/COMPONENT) has a non-rotational
          // transform (flip/skew) and prefer_path_for_geometry is enabled,
          // propagate the 2×2 part into children's relativeTransforms and
          // fix the container to use the AABB position with no rotation.
          // This ensures that child geometry baking picks up the flip.
          if (
            context.prefer_path_for_geometry &&
            processedNode.type === "container" &&
            "children" in currentNode &&
            currentNode.children?.length &&
            (currentNode as any).relativeTransform != null
          ) {
            const prt = (currentNode as any).relativeTransform;
            const pa = prt[0][0],
              pc = prt[0][1];
            const pb = prt[1][0],
              pd = prt[1][1];
            const ptx = prt[0][2],
              pty = prt[1][2];
            const pIsIdentity2x2 =
              Math.abs(pa - 1) < 1e-6 &&
              Math.abs(pd - 1) < 1e-6 &&
              Math.abs(pb) < 1e-6 &&
              Math.abs(pc) < 1e-6;
            // Propagate ALL non-identity 2×2 transforms (rotations, flips,
            // skews) into children. The Grida container model stores
            // (position, rotation_degrees) and reconstructs via
            // from_box_center, which uses a different convention than
            // Figma's relativeTransform. Baking into children avoids the
            // mismatch entirely.
            const pNeedsBake = !pIsIdentity2x2;

            if (pNeedsBake) {
              // Compose the parent's 2×2 into each child's relativeTransform
              const pw = (currentNode as any).size?.x ?? 0;
              const ph = (currentNode as any).size?.y ?? 0;
              for (const child of currentNode.children) {
                const crt = (child as any).relativeTransform;
                if (!crt) continue;
                const ca = crt[0][0],
                  cc = crt[0][1],
                  ctx2 = crt[0][2];
                const cb = crt[1][0],
                  cd = crt[1][1],
                  cty = crt[1][2];
                // New 2×2: P_2x2 * C_2x2
                const na = pa * ca + pc * cb;
                const nc = pa * cc + pc * cd;
                const nb = pb * ca + pd * cb;
                const nd = pb * cc + pd * cd;
                // New translation: P_2x2 * C_t + P_t
                const ntx = pa * ctx2 + pc * cty + ptx;
                const nty = pb * ctx2 + pd * cty + pty;
                (child as any).relativeTransform = [
                  [na, nc, ntx],
                  [nb, nd, nty],
                ];
              }
              // Fix the container to identity transform (AABB position)
              const corners = [
                [ptx, pty],
                [pa * pw + ptx, pb * pw + pty],
                [pc * ph + ptx, pd * ph + pty],
                [pa * pw + pc * ph + ptx, pb * pw + pd * ph + pty],
              ];
              const aabbX = Math.min(...corners.map((p) => p[0]));
              const aabbY = Math.min(...corners.map((p) => p[1]));
              (processedNode as any).layout_inset_left = aabbX;
              (processedNode as any).layout_inset_top = aabbY;
              (processedNode as any).rotation = 0;
            }
          }

          // If the node has children, process them recursively
          if (
            !isBoolGeometryGroup &&
            "children" in currentNode &&
            currentNode.children?.length
          ) {
            const childIds = currentNode.children
              .map((c) => {
                return processNode(c, currentNode as FigmaParentNode);
              }) // Process each child
              .filter((child) => child !== undefined) // Remove undefined nodes
              .map((child) => child!.id); // Map to IDs

            // Merge with any geometry children already added by
            // attachGeometryChildrenIfPresent (e.g. VECTOR fill paths +
            // its existing child structure).
            const existing = graph[processedNode.id];
            graph[processedNode.id] = existing
              ? [...existing, ...childIds]
              : childIds;
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
          // When shared buffers are in use, the caller reads imageRefsUsed
          // from the shared Set directly — return empty to avoid copying.
          imageRefsUsed: context._shared_image_refs_used
            ? []
            : Array.from(imageRefsUsed),
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
              ...positioning_trait(node, parent),
              ...fills_trait(node.fills ?? [], context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...rectangular_stroke_width_trait(node as any),
              ...corner_radius_trait(node as any),
              type: "tray",
            } satisfies grida.program.nodes.TrayNode;
          }
          //
          case "COMPONENT":
          case "INSTANCE":
          case "FRAME":
          // Fallback: treat COMPONENT_SET as FRAME for rendering. Grida does not yet
          // support component semantics; proper variant/swap support to be added later.
          case "COMPONENT_SET":
          // Slide IR types (Figma Deck) — structurally identical to frames
          case "X_SLIDE":
          case "X_SLIDE_GRID":
          case "X_SLIDE_ROW": {
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node, parent),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...rectangular_stroke_width_trait(node),
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
              ...positioning_trait(node, parent),
              type: "group",
            } satisfies grida.program.nodes.GroupNode;
          }
          case "TEXT": {
            const figma_text_resizing_model = node.style.textAutoResize;
            const figma_constraints_horizontal = node.constraints?.horizontal;
            const figma_constraints_vertical = node.constraints?.vertical;

            // Fallback for REST API without geometry=paths: use absoluteBoundingBox
            const textAbsBox = node.absoluteBoundingBox;
            const parentAbsBox = parent?.absoluteBoundingBox;

            const fixedwidth = node.size?.x ?? textAbsBox?.width ?? 0;
            const fixedheight = node.size?.y ?? textAbsBox?.height ?? 0;

            let fixedleft: number;
            let fixedtop: number;
            if (node.relativeTransform != null) {
              fixedleft = node.relativeTransform[0][2];
              fixedtop = node.relativeTransform[1][2];
            } else if (textAbsBox != null) {
              fixedleft = textAbsBox.x - (parentAbsBox?.x ?? textAbsBox.x);
              fixedtop = textAbsBox.y - (parentAbsBox?.y ?? textAbsBox.y);
            } else {
              fixedleft = 0;
              fixedtop = 0;
            }

            // Compute right/bottom insets using parent size (prefer size, fall back to absBox)
            const parentWidth = parent?.size?.x ?? parentAbsBox?.width;
            const parentHeight = parent?.size?.y ?? parentAbsBox?.height;
            const fixedright =
              parentWidth != null
                ? parentWidth - fixedleft - fixedwidth
                : undefined;
            const fixedbottom =
              parentHeight != null
                ? parentHeight - fixedtop - fixedheight
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

            const textAlignValue: cg.TextAlign = node.style.textAlignHorizontal
              ? (map.textAlignMap[node.style.textAlignHorizontal] ?? "left")
              : "left";
            const textAlignVerticalValue: cg.TextAlignVertical = node.style
              .textAlignVertical
              ? map.textAlignVerticalMap[node.style.textAlignVertical]
              : "top";

            // Shared layout properties for text nodes
            const textLayoutProps = {
              layout_positioning: "absolute" as const,
              layout_inset_left: constraints.left,
              layout_inset_top: constraints.top,
              layout_inset_right: constraints.right,
              layout_inset_bottom: constraints.bottom,
              layout_target_width:
                !context.prefer_fixed_text_sizing &&
                figma_text_resizing_model === "WIDTH_AND_HEIGHT"
                  ? ("auto" as const)
                  : fixedwidth,
              layout_target_height:
                !context.prefer_fixed_text_sizing &&
                (figma_text_resizing_model === "WIDTH_AND_HEIGHT" ||
                  figma_text_resizing_model === "HEIGHT")
                  ? ("auto" as const)
                  : fixedheight,
            };

            // Helper to convert a REST-format style object into a Grida ITextStyle
            const restStyleToGrida = (
              style: Record<string, unknown>
            ): grida.program.nodes.i.ITextStyle => ({
              font_family: (style.fontFamily as string) ?? "Inter",
              font_size: (style.fontSize as number) ?? DEFAULT_FONT_SIZE,
              font_weight: ((style.fontWeight as cg.NFontWeight) ??
                400) as cg.NFontWeight,
              font_kerning: true,
              text_decoration_line: style.textDecoration
                ? (map.textDecorationMap[
                    style.textDecoration as keyof typeof map.textDecorationMap
                  ] ?? "none")
                : "none",
              line_height: (style as { lineHeightPercentFontSize?: number })
                .lineHeightPercentFontSize
                ? (style as { lineHeightPercentFontSize: number })
                    .lineHeightPercentFontSize / 100
                : undefined,
              letter_spacing: (style.letterSpacing as number)
                ? (style.letterSpacing as number) /
                  ((style.fontSize as number) || DEFAULT_FONT_SIZE)
                : undefined,
              font_postscript_name:
                (style.fontPostScriptName as string) || undefined,
              font_style_italic: (style.italic as boolean) ?? false,
            });

            // Check for rich text (per-character style overrides)
            const charOverrides = (
              node as { characterStyleOverrides?: number[] }
            ).characterStyleOverrides;
            const overrideTable = (
              node as {
                styleOverrideTable?: Record<string, Record<string, unknown>>;
              }
            ).styleOverrideTable;
            const hasRichText =
              charOverrides &&
              charOverrides.length > 0 &&
              charOverrides.some((id: number) => id !== 0) &&
              overrideTable;

            // ── Faux list transform (see faux-list.ts) ──────────────
            // Reads `lineTypes` / `lineIndentations` from the REST node
            // and rewrites the text + style indices to fake list appearance.
            // This is a one-shot approximation — only correct at import
            // time. Text edits after import will NOT update the synthetic
            // bullets/numbering. Disable via `disable_faux_list: true`.
            const restLineTypes = (node as { lineTypes?: FigmaLineType[] })
              .lineTypes;
            const restLineIndentations = (
              node as { lineIndentations?: number[] }
            ).lineIndentations;
            const fauxResult =
              !context.disable_faux_list &&
              node.characters &&
              restLineTypes?.length
                ? applyFauxList({
                    text: node.characters,
                    lineTypes: restLineTypes,
                    lineIndentations: restLineIndentations ?? [],
                  })
                : null;
            // ─────────────────────────────────────────────────────────

            if (hasRichText && node.characters) {
              // Build styled runs from characterStyleOverrides.
              //
              // Figma's `characterStyleOverrides` array may be shorter than
              // `characters` — positions beyond the array use the base style
              // (id 0). We treat out-of-bounds indices as id 0 (base style).

              // When faux-list is active, work with the shifted charOverrides
              // so that styled runs are built against the rewritten text.
              const origCharacters = node.characters;
              const characters = fauxResult?.text ?? origCharacters;
              const effectiveOverrides = fauxResult
                ? shiftCharOverrides(
                    charOverrides,
                    origCharacters,
                    fauxResult.prefixLengths
                  )
                : charOverrides;

              const runs: grida.program.nodes.StyledTextRun[] = [];
              let runStart = 0;
              let currentId = effectiveOverrides[0] ?? 0;

              for (let i = 1; i <= characters.length; i++) {
                // Characters beyond the charOverrides array use base style (0).
                const nextId =
                  i < characters.length
                    ? i < effectiveOverrides.length
                      ? (effectiveOverrides[i] ?? 0)
                      : 0
                    : -1; // sentinel: forces final run to be emitted
                if (nextId !== currentId) {
                  // Emit run [runStart, i)
                  const overrideStyle =
                    currentId !== 0 && overrideTable[String(currentId)]
                      ? overrideTable[String(currentId)]
                      : {};

                  // Merge base style with override
                  const mergedRestStyle = {
                    ...node.style,
                    ...overrideStyle,
                  };
                  const gridaStyle = restStyleToGrida(mergedRestStyle);

                  // Per-run fills from override
                  const overrideFills = (
                    overrideStyle as { fills?: figrest.Paint[] }
                  ).fills;
                  const runFillPaints = overrideFills
                    ? overrideFills
                        .map((p) => convertPaint(p, context, imageRefsUsed))
                        .filter((p): p is cg.Paint => p !== undefined)
                    : undefined;

                  runs.push({
                    start: runStart,
                    end: i,
                    style: gridaStyle,
                    ...(runFillPaints && runFillPaints.length > 0
                      ? { fill_paints: runFillPaints }
                      : {}),
                  });

                  runStart = i;
                  currentId = nextId;
                }
              }

              const defaultStyle = restStyleToGrida(node.style);

              return {
                id: gridaId,
                ...base_node_trait(node),
                ...fills_trait(node.fills, context, imageRefsUsed),
                ...text_stroke_trait(node, context, imageRefsUsed),
                ...style_trait({}),
                ...effects_trait(node.effects),
                type: "text",
                text: characters,
                default_style: defaultStyle,
                styled_runs: runs,
                ...textLayoutProps,
                text_align: textAlignValue,
                text_align_vertical: textAlignVerticalValue,
              } satisfies grida.program.nodes.AttributedTextNode;
            }

            return {
              id: gridaId,
              ...base_node_trait(node),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...text_stroke_trait(node, context, imageRefsUsed),
              ...style_trait({}),
              ...effects_trait(node.effects),
              type: "tspan",
              text: fauxResult?.text ?? node.characters,
              ...textLayoutProps,
              text_align: textAlignValue,
              text_align_vertical: textAlignVerticalValue,
              text_decoration_line: node.style.textDecoration
                ? (map.textDecorationMap[node.style.textDecoration] ?? "none")
                : "none",
              line_height: node.style.lineHeightPercentFontSize
                ? node.style.lineHeightPercentFontSize / 100
                : 1.2,
              // letter spacing in rest api is always in px.
              letter_spacing: node.style.letterSpacing
                ? node.style.letterSpacing /
                  (node.style.fontSize || DEFAULT_FONT_SIZE)
                : 0,
              font_size: node.style.fontSize ?? 0,
              font_family: node.style.fontFamily,
              font_weight:
                (node.style.fontWeight as cg.NFontWeight) ?? (400 as const),
              font_postscript_name: node.style.fontPostScriptName || undefined,
              font_style_italic: node.style.italic ?? false,
              font_kerning: true,
            };
          }
          case "RECTANGLE":
          case "ELLIPSE": {
            // When prefer_path_for_geometry is enabled and the node has
            // geometry paths with a non-identity relativeTransform, convert
            // to a GroupNode so processNodeWithGeometryTrait will bake the
            // transform into the path data. This avoids the radians/degrees
            // mismatch in from_box_center for rotated/flipped leaf nodes.
            const shapeHasGeometry =
              context.prefer_path_for_geometry === true &&
              ((node.fillGeometry?.length ?? 0) > 0 ||
                (node.strokeGeometry?.length ?? 0) > 0);
            const shapeRt = node.relativeTransform;
            const shapeHasTransform =
              shapeRt != null &&
              (Math.abs(shapeRt[0][0] - 1) > 1e-6 ||
                Math.abs(shapeRt[1][1] - 1) > 1e-6 ||
                Math.abs(shapeRt[0][1]) > 1e-6 ||
                Math.abs(shapeRt[1][0]) > 1e-6);
            if (shapeHasGeometry && shapeHasTransform) {
              return {
                id: gridaId,
                ...base_node_trait(node),
                ...positioning_trait(node, parent),
                type: "group",
              } satisfies grida.program.nodes.GroupNode;
            }
            if (node.type === "RECTANGLE") {
              return {
                id: gridaId,
                ...base_node_trait(node),
                ...positioning_trait(node, parent),
                ...fills_trait(node.fills, context, imageRefsUsed),
                ...stroke_trait(node, context, imageRefsUsed),
                ...rectangular_stroke_width_trait(node),
                ...corner_radius_trait(node),
                ...effects_trait(node.effects),
                type: "rectangle",
              } satisfies grida.program.nodes.RectangleNode;
            }
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node, parent),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...arc_data_trait(node),
              ...effects_trait(node.effects),
              type: "ellipse",
            } satisfies grida.program.nodes.EllipseNode;
          }
          case "BOOLEAN_OPERATION": {
            // When geometry=paths is available and prefer_path_for_geometry is
            // set, the boolean result is already baked into fillGeometry /
            // strokeGeometry — emit a GroupNode so
            // attachGeometryChildrenIfPresent will attach the path children.
            const boolHasGeometry =
              context.prefer_path_for_geometry === true &&
              ((node.fillGeometry?.length ?? 0) > 0 ||
                (node.strokeGeometry?.length ?? 0) > 0);
            if (boolHasGeometry) {
              return {
                id: gridaId,
                ...base_node_trait(node),
                ...positioning_trait(node, parent),
                type: "group",
              } satisfies grida.program.nodes.GroupNode;
            }
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...positioning_trait(node, parent),
              ...fills_trait(node.fills, context, imageRefsUsed),
              ...stroke_trait(node, context, imageRefsUsed),
              ...effects_trait(node.effects),
              type: "boolean",
              op: mapBooleanOperation(node.booleanOperation),
            } satisfies grida.program.nodes.BooleanPathOperationNode;
          }
          case "LINE": {
            // Fallback for REST API without geometry=paths: use absoluteBoundingBox
            const lineAbsBox = (node as any).absoluteBoundingBox as
              | { x: number; y: number; width: number; height: number }
              | null
              | undefined;
            const lineParentAbsBox = parent?.absoluteBoundingBox;
            let lineLeft: number;
            let lineTop: number;
            if (node.relativeTransform != null) {
              lineLeft = node.relativeTransform[0][2];
              lineTop = node.relativeTransform[1][2];
            } else if (lineAbsBox != null) {
              lineLeft = lineAbsBox.x - (lineParentAbsBox?.x ?? lineAbsBox.x);
              lineTop = lineAbsBox.y - (lineParentAbsBox?.y ?? lineAbsBox.y);
            } else {
              lineLeft = 0;
              lineTop = 0;
            }
            return {
              id: gridaId,
              ...base_node_trait(node),
              ...stroke_trait(node, context, imageRefsUsed),
              ...effects_trait(node.effects),
              type: "line",
              layout_positioning: "absolute",
              layout_inset_left: lineLeft,
              layout_inset_top: lineTop,
              layout_target_width: node.size?.x ?? lineAbsBox?.width ?? 0,
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
            // prefer_path_for_geometry takes priority: when true, always use fillGeometry/strokeGeometry (Path nodes) even if vectorNetwork is available.
            const useRestVectorNetwork =
              context.prefer_path_for_geometry !== true &&
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
                    ...positioning_trait(node, parent),
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
              ...positioning_trait(node, parent),
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
              ...positioning_trait(node, parent),
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
              ...positioning_trait(node, parent),
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
              ...positioning_trait(node, parent),
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
          // Per-side stroke weights (Figma Kiwi: borderStrokeWeightsIndependent)
          ...(nc.borderStrokeWeightsIndependent
            ? {
                individualStrokeWeights: {
                  top: nc.borderTopWeight ?? nc.strokeWeight ?? 0,
                  right: nc.borderRightWeight ?? nc.strokeWeight ?? 0,
                  bottom: nc.borderBottomWeight ?? nc.strokeWeight ?? 0,
                  left: nc.borderLeftWeight ?? nc.strokeWeight ?? 0,
                },
              }
            : {}),
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
       * Find FontMetaData entry matching the given FontName.
       *
       * FontMetaData is the authoritative source for fontWeight and italic; fontName.style
       * alone cannot reliably derive CSS semantics. Match by key (family + style); for
       * single-style text, fontMetaData[0] typically applies.
       *
       * @see https://grida.co/docs/wg/feat-fig/glossary/fig.kiwi — Text & Font section
       */
      function findFontMetaDataEntry(
        fontMetaData: figkiwi.FontMetaData[] | undefined,
        fontName: figkiwi.FontName | undefined
      ): figkiwi.FontMetaData | undefined {
        if (!fontMetaData?.length || !fontName) return undefined;
        const match =
          fontMetaData.find(
            (m) =>
              m.key?.family === fontName.family &&
              m.key?.style === fontName.style
          ) ?? fontMetaData[0];
        return match;
      }

      /**
       * TypePropertiesTrait - Text-specific properties
       */
      /**
       * Build a REST-compatible style object from a Kiwi NodeChange (shared
       * between the base node style and per-run overrides).
       */
      function kiwi_rest_style_from_nc(
        nc: figkiwi.NodeChange,
        fontMetaData: figkiwi.FontMetaData[] | undefined
      ) {
        const fontMeta = findFontMetaDataEntry(fontMetaData, nc.fontName);
        const fontWeight = (fontMeta?.fontWeight ?? 400) as cg.NFontWeight;
        const italic = fontMeta?.fontStyle === "ITALIC";
        return {
          fontFamily: nc.fontName?.family ?? "Inter",
          fontPostScriptName: nc.fontName?.postscript
            ? nc.fontName.postscript
            : undefined,
          fontWeight,
          italic,
          fontSize: nc.fontSize ?? 12,
          textAlignHorizontal: nc.textAlignHorizontal ?? "LEFT",
          textAlignVertical: nc.textAlignVertical ?? "TOP",
          letterSpacing:
            nc.letterSpacing?.units === "PERCENT"
              ? (nc.letterSpacing.value / 100) *
                (nc.fontSize ?? DEFAULT_FONT_SIZE)
              : nc.letterSpacing?.units === "PIXELS"
                ? nc.letterSpacing.value
                : (nc.letterSpacing?.value ?? 0),
          lineHeightPx:
            nc.lineHeight?.units === "PIXELS" ? nc.lineHeight.value : undefined,
          lineHeightPercent:
            nc.lineHeight?.units === "PERCENT"
              ? nc.lineHeight.value
              : undefined,
          lineHeightPercentFontSize:
            nc.lineHeight?.units === "PERCENT" ? nc.lineHeight.value : 100,
          textAutoResize: nc.textAutoResize ?? "WIDTH_AND_HEIGHT",
          textCase:
            nc.textCase === "ORIGINAL" ? undefined : (nc.textCase ?? undefined),
          textDecoration: nc.textDecoration ?? "NONE",
        };
      }

      function kiwi_text_style_trait(nc: figkiwi.NodeChange) {
        const characters = nc.textData?.characters ?? "";
        const fontMetaData =
          nc.derivedTextData?.fontMetaData ?? nc.textData?.fontMetaData;

        const style = kiwi_rest_style_from_nc(nc, fontMetaData);

        // Parse per-character style overrides from Kiwi textData
        const charStyleIDs = nc.textData?.characterStyleIDs;
        const kiwiOverrideTable = nc.textData?.styleOverrideTable;
        let characterStyleOverrides: number[] = [];
        const styleOverrideTable: Record<string, Record<string, unknown>> = {};

        if (
          charStyleIDs?.length &&
          kiwiOverrideTable?.length &&
          charStyleIDs.some((id) => id !== 0)
        ) {
          characterStyleOverrides = charStyleIDs;
          // Build the REST-format styleOverrideTable from the Kiwi array.
          // Kiwi ID 0 means "base style" (no override). Non-zero IDs are
          // matched by the `styleID` field inside each override entry — the
          // array index does NOT necessarily equal `id - 1`.
          const kiwiOverrideByStyleID = new Map<
            number,
            (typeof kiwiOverrideTable)[number]
          >();
          for (const entry of kiwiOverrideTable) {
            if (entry.styleID !== undefined) {
              kiwiOverrideByStyleID.set(entry.styleID, entry);
            }
          }
          const seenIds = new Set(charStyleIDs.filter((id) => id !== 0));
          for (const id of seenIds) {
            const overrideNc =
              kiwiOverrideByStyleID.get(id) ?? kiwiOverrideTable[id - 1];
            if (!overrideNc) continue;
            // Only include properties that are actually set in the override.
            // Kiwi overrides are sparse — unset fields mean "inherit from base".
            const o: Record<string, unknown> = {};
            if (overrideNc.fontName?.family) {
              o.fontFamily = overrideNc.fontName.family;
              const fm = findFontMetaDataEntry(
                fontMetaData,
                overrideNc.fontName
              );
              if (fm?.fontWeight !== undefined) o.fontWeight = fm.fontWeight;
              if (fm?.fontStyle === "ITALIC") o.italic = true;
            }
            if (overrideNc.fontName?.postscript)
              o.fontPostScriptName = overrideNc.fontName.postscript;
            if (overrideNc.fontSize !== undefined)
              o.fontSize = overrideNc.fontSize;
            if (overrideNc.textDecoration !== undefined)
              o.textDecoration = overrideNc.textDecoration;
            if (
              overrideNc.textCase !== undefined &&
              overrideNc.textCase !== "ORIGINAL"
            )
              o.textCase = overrideNc.textCase;
            if (overrideNc.letterSpacing !== undefined) {
              const ls = overrideNc.letterSpacing;
              const fs =
                overrideNc.fontSize ?? nc.fontSize ?? DEFAULT_FONT_SIZE;
              o.letterSpacing =
                ls.units === "PERCENT"
                  ? (ls.value / 100) * fs
                  : ls.units === "PIXELS"
                    ? ls.value
                    : (ls.value ?? 0);
            }
            if (overrideNc.lineHeight !== undefined) {
              const lh = overrideNc.lineHeight;
              if (lh.units === "PIXELS") o.lineHeightPx = lh.value;
              if (lh.units === "PERCENT") {
                o.lineHeightPercent = lh.value;
                o.lineHeightPercentFontSize = lh.value;
              }
            }
            if (overrideNc.fillPaints) o.fills = paints(overrideNc.fillPaints);
            if (overrideNc.strokePaints)
              o.strokes = paints(overrideNc.strokePaints);
            if (overrideNc.strokeWeight !== undefined)
              o.strokeWeight = overrideNc.strokeWeight;
            styleOverrideTable[String(id)] = o;
          }
        }

        // Derive lineTypes / lineIndentations from Kiwi textData.lines
        // (previously hardcoded as [] — see faux-list.ts for why we need these).
        // NOTE: Kiwi LineType also includes "BLOCKQUOTE" and "HEADER" which
        // have no REST API equivalent and no Grida representation — they map
        // to "NONE" here (silently dropped).
        const kiwiLines = nc.textData?.lines;
        const lineTypes: ("NONE" | "ORDERED" | "UNORDERED")[] = [];
        const lineIndentations: number[] = [];
        if (kiwiLines?.length) {
          for (const ld of kiwiLines) {
            switch (ld.lineType) {
              case "ORDERED_LIST":
                lineTypes.push("ORDERED");
                break;
              case "UNORDERED_LIST":
                lineTypes.push("UNORDERED");
                break;
              default: // PLAIN, BLOCKQUOTE, HEADER → NONE
                lineTypes.push("NONE");
                break;
            }
            lineIndentations.push(ld.indentationLevel ?? 0);
          }
        }

        return {
          characters,
          fills: nc.fillPaints ? paints(nc.fillPaints) : [],
          strokes: nc.strokePaints ? paints(nc.strokePaints) : [],
          strokeWeight: nc.strokeWeight ?? 0,
          strokeAlign: nc.strokeAlign
            ? map.strokeAlign(nc.strokeAlign)
            : "INSIDE",
          style,
          characterStyleOverrides,
          styleOverrideTable,
          lineTypes,
          lineIndentations,
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
          ...kiwi_has_export_settings_trait(nc),
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
          ...kiwi_has_export_settings_trait(nc),
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
          ...kiwi_has_export_settings_trait(nc),
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
          ...kiwi_has_export_settings_trait(nc),
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
            ...kiwi_has_export_settings_trait(nc),
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
       * Convert Kiwi SLIDE / INTERACTIVE_SLIDE_ELEMENT to X_SLIDE IR.
       * Reuses the same trait pipeline as frame().
       */
      function slide(nc: figkiwi.NodeChange): __ir.SlideNodeIR | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;
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
          type: "X_SLIDE",
          slideMetadata: {
            speakerNotes: nc.slideSpeakerNotes ?? undefined,
            isSkipped: nc.isSkippedSlide ?? undefined,
            slideNumber: nc.slideNumber ?? undefined,
          },
        } as __ir.SlideNodeIR;
      }

      /**
       * Convert Kiwi SLIDE_GRID to X_SLIDE_GRID IR.
       */
      function slideGrid(
        nc: figkiwi.NodeChange
      ): __ir.SlideGridNodeIR | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;
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
          type: "X_SLIDE_GRID",
        } as __ir.SlideGridNodeIR;
      }

      /**
       * Convert Kiwi SLIDE_ROW to X_SLIDE_ROW IR.
       */
      function slideRow(
        nc: figkiwi.NodeChange
      ): __ir.SlideRowNodeIR | undefined {
        if (!nc.guid || !nc.name || !nc.size) return undefined;
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
          type: "X_SLIDE_ROW",
        } as __ir.SlideRowNodeIR;
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
          ...kiwi_has_export_settings_trait(nc),
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
          ...kiwi_has_export_settings_trait(nc),
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
                ...kiwi_has_export_settings_trait(nc),
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
          ...kiwi_has_export_settings_trait(nc),
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
          ...kiwi_has_export_settings_trait(nc),
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
          ...kiwi_has_export_settings_trait(nc),
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
          ...kiwi_has_export_settings_trait(nc),
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
        | __ir.SlideNodeIR
        | __ir.SlideGridNodeIR
        | __ir.SlideRowNodeIR
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
          case "SLIDE":
          case "INTERACTIVE_SLIDE_ELEMENT":
            return slide(nodeChange);
          case "SLIDE_GRID":
            return slideGrid(nodeChange);
          case "SLIDE_ROW":
            return slideRow(nodeChange);
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
     * Parse and extract pages from a .fig file stream.
     * Supports .fig (ZIP) archives larger than 2GB by streaming instead of loading into memory.
     * @param stream - Async iterable of Uint8Array chunks (e.g. Node Readable, fetch body)
     * @returns Document with pages ready for import
     */
    export async function parseFileFromStream(
      stream: AsyncIterable<Uint8Array>,
      options: BuildTreeOptions = {}
    ): Promise<FigFileDocument> {
      const figData = await readFigFileFromStream(stream);
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

      const canvasBg = page.canvas.backgroundColor;
      const background_color = canvasBg
        ? kolor.colorformats.newRGBA32F(
            canvasBg.r,
            canvasBg.g,
            canvasBg.b,
            canvasBg.a
          )
        : undefined;

      const individualResults = page.rootNodes.map((rootNode) =>
        iofigma.restful.factory.document(rootNode, {}, sharedContext)
      );

      if (individualResults.length === 1) {
        const result = individualResults[0];
        result.document.scene.background_color = background_color;
        return result;
      }

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
          background_color,
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
