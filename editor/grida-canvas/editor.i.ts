import type {
  Action,
  TCanvasEventTargetDragGestureState,
} from "@/grida-canvas/action";
import type { BitmapEditorBrush, BitmapLayerEditor } from "@grida/bitmap";
import type cg from "@grida/cg";
import type { SnapResult } from "@grida/cmath/_snap";
import type { tokens } from "@grida/tokens";
import type { NodeProxy } from "./editor";
import type { GoogleWebFontList } from "@grida/fonts/google";
import { dq } from "./query";
import cmath from "@grida/cmath";
import vn from "@grida/vn";
import grida from "@grida/schema";
import tree from "@grida/tree";
import type { io } from "@grida/io";

export namespace editor {
  export type EditorContentRenderingBackend = "dom" | "canvas";

  /**
   * Creates a throttled function that only invokes the provided function at most once per every `limit` milliseconds.
   * When `options.trailing` is true, the function will be called one more time after the limit period to ensure the last change is processed.
   *
   * @param func - The function to throttle
   * @param limit - The time limit in milliseconds
   * @param options - Configuration options for the throttle behavior
   * @param options.trailing - Whether to invoke the function one more time after the limit period. Defaults to false.
   * @returns A throttled version of the provided function
   *
   * @example
   * ```ts
   * const throttledFn = throttle((x) => console.log(x), 1000, { trailing: true });
   * throttledFn(1); // logs: 1
   * throttledFn(2); // ignored
   * throttledFn(3); // ignored
   * // after 1000ms
   * // logs: 3 (because trailing is true)
   * ```
   */
  export function throttle<T extends (...args: any[]) => void>(
    func: T,
    limit: number,
    options: {
      trailing?: boolean;
    } = { trailing: false }
  ): T {
    let inThrottle: boolean;
    let lastArgs: Parameters<T> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return function (this: any, ...args: Parameters<T>) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        timeoutId = setTimeout(() => {
          inThrottle = false;
          if (options.trailing && lastArgs) {
            func.apply(this, lastArgs);
            lastArgs = null;
          }
        }, limit);
      } else if (options.trailing) {
        lastArgs = args;
      }
    } as T;
  }

  /**
   * Mutual exclusion (reentrancy guard) for JavaScript.
   *
   * Ensures that only one callback is executed at a time within the same call stack.
   * If the mutex is already active, the main callback is skipped and the optional
   * `elseCb` will be executed instead.
   *
   * This is synchronous-only:
   * - Do not `await` inside the critical section — the lock will be released before
   *   the awaited code runs.
   * - Use this to prevent feedback loops when binding two reactive sources
   *   (e.g. Monaco editor <-> Yjs).
   *
   * @example
   * ```ts
   * const mutex = createMutex()
   *
   * mutex(() => {
   *   console.log("outer")
   *   mutex(() => {
   *     // This will be skipped, because the mutex is locked.
   *     console.log("inner")
   *   }, () => {
   *     console.log("else branch called instead")
   *   })
   * })
   *
   * mutex(() => {
   *   console.log("second outer") // will run after lock is released
   * })
   * ```
   */
  export type Mutex = (
    /**
     * Function executed only if the mutex is currently free.
     */
    cb: () => void,
    /**
     * Optional function executed if the mutex is already locked
     * (i.e. the call is reentrant).
     */
    elseCb?: () => void
  ) => void;

  /**
   * Create a new mutex function.
   *
   * @returns {Mutex} A function that enforces mutual exclusion.
   */
  export function createMutex(): Mutex {
    let token = true;
    return (cb: () => void, elseCb?: () => void): void => {
      if (token) {
        token = false;
        try {
          cb();
        } finally {
          token = true;
        }
      } else if (elseCb) {
        elseCb();
      }
    };
  }

  export type NodeID = grida.program.nodes.NodeID;

  /**
   * a global class based editor instances
   *
   * @deprecated move under class
   */
  export const __global_editors = {
    bitmap: null as BitmapLayerEditor | null,
  };

  /**
   * generic store subscription trait.
   *
   * this is commonly used for binding to a ui-store consumer, e.g. with react useSyncExternalStore
   */
  export interface IStoreSubscriptionTrait<Snapshot> {
    subscribe: (onStoreChange: () => void) => () => void;
    getSnapshot: () => Snapshot;
  }
}

export namespace editor.config {
  export interface IEditorConfig {
    /**
     * when editable is false, the document definition is not editable
     * set editable false on production context - end-user-facing context
     */
    editable: boolean;
    debug: boolean;

    /**
     * when user tries to remove a node that is not removable (removable=false) or tries to remove root node that is required by constraints, this is the behavior
     *
     * - `ignore` - ignore the action
     * - `deactivate` - deactivate the node (set active=false)
     * - `force` - force remove the node (even if it's not removable) (this may cause unexpected behavior or cause system to crash)
     * - `throw` - throw an error
     */
    when_not_removable: "ignore" | "deactivate" | "force" | "throw";

    flags: {
      /**
       * enable / disable the brush feature
       * - brush / eraser tool
       *
       * @default "off"
       */
      __unstable_brush_tool: "on" | "off";
    };

    /**
     * base quantization step for rotation in degrees
     *
     * @default 1
     */
    rotation_quantize_step: number;
  }

  /**
   * TODO: implement this
   */
  export interface IEditorRenderingConfig {
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-synthesis
     */
    font_synthesis: {
      /**
       * renderer allows fake italic
       */
      faux_italic: boolean;

      /**
       * renderer allows fake weight
       */
      faux_weight: boolean;
    };

    /**
     * Paint constraints that determine whether nodes should use single paint properties
     * or multiple paint arrays based on the rendering backend.
     *
     * - For DOM backend: Uses single paint properties (`"fill"`, `"stroke"`) for compatibility
     * - For Canvas backend: Uses multiple paint arrays (`"fills"`, `"strokes"`) for advanced rendering
     *
     * @example
     * ```typescript
     * // DOM backend constraints
     * paint_constraints: {
     *   fill: "fill",    // Creates nodes with single fill property
     *   stroke: "stroke" // Creates nodes with single stroke property
     * }
     *
     * // Canvas backend constraints
     * paint_constraints: {
     *   fill: "fills",    // Creates nodes with fills array
     *   stroke: "strokes" // Creates nodes with strokes array
     * }
     * ```
     */
    paint_constraints: {
      fill: "fill" | "fills";
      stroke: "stroke" | "strokes";
    };
  }

  /**
   * {@link https://grida.co/docs/editor/canvas-languages-and-fonts.md | languages and fonts}
   */
  export namespace fonts {
    export const DEFAULT_FONT_FAMILY = "Inter";
    export const DEFAULT_FONT_WEIGHT = 400;
    export const DEFAULT_FONT_SIZE = 14;

    export const DEFAULT_TEXT_STYLE_INTER: grida.program.nodes.i.ITextStyle = {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontPostscriptName: null,
      fontStyleItalic: false,
      fontFeatures: {},
      fontOpticalSizing: "auto",
      fontWeight: DEFAULT_FONT_WEIGHT,
      fontKerning: true,
      fontSize: DEFAULT_FONT_SIZE,
      textDecorationLine: "none",
    };

    const PLATFORM_FONTS = {
      Inter: {
        family: "Inter",
        scripts: ["latn", "cyrl", "grek"],
      },
      Noto_Sans_KR: {
        family: "Noto Sans KR",
        scripts: ["latn", "hang", "kana", "hani", "grek", "cyrl"],
      },
      Noto_Sans_JP: {
        family: "Noto Sans JP",
        scripts: ["latn", "kana", "hani", "cyrl", "grek"],
      },
      Noto_Sans_SC: {
        family: "Noto Sans SC",
        scripts: ["latn", "hani", "kana", "cyrl", "grek"],
      },
    };

    // latin / cyrl
    export const DEFAULT_FONT_FALLBACK_LATN =
      "Inter" as keyof typeof PLATFORM_FONTS;
    export const DEFAULT_FONT_FALLBACK_CYRL =
      "Inter" as keyof typeof PLATFORM_FONTS;
    export const DEFAULT_FONT_FALLBACK_GREK =
      "Inter" as keyof typeof PLATFORM_FONTS;

    // CJK
    export const DEFAULT_FONT_FALLBACK_KR =
      "Noto Sans KR" as keyof typeof PLATFORM_FONTS;
    export const DEFAULT_FONT_FALLBACK_JP =
      "Noto Sans JP" as keyof typeof PLATFORM_FONTS;
    export const DEFAULT_FONT_FALLBACK_CN =
      "Noto Sans SC" as keyof typeof PLATFORM_FONTS;

    // export const DEFAULT_FONT_FALLBACK_TW = "Noto Sans TC";
    // export const DEFAULT_FONT_FALLBACK_HK = "Noto Sans HK";
    export const DEFAULT_FONT_FALLBACK_SET = new Set([
      DEFAULT_FONT_FALLBACK_LATN,
      DEFAULT_FONT_FALLBACK_CYRL,
      DEFAULT_FONT_FALLBACK_GREK,
      DEFAULT_FONT_FALLBACK_KR,
      DEFAULT_FONT_FALLBACK_JP,
      DEFAULT_FONT_FALLBACK_CN,
    ]);

    // Hebrew
    // export const DEFAULT_FONT_FALLBACK_HE = "Noto Sans Hebrew";

    /**
     * this does not indicates the "language", rather a script tag specified by the font.
     * there is no short way to map the language-font, this is good enough for embedding purposes.
     * e.g. `latn` also may or may not include Vietnamese, etc.
     *
     * this is level 1 implementation of font-fallback, see {@link https://grida.co/docs/wg/feat-paragraph/impl-font-fallback | wg font-fallback}
     */
    export const DEFAULT_FONT_SCRIPTS = [
      "latn",
      "cyrl",
      "grek",
      "hang",
      "kana",
      "hani",
    ];
  }

  /**
   * The tolerance for the gap alignment, if each gap is within this tolerance, it is considered aligned.
   *
   * It's 1 because, we quantize the position to 1px, so each gap diff on aligned nodes is not guaranteed to be exactly 0.
   *
   * 1.001 because the surface measurement is can get slighly off due to the transform matrix calculation.
   */
  export const DEFAULT_GAP_ALIGNMENT_TOLERANCE = 1.01;

  /**
   * The camera movement to be multiplied when panning with keyboard input.
   */
  export const DEFAULT_CAMERA_KEYBOARD_MOVEMENT = 50;

  /**
   * The base snap threshold (in px) used during a real pointer movement (drag gesture).
   *
   * In practice, the final threshold often scales inversely with the current zoom level:
   *
   * ```ts
   * const threshold = Math.ceil(DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR / zoom);
   * ```
   *
   * At higher zoom levels, the threshold becomes smaller for more precise snapping;
   * at lower zoom levels, it grows for a smoother user experience.
   */
  export const DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR = 5;

  export const DEFAULT_CANVAS_TRANSFORM_SCALE_MIN = 0.02;
  export const DEFAULT_CANVAS_TRANSFORM_SCALE_MAX = 256;

  /**
   * snap threshold applyed when nudge (fake gesture) is applied
   */
  export const DEFAULT_SNAP_NUDGE_THRESHOLD = 0.5;

  /**
   * the tolerance for the vector geometry vertex (when cleaning the vector geometry)
   * @deprecated - will be removed
   *
   * set this to 0, otherwise, it will cause small flatten text to be malformed after editing.
   */
  export const DEFAULT_VECTOR_GEOMETRY_VERTEX_TOLERANCE = 0.0;

  /**
   * Default optimization configuration for vector networks.
   */
  export const DEFAULT_VECTOR_OPTIMIZATION_CONFIG: vn.OptimizationConfig = {
    vertex_tolerance: DEFAULT_VECTOR_GEOMETRY_VERTEX_TOLERANCE,
    remove_unused_verticies: true,
  };

  /**
   * default quantization step for rotation gestures (in degrees)
   */
  export const DEFAULT_ROTATION_QUANTIZE_STEP = 1;

  export const DEFAULT_HIT_TESTING_CONFIG: state.HitTestingConfig = {
    target: "auto",
    ignores_root_with_children: true,
    ignores_locked: true,
  };

  /**
   * Specialized hit testing configuration for measurement targeting.
   *
   * Measurement needs to include root containers in the result so we
   * override the default behaviour that ignores roots with children.
   */
  export const MEASUREMENT_HIT_TESTING_CONFIG: Partial<state.HitTestingConfig> =
    {
      ignores_root_with_children: false,
    };

  export const DEFAULT_GESTURE_MODIFIERS: state.GestureModifiers = {
    translate_with_hierarchy_change: "on",
    translate_with_clone: "off",
    tarnslate_with_axis_lock: "off",
    translate_with_force_disable_snap: "off",
    transform_with_center_origin: "off",
    transform_with_preserve_aspect_ratio: "off",
    path_keep_projecting: "off",
    rotate_with_quantize: "off",
    curve_tangent_mirroring: "auto",
    padding_with_axis_mirroring: "off",
  };

  export const DEFAULT_BRUSH: state.CurrentBrush = {
    name: "Default",
    hardness: 1,
    size: [4, 4],
    spacing: 0,
    opacity: 1,
  };

  export const DEFAULT_FE_SHADOW: cg.IFeShadow = {
    color: { r: 0, g: 0, b: 0, a: 0.25 },
    dx: 0,
    dy: 4,
    blur: 4,
    spread: 0,
  };

  export const DEFAULT_FE_GAUSSIAN_BLUR: cg.IFeGaussianBlur = {
    radius: 4,
  };

  export const DEFAULT_FE_PROGRESSIVE_BLUR: cg.IFeProgressiveBlur = {
    x1: 0.5,
    y1: 0,
    x2: 0.5,
    y2: 1,
    radius: 0,
    radius2: 4,
  };

  export const DEFAULT_FE_LIQUID_GLASS: Omit<cg.FeLiquidGlass, "type"> = {
    lightIntensity: 0.9,
    lightAngle: 45.0,
    refraction: 0.8, // Normalized [0.0-1.0], maps to IOR [1.0-2.0]
    depth: 20.0, // Absolute pixels [1.0+], typical values: 20-100
    dispersion: 0.5,
    radius: 4.0, // Renamed from radius, in pixels
  };

  export const DEFAULT_MAX_STROKE_WIDTH = 1000;
  export const DEFAULT_MAX_BLUR_RADIUS = 250;
  export const DEFAULT_MAX_SHADOW_OFFSET = 10000;
  export const DEFAULT_MAX_SHADOW_SPREAD = 1000;
  export const DEFAULT_MAX_LIQUID_GLASS_DEPTH = 200.0; // Absolute pixels: max depth
  export const DEFAULT_MAX_LIQUID_GLASS_BLUR_RADIUS = 50; // Renamed from radius
}

export namespace editor.font_spec {
  export type FontStyleKey = {
    fontFamily: string;
    fontPostscriptName: string;
    fontInstancePostscriptName: string | null;
    fontStyleName: string;
    fontStyleItalic: boolean;
    fontWeight: number;
  };

  /**
   * key2str and str2key for font style change key
   *
   * useful when inlining
   */
  export const fontStyleKey = {
    key2str: (key: FontStyleKey): string => {
      return JSON.stringify(key);
    },
    str2key: (str: string): FontStyleKey | null => {
      return JSON.parse(str) ?? null;
    },
  };

  /**
   * the Axis data defined by the family (group of ttf)
   *
   * this holds common axes (by the spec, the axes spec should be the same for all faces under same family)
   * the default value vary by the face, its not included
   */
  interface UIFontFamilyAxis {
    tag: string;
    min: number;
    max: number;
  }

  /**
   * the Axis data defined by the face (ttf)
   */
  export interface UIFontFaceAxis {
    tag: string;
    min: number;
    max: number;
    def: number;
    name: string;
  }

  export type UIFontFaceInstance = {
    name: string;
    coordinates: Record<string, number>;
    postscriptName: string | null;
  };

  export type UIFontFaceFeature = {
    tag: string;
    name: string;
    glyphs: string[];
  };

  /**
   * UIFontData is a reliable data container, that is per-ttf, processed through ttf-parser
   */
  export type UIFontFaceData = {
    postscriptName: string;
    instances: UIFontFaceInstance[];
    axes?: { [tag: string]: UIFontFaceAxis };
    /**
     * the feature spec by the font face GSUB/GPOS
     * this is not a 100% accurate representation of features, as there can be multiple feature definition by same tag, with different language/script/source table.
     *
     * as this is non-essential for ui display, we have it as de-duplicated way.
     *
     * @internal
     * re visit this as needed for super-advanced use cases.
     */
    features: { [tag: string]: UIFontFaceFeature };
    italic: boolean;
  };

  export type UIFontFamily = {
    /**
     * the name of the font family, non-normalized
     */
    family: string;

    /**
     * the axis is present when the font is a variable font
     * the axes defines the shared AND all-available axes
     *
     * if the user's input is invalid, and if the givven list of ttf does not share the same axes, this will only contain the shared axes, with the same spec (min/max)
     * this axes does not include the `def` (default) as it is expected to have different default value per ttf.
     */
    // TODO: make it Record<string, UIFontFamilyAxis>
    axes?: UIFontFamilyAxis[];

    faces: UIFontFaceData[];

    styles: FontStyleInstance[];
  };

  export type UIVendorGoogleFontFamily = UIFontFamily & {
    variants: string[];
    files: {
      [key: string]: string;
    };
    subsets: string[];
  };

  /**
   * if from a variable font, this describes a single instance of a fvar.instances
   * if from a static font, this describes a single face of a font family
   */
  export type FontStyleInstance = {
    fontFamily: string;

    /**
     * uses subfamily name for static font, instance name for variable font
     *
     * this is suitable for runtime identifier (as postscript name can be null)
     * we should not rely on style name as persistable identifier.
     */
    fontStyleName: string;

    /**
     * the postscript name of the current font face
     */
    fontPostscriptName: string;

    /**
     * the postscript name of the current font style, either instance.postscriptName (variable) or face.postscriptName (static)
     */
    fontInstancePostscriptName: string | null;
    /**
     * if the face is italic (by OS/2 or by vendor specified)
     */
    fontStyleItalic: boolean;

    /**
     * the weight of the font style
     * for static font, this is the weight class of the face
     * for variable font, this is the `wght` of the instance, if `wght` not supported, it fallbacks to weight class of the face
     */
    fontWeight: number;
  };
}

export namespace editor.state {
  /**
   * used for "repeated duplicate", where accumulating the delta between the original and the clone, forwarding that delta to the next clone.
   *
   * [accumulated duplicate]
   * - [set]
   *    - as clone / duplicate happens, we save each id of original and duplicated.
   * - [reset]
   *    - whenever the active clone is considered no longer valid, e.g. when origianl is deleted. (to detect this easily we use a strict diff of the selection change)
   *    - the current history change shall only contain the diff of the clone, otherwise, reset.
   *      - this includes the selection change.
   *      - as long as the history (change) is made within the clone, it kept valid.
   *    - as history changes backward, reset. (accumulated duplicate related states are reset (set null) as history goes backward)
   *    - as the focus (selection) changes, reset.
   *
   * **Note:** currently we simply reset whenever selection is changed.
   * => this is enough for now, but as we support api access, we'll actually need to track the change.
   */
  export type ActiveDuplication = {
    origins: grida.program.nodes.NodeID[];
    clones: grida.program.nodes.NodeID[];
  };

  /**
   * Indication of the dropzone
   *
   * - type: "node" - dropzone is a node
   * - type: "rect" - dropzone is a rect (in canvas space)
   */
  export type DropzoneIndication =
    | {
        type: "node";
        node_id: string;
      }
    | {
        type: "rect";
        rect: cmath.Rectangle;
      };

  export type CurrentBrush = BitmapEditorBrush & { opacity: number };

  export type ToolModeType = ToolMode["type"];

  export type VariableWidthTool = {
    type: "width";
  };

  export type BendTool = {
    type: "bend";
  };

  export type PenPathTool = {
    type: "path";
  };

  export type ToolMode =
    | {
        type: "cursor";
      }
    | {
        type: "hand";
      }
    | {
        type: "lasso";
      }
    | BendTool
    | VariableWidthTool
    | PenPathTool
    | {
        type: "zoom";
      }
    | {
        type: "insert";
        node:
          | "text"
          | "image"
          | "container"
          | "rectangle"
          | "ellipse"
          | "polygon"
          | "star";
      }
    | {
        type: "draw";
        tool: "line" | "pencil";
      }
    | {
        type: "brush" | "eraser" | "flood-fill";
      };

  /**
   * A marquee is a area where it takes two points, where it uses the min point as min and max point as max.
   * - a: [x1, y1]
   * - b: [x2, y2]
   */
  export type Marquee = {
    a: cmath.Vector2;
    b: cmath.Vector2;
    /** when true, adds to existing selection */
    additive?: boolean;
  };

  /**
   * A lasso is a list of points that is represented as a polygon (as its fill regions)
   */
  export type Lasso = {
    points: cmath.Vector2[];
    /** when true, adds to existing selection */
    additive?: boolean;
  };

  export type HitTestingConfig = {
    /**
     * Determines how the target node is selected:
     * - `auto` => selects the shallowest, while selecting the siblings first
     * - `deepest` => Selects the deepest (nested) node.
     * - `shallowest` => Selects the shallowest (root) node.
     *
     * @default "auto"
     */
    target: "auto" | "deepest" | "shallowest";

    /**
     * ignores the root node from the targeting (if not empty)
     * @default true
     */
    ignores_root_with_children: boolean;

    /**
     * ignores the locked node from the targeting
     * @default true
     */
    ignores_locked: boolean;
  };

  export type GestureModifiers = {
    /**
     * when on, this will translate the selected nodes with the hierarchy change - when cursor escapes and hits a new parent, the selected nodes will be moved to the new parent, maintining its absolute position
     * @default "on"
     */
    translate_with_hierarchy_change: "on" | "off";

    /**
     * [a.k.a press option to copy]
     *
     * when on, this will change the current document tree structure (inserts a clone), replace the current tranalate selection with the cloned nodes
     *
     * usually, this is toggled when the user press the option key
     *
     * @default "off"
     */
    translate_with_clone: "on" | "off";
    /**
     * translate (move) with axis lock (dominant axis)
     * user can configure the axis lock mode (turn this on when shift key is pressed, the node will move only in x or y axis)
     */
    tarnslate_with_axis_lock: "on" | "off";
    /**
     * force disable snapping while translating
     *
     * when on, translation will ignore any snap guides and move freely
     */
    translate_with_force_disable_snap: "on" | "off";
    transform_with_center_origin: "on" | "off";
    transform_with_preserve_aspect_ratio: "on" | "off";
    /**
     * Continue projecting a path after connecting to an existing vertex.
     *
     * This is typically toggled momentarily while the `p` key is held
     * during a pen gesture.
     *
     * @default "off"
     */
    path_keep_projecting: "on" | "off";
    /**
     *
     * Set the quantize value for the rotation (in degrees)
     *
     * `15` is a good value for most cases
     *
     * @default "off"
     */
    rotate_with_quantize: "off" | number;
    /**
     * tangent control mirroring mode for curve gestures
     *
     * @default "auto"
     */
    curve_tangent_mirroring: vn.TangentMirroringMode;
    /**
     * Mirror padding changes across the same axis
     *
     * When on, changing one padding side also updates its opposite side:
     * - left ↔ right (horizontal mirroring)
     * - top ↔ bottom (vertical mirroring)
     *
     * Typically toggled when the alt/option key is pressed
     *
     * @default "off"
     */
    padding_with_axis_mirroring: "on" | "off";
  };

  export interface IViewportTransformState {
    /**
     * current transform of the canvas.
     * where transform origin is 0,0
     */
    transform: cmath.Transform;
  }

  /**
   * list of webfonts, the list is fetched from the server.
   * this is a collection of webfonts registry, it does not mean the fonts are used or loaded.
   */
  export interface IEditorWebfontListState {
    /**
     * @see https://fonts.grida.co
     * @see https://fonts.grida.co/webfonts-vf.json
     * @see https://fonts.grida.co/webfonts.json
     */
    webfontlist: GoogleWebFontList;
  }

  /**
   * a font description, this is used to describe a font family.
   */
  export type FontFaceDescription = {
    family: string;
    italic: boolean;
  };

  /**
   * list of font keys, this soley indicates which fonts are used and "should" be loaded.
   * does not mean the fonts are loaded / loading
   */
  export interface IEditorFontDescriptionsState {
    fontfaces: FontFaceDescription[];
  }

  export interface IEditorFeatureBrushState {
    brushes: BitmapEditorBrush[];
    brush_color?: cg.RGBA8888;
    brush: editor.state.CurrentBrush;
  }

  /**
   * @volatile
   */
  export interface IEditorFeatureRulerState {
    ruler: "on" | "off";
  }

  /**
   * @volatile
   */
  export interface IEditorFeaturePixelGridState {
    pixelgrid: "on" | "off";
  }

  /**
   * @volatile
   */
  export interface IEditorFeatureMeasurementState {
    /**
     * surface measurement target
     *
     * @default undefined
     */
    surface_measurement_target?: string[];
    surface_measurement_targeting_locked: boolean;
    surface_measurement_targeting: "on" | "off";
  }

  /**
   * @volatile
   */
  export interface IEditorFeatureRepeatableDuplicateState {
    /**
     * active, repeatable duplication state
     *
     * @default null
     */
    active_duplication: editor.state.ActiveDuplication | null;
  }

  export type MultiplayerCursorColorPalette = {
    "50": string;
    "100": string;
    "200": string;
    "300": string;
    "400": string;
    "500": string;
    "600": string;
    "700": string;
    "800": string;
    "900": string;
    "950": string;
  };

  export type MultiplayerCursor = {
    t: number;
    id: string;
    transform: cmath.Transform | null;
    position: cmath.Vector2;
    palette: MultiplayerCursorColorPalette;
    marquee: editor.state.Marquee | null;
    selection: string[];
    scene_id: string | undefined;
    ephemeral_chat: {
      txt: string;
      ts: number;
    } | null;
  };

  /**
   * @volatile
   */
  export interface IEditorMultiplayerCursorState {
    /**
     * multiplayer cursors, does not include local cursor
     * Object format {[cursorId]: cursor} for efficient lookups and natural deduplication
     */
    cursors: Record<string, MultiplayerCursor>;
    /**
     * Local cursor chat state
     */
    local_cursor_chat: {
      /**
       * Current message being typed
       */
      message: string | null;
      /**
       * Whether the chat is open
       */
      is_open: boolean;
      /**
       * Timestamp of when the message was last modified, or null if no message
       */
      last_modified: number | null;
    };
  }

  export interface IEditorUserClipboardState {
    /**
     * user clipboard - copied data
     */
    user_clipboard?: io.clipboard.ClipboardPayload;
    user_clipboard_color?: cg.RGBA8888;
  }

  /**
   * [Scene Surface Support State]
   *
   * @volatile this support state is not part of the document state and does not get saved or recorded as history
   */
  export interface ISceneSurfaceState {
    /**
     * the current gesture state
     *
     * @default idle
     */
    gesture: editor.gesture.GestureState;

    /**
     * whether the surface is dragging (by the raw event)
     *
     * triggered by the "ondragstart" / "ondragend" event
     */
    dragging: boolean;

    /**
     * the latest snap result from the gesture
     */
    surface_snapping?: SnapResult;

    /**
     * general hover state
     *
     * @default null
     */
    hovered_node_id: string | null;

    /**
     * special hover state - when a node is a target of certain gesture, and ux needs to show the target node
     *
     * @default undefined
     */
    dropzone: editor.state.DropzoneIndication | undefined;

    /**
     * @private - internal use only
     *
     * All node ids detected by the raycast (internally) - does not get affected by the targeting config
     *
     * @default []
     */
    hits: string[];

    /**
     * Marquee transform in canvas space
     *
     * @default undefined
     */
    marquee?: editor.state.Marquee;

    /**
     * Lasso state
     */
    lasso?: editor.state.Lasso;
  }

  /**
   * [Preserved Runtime Editor State]
   *
   * @volatile this state is volatile, but preserved between scene switch.
   */
  export interface IEditorRuntimePreservedState {
    pointer: {
      /**
       * [clientX, clientY] - browser pointer event position
       */
      client: cmath.Vector2;
      position: cmath.Vector2;
      last: cmath.Vector2;
      logical: cmath.Vector2;
      // position_snap: cmath.Vector2;
    };

    /**
     * the config of how the surface raycast targeting should be
     */
    pointer_hit_testing_config: editor.state.HitTestingConfig;

    gesture_modifiers: editor.state.GestureModifiers;

    /**
     * @private - internal use only
     *
     * current tool mode
     *
     * @default {type: "cursor"}
     */
    tool: editor.state.ToolMode;

    /**
     * @private - internal use only
     *
     * previously selected tool type
     */
    __tool_previous: editor.state.ToolMode | null;
  }

  export type ContentEditModeState =
    | TextContentEditMode
    | VariableWidthContentEditMode
    | VectorContentEditMode
    | BitmapContentEditMode
    | PaintGradientContentEditMode
    | PaintImageContentEditMode;

  type TextContentEditMode = {
    type: "text";
    /**
     * text node id
     */
    node_id: string;
    // selectedTextRange;
  };

  export type VectorContentEditModeHoverableGeometryControlType =
    | "vertex"
    | "segment";

  export type VectorContentEditModeGeometryControlsSelection = {
    /**
     * selected vertex indices
     */
    selected_vertices: number[];

    /**
     * selected segment indices
     */
    selected_segments: number[];

    /**
     * selected tangent indices
     *
     * each tangent is represented as [vertex_index, a_or_b]
     * where a_or_b is 0 for `a` and 1 for `b`
     */
    selected_tangents: [number, 0 | 1][];
  };

  // export type VectorContentEditModeCursorTarget =
  //   | { type: "vertex"; vertex: number }
  //   | { type: "segment"; segment: vn.PointOnSegment };

  export type VectorContentEditMode = {
    type: "vector";
    node_id: string;

    selection: VectorContentEditModeGeometryControlsSelection;
    /**
     * vertices considered active for showing tangent handles
     */
    selection_neighbouring_vertices: number[];

    /**
     * origin point - the new point will be connected to this point
     * also `selected_vertices[0]`
     */
    a_point: number | null;

    /**
     * next `ta` value when segment is created (connected)
     *
     * used when user creates a new vertex point without connection, yet dragging to first configure the `ta` of the next segment
     *
     * @default zero
     */
    next_ta: cmath.Vector2 | null;

    /**
     * initial vector network data
     *
     * The VectorNetwork data as entering the vector edit mode
     *
     * used to check if the content has changed, and revert the node if no changes were made
     */
    initial_vector_network: vn.VectorNetwork;

    /**
     * Snapshot of the node before entering vector edit mode. Used to revert the node
     * when no edits were performed.
     */
    original: grida.program.nodes.UnknwonNode | null;

    /**
     * clipboard data for vector content copy/paste
     */
    clipboard: vn.VectorNetwork | null;

    /**
     * Position of the vector node when the clipboard was populated.
     *
     * This allows pasted geometry to retain the absolute coordinates
     * it had at copy time, even if the node moves before pasting.
     */
    clipboard_node_position: cmath.Vector2 | null;

    /**
     * next point position, snapped, in vector network space
     */
    cursor: cmath.Vector2;

    /**
     * snapped vertex index (of a selected path node)
     *
     * This is mathematically resolved based on proximity calculations and snap guides.
     * Used for measurement calculations and precise vertex targeting.
     *
     * @default null
     */
    snapped_vertex_idx: number | null;

    /**
     * snapped segment with parametric position and evaluated point
     *
     * This is mathematically resolved based on proximity calculations and snap guides.
     * Contains the segment index, parametric position (t), and evaluated point for precise targeting.
     * Used for measurement calculations and precise segment targeting.
     *
     * @default null
     */
    snapped_segment_p: vn.EvaluatedPointOnSegment | null;

    /**
     * hovered control for UI feedback and measurement
     *
     * This is a UI-triggered hover state based on surface interaction, not mathematically resolved.
     * Used for visual feedback and measurement calculations when alt key is pressed.
     * Cannot have multiple mixed hover states - only one control can be hovered at a time.
     *
     * @default null
     */
    hovered_control: {
      type: VectorContentEditModeHoverableGeometryControlType;
      index: number;
    } | null;
  };

  export type VariableWidthContentEditMode = {
    type: "width";
    node_id: string;
    snapped_p: vn.EvaluatedPointOnSegment | null;
    initial_vector_network: vn.VectorNetwork;
    variable_width_selected_stop: number | null;
    initial_variable_width_profile: cg.VariableWidthProfile;
    variable_width_profile: cg.VariableWidthProfile;
  };

  type BitmapContentEditMode = {
    type: "bitmap";
    node_id: string;
    imageRef: string;
  };

  /**
   * Content edit mode for editing gradient paints (both fill and stroke)
   *
   * This mode allows users to interactively edit gradient properties including
   * control points, color stops, and stop positions for both fill and stroke paints.
   *
   * @example
   * ```typescript
   * // Edit fill gradient at index 0
   * const mode: PaintGradientContentEditMode = {
   *   type: "paint/gradient",
   *   node_id: "node-123",
   *   paint_target: "fill",
   *   paint_index: 0,
   *   selected_stop: 1
   * };
   *
   * // Edit stroke gradient at index 1
   * const strokeMode: PaintGradientContentEditMode = {
   *   type: "paint/gradient",
   *   node_id: "node-123",
   *   paint_target: "stroke",
   *   paint_index: 1,
   *   selected_stop: 0
   * };
   * ```
   */
  export type PaintGradientContentEditMode = {
    /** The content edit mode type identifier */
    type: "paint/gradient";
    /** The ID of the node being edited */
    node_id: string;
    /** Whether to edit fill or stroke paints */
    paint_target: "fill" | "stroke";
    /**
     * Index of the paint being edited within the paint array
     *
     * For nodes with multiple fills/strokes, this specifies which one to edit.
     * Will be clamped to valid range [0, paints.length-1].
     *
     * @default 0
     */
    paint_index: number;
    /**
     * Index of the currently focused gradient stop
     *
     * This determines which color stop is selected for editing.
     * Will be clamped to valid range [0, stops.length-1].
     *
     * @default 0
     */
    selected_stop: number;
  };

  /**
   * Content edit mode for manipulating image paints via the surface editor.
   */
  export type PaintImageContentEditMode = {
    /** The content edit mode type identifier. */
    type: "paint/image";
    /** The ID of the node whose paint is being edited. */
    node_id: string;
    /** Whether the targeted paint is a fill or stroke. */
    paint_target: "fill" | "stroke";
    /** Index of the targeted paint within the fill/stroke array. */
    paint_index: number;
  };

  /**
   * @persistent scene persistence state
   */
  export interface IScenePersistenceState {
    selection: string[];

    /**
     * @private - internal use only
     *
     * current content edit mode
     *
     * @default false
     */
    content_edit_mode?: editor.state.ContentEditModeState;
  }

  /**
   * @deprecated remove when possible
   */
  export interface IMinimalDocumentState {
    document: grida.program.document.Document;
    document_ctx: grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext;

    /**
     * the document key set by user. user can update this to tell it's entirely replaced
     *
     * Optional, but recommended to set for better tracking and debugging.
     */
    document_key?: string;
  }

  /**
   * @persistent
   */
  export interface IDocumentState
    extends editor.state.IMinimalDocumentState,
      editor.state.IScenePersistenceState {
    /**
     * current scene id
     */
    scene_id: string | undefined;
  }

  export interface IEditorState
    extends editor.config.IEditorConfig,
      editor.state.IViewportTransformState,
      editor.state.IEditorUserClipboardState,
      editor.state.IEditorMultiplayerCursorState,
      editor.state.IEditorWebfontListState,
      editor.state.IEditorFontDescriptionsState,
      editor.state.IEditorFeatureBrushState,
      editor.state.IEditorFeatureRulerState,
      editor.state.IEditorFeaturePixelGridState,
      editor.state.IEditorFeatureRepeatableDuplicateState,
      //
      editor.state.IEditorFeatureMeasurementState,
      editor.state.ISceneSurfaceState,
      editor.state.IEditorRuntimePreservedState,
      //
      editor.state.IDocumentState,
      grida.program.document.IDocumentTemplatesRepository {
    rotation_quantize_step: number;
  }

  /**
   * @deprecated
   *
   * Dangerous. Use when absolutely necessary.
   */
  export function snapshot(state: editor.state.IEditorState) {
    const minimal: editor.state.IMinimalDocumentState = {
      document: state.document,
      document_ctx: state.document_ctx,
      document_key: state.document_key,
    };

    return JSON.parse(JSON.stringify(minimal));
  }

  /**
   * the default state of the scene
   *
   * this is applied when the scene is loaded (switched)
   *
   * @deprecated the scene-specific properties will be moved under the scene nodes.
   */
  export const __RESET_SCENE_STATE: editor.state.IScenePersistenceState &
    editor.state.ISceneSurfaceState &
    editor.state.IEditorFeatureRepeatableDuplicateState = {
    dragging: false,
    active_duplication: null,
    content_edit_mode: undefined,
    dropzone: undefined,
    gesture: { type: "idle" },
    hovered_node_id: null,
    marquee: undefined,
    selection: [],
    hits: [],
    surface_snapping: undefined,
  };

  export interface IEditorStateInit
    extends Pick<editor.config.IEditorConfig, "editable" | "debug">,
      Partial<
        Pick<editor.config.IEditorConfig, "flags" | "rotation_quantize_step">
      >,
      grida.program.document.IDocumentTemplatesRepository {
    document: Pick<
      grida.program.document.Document,
      "nodes" | "entry_scene_id"
    > &
      Partial<
        grida.program.document.IBitmapsRepository &
          Pick<grida.program.document.Document, "links">
      > &
      (
        | {
            // New format - scenes_ref with links
            scenes_ref: string[];
            links?: Record<string, string[] | undefined>;
          }
        | {
            // Old format (backward compat) - scenes as Record (links inferred from children_refs)
            scenes: Record<
              string,
              Partial<grida.program.document.Scene> &
                Pick<
                  grida.program.document.Scene,
                  "id" | "name" | "constraints"
                >
            >;
          }
      );
  }

  export function init({
    debug,
    ...init
  }: Omit<IEditorStateInit, "debug"> & {
    debug?: boolean;
  }): editor.state.IEditorState {
    // Handle both old (scenes: Record) and new (scenes_ref: string[]) formats
    const scenes_ref: string[] = [];
    const migrated_nodes: Record<string, grida.program.nodes.Node> = {};
    const migrated_links: Record<string, string[] | undefined> = {};
    const input_doc = init.document;

    if ("scenes_ref" in input_doc) {
      // New format - scenes already in nodes
      scenes_ref.push(...input_doc.scenes_ref);
    } else if ("scenes" in input_doc) {
      // Old format - convert scenes to SceneNodes
      const input_scenes = input_doc.scenes;

      for (const [scene_id, scene_input] of Object.entries(input_scenes)) {
        const scene = grida.program.document.init_scene(scene_input);
        scenes_ref.push(scene_id);

        // Create SceneNode from Scene input (if not already in nodes)
        if (!init.document.nodes[scene_id]) {
          const sceneNode: grida.program.nodes.SceneNode = {
            type: "scene",
            id: scene_id,
            name: scene.name,
            active: true,
            locked: false,
            constraints: scene.constraints,
            order: scene.order,
            guides: scene.guides,
            edges: scene.edges,
            backgroundColor: scene.backgroundColor,
          };
          migrated_nodes[scene_id] = sceneNode;
        }

        // Migrate children_refs to links
        migrated_links[scene_id] = scene.children_refs || [];
      }
    }

    // Build final document with migrated data
    const base_links = "links" in input_doc ? (input_doc.links ?? {}) : {};

    // Explicitly destructure to exclude potential 'scenes' property from old format
    const {
      nodes: input_nodes,
      entry_scene_id,
      bitmaps = {},
      images = {},
      properties = {},
      // Exclude 'scenes' from spreading (old format)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      scenes: _scenes,
      ...rest
    } = input_doc as any;

    const doc: grida.program.document.Document = {
      ...rest,
      bitmaps,
      images,
      properties,
      entry_scene_id,
      nodes: {
        ...input_nodes,
        ...migrated_nodes,
      },
      links: {
        ...base_links,
        ...migrated_links,
      },
      scenes_ref,
    };

    const s = new dq.DocumentStateQuery(doc);

    return {
      transform: cmath.transform.identity,
      debug: debug ?? false,
      pointer: {
        client: cmath.vector2.zero,
        position: cmath.vector2.zero,
        last: cmath.vector2.zero,
        logical: cmath.vector2.zero,
      },
      cursors: {},
      local_cursor_chat: {
        message: null,
        is_open: false,
        last_modified: null,
      },
      gesture_modifiers: editor.config.DEFAULT_GESTURE_MODIFIERS,
      ruler: "on",
      pixelgrid: "on",
      when_not_removable: "deactivate",
      document_ctx: new tree.graph.Graph(doc).lut,
      pointer_hit_testing_config: editor.config.DEFAULT_HIT_TESTING_CONFIG,
      surface_measurement_targeting: "off",
      surface_measurement_targeting_locked: false,
      surface_measurement_target: undefined,
      fontfaces: s.fonts().map((family) => ({
        family,
        // FIXME: support italic flag
        italic: false,
      })),
      webfontlist: {
        kind: "webfonts#webfontList",
        items: [],
      },
      brushes: [],
      tool: { type: "cursor" },
      __tool_previous: null,
      brush: editor.config.DEFAULT_BRUSH,
      scene_id: doc.entry_scene_id ?? scenes_ref[0] ?? undefined,
      flags: {
        __unstable_brush_tool: "off",
      },
      rotation_quantize_step:
        init.rotation_quantize_step ??
        editor.config.DEFAULT_ROTATION_QUANTIZE_STEP,
      ...__RESET_SCENE_STATE,
      ...init,
      document: doc,
    };
  }
}

export namespace editor.gesture {
  /**
   * Sanpshot used for arrangement.
   *
   * Contains collection of nodes' bounding rect.
   */
  export type LayoutSnapshot = {
    /**
     * relative objects to the parent
     */
    objects: Array<cmath.Rectangle & { id: string }>;
  } & (
    | {
        /**
         * the type of the layout
         */
        type: "flex";

        /**
         * the grouping parent id
         */
        group: string;
      }
    | {
        type: "group";
        /**
         * the grouping parent id (null if document root)
         */
        group: string | null;
      }
  );

  export type GestureState =
    | GestureIdle
    | GesturePan
    | GestureGuide
    | GestureVirtualNudge
    | GestureTranslate
    | GestureSort
    | GestureGap
    | GesturePadding
    | GestureInsertAndResize
    | GestureScale
    | GestureRotate
    | GestureCornerRadius
    | GestureDraw
    | GestureBrush
    | GestureTranslateVectorControls
    | GestureTranslateVariableWidthStop
    | GestureResizeVariableWidthStop
    | GestureCurve
    | GestureCurveA;

  interface IGesture {
    /**
     * current movement of the drag
     *
     * raw movement - independent of the offset or origin, purely the movement of the mouse.
     */
    movement: cmath.Vector2;

    /**
     * first movement of the drag
     */
    first: cmath.Vector2;

    /**
     * last movement of the drag
     */
    last: cmath.Vector2;
  }

  export type GestureIdle = {
    readonly type: "idle";
  };

  /**
   * Pan the viewport - a.k.a hand tool
   */
  export type GesturePan = IGesture & {
    readonly type: "pan";
  };

  /**
   * Move or draw the guide line
   */
  export type GestureGuide = IGesture & {
    readonly type: "guide";
    /**
     * the axis of the guide
     */
    readonly axis: cmath.Axis;

    /**
     * the index, id of the guide
     */
    readonly idx: number;

    /**
     * initial offset of the guide
     */
    readonly initial_offset: number;

    /**
     * the current offset of the guide (can be snapped to objects)
     */
    offset: number;
  };

  /**
   * virtual nudge gesture.
   *
   * this is not a real gesture, commonly triggered by keyboard arrow keys.
   *
   * this is required to tell the surface that it is nudging, thus, show snaps & related ux
   */
  export type GestureVirtualNudge = {
    readonly type: "nudge";
  };

  export type GestureTranslate = IGesture & {
    // translate (move)
    readonly type: "translate";
    selection: string[];

    /**
     * initial selection of the nodes - the original node ids
     */
    readonly initial_selection: string[];

    /**
     * @deprecated FIXME: use layout snapshot or history instead
     */
    readonly initial_snapshot: editor.state.IMinimalDocumentState;
    readonly initial_clone_ids: string[];
    readonly initial_rects: cmath.Rectangle[];

    /**
     * indicator between gesture events to ensure if the current selection is cloned ones or not
     */
    is_currently_cloned: boolean;
  };

  /**
   * Sort the node within the layout (re-order)
   */
  export type GestureSort = IGesture & {
    readonly type: "sort";

    /**
     * the current moving node id of this gesture
     */
    readonly node_id: string;

    /**
     * initial position of moving node {@link GestureSort.node_id}
     */
    readonly node_initial_rect: cmath.Rectangle;

    /**
     * the current layout - this changes as the movement changes
     */
    layout: LayoutSnapshot;

    /**
     * the selection will be at this position (when dropped)
     */
    placement: {
      /**
       * the current rect (placed) of the moving node.
       * this should be identical to layout.objects[index]
       */
      rect: cmath.Rectangle;

      /**
       * index of the node's rect within the current layout snapshot
       */
      index: number;
    };
  };

  /**
   * Sort the node within the layout (re-order)
   */
  export type GestureGap = IGesture & {
    readonly type: "gap";

    readonly axis: "x" | "y";

    readonly min_gap: number;
    readonly initial_gap: number;

    gap: number;

    /**
     * the current layout - this changes as the movement changes
     */
    layout: LayoutSnapshot;
  };

  export type GesturePadding = IGesture & {
    readonly type: "padding";

    readonly node_id: string;
    readonly side: "top" | "right" | "bottom" | "left";

    readonly min_padding: number;
    readonly initial_padding: number;

    padding: number;
  };

  export type GestureScale = IGesture & {
    // scale (resize)
    readonly type: "scale";
    readonly selection: string[];
    /**
     * @deprecated FIXME: use layout snapshot or history instead
     */
    readonly initial_snapshot: editor.state.IMinimalDocumentState;
    readonly initial_rects: cmath.Rectangle[];
    readonly direction: cmath.CardinalDirection;
  };

  export type GestureInsertAndResize = Omit<GestureScale, "type"> & {
    readonly type: "insert-and-resize";
    pending_insertion: {
      node_id: string;
      prototype: grida.program.nodes.Node;
    } | null;
  };

  export type GestureRotate = IGesture & {
    readonly type: "rotate";
    readonly initial_bounding_rectangle: cmath.Rectangle | null;
    // TODO: support multiple selection
    readonly selection: string;
    readonly offset: cmath.Vector2;

    /**
     * the current rotation of the selection
     */
    rotation: number;
  };

  export type GestureCornerRadius = IGesture & {
    /**
     * - corner-radius
     */
    readonly type: "corner-radius";
    readonly node_id: string;
    readonly anchor?: cmath.IntercardinalDirection;
    readonly initial_bounding_rectangle: cmath.Rectangle | null;
  };

  export type GestureDraw = IGesture & {
    /**
     * - draw points
     */
    readonly type: "draw";
    readonly mode: "line" | "pencil";

    /**
     * origin point - relative to canvas space
     */
    readonly origin: cmath.Vector2;

    /**
     * record of points (movements)
     * the absolute position of the points will be (p + origin)
     */
    points: cmath.Vector2[];

    readonly node_id: string;
  };

  export type GestureBrush = IGesture & {
    readonly type: "brush";

    /**
     * color to paint
     */
    readonly color: cmath.Vector4;

    // /**
    //  * record of points (movements)
    //  * the absolute position of the points will be (p + origin)
    //  */
    // points: cmath.Vector2[];

    readonly node_id: string;
  };

  /**
   * Translate certain path point
   *
   * @remarks
   * This is only valid with content edit mode is "vector"
   */
  export type GestureTranslateVectorControls = IGesture & {
    type: "translate-vector-controls";
    readonly node_id: string;
    readonly vertices: number[];
    readonly tangents: [number, 0 | 1][];
    readonly initial_verticies: cmath.Vector2[];
    readonly initial_segments: vn.VectorNetworkSegment[];
    readonly initial_position: cmath.Vector2;
    /**
     * Absolute position of the node when the gesture started.
     *
     * Used for snap guide rendering inside nested containers where the local
     * position does not reflect the node's location on the canvas.
     */
    readonly initial_absolute_position: cmath.Vector2;
  };

  /**
   * Translate variable width stop
   *
   * @remarks
   * This is only valid with content edit mode is "width"
   */
  export type GestureTranslateVariableWidthStop = IGesture & {
    type: "translate-variable-width-stop";
    readonly node_id: string;
    readonly stop: number;
    readonly initial_stop: cg.VariableWidthStop;
    readonly initial_position: cmath.Vector2;
    /**
     * Absolute position of the node when the gesture started.
     *
     * Used for snap guide rendering inside nested containers where the local
     * position does not reflect the node's location on the canvas.
     */
    readonly initial_absolute_position: cmath.Vector2;
  };

  /**
   * Resize variable width stop radius
   *
   * @remarks
   * This is only valid with content edit mode is "width"
   */
  export type GestureResizeVariableWidthStop = IGesture & {
    type: "resize-variable-width-stop";
    readonly node_id: string;
    readonly stop: number;
    readonly side: "left" | "right";
    readonly initial_stop: cg.VariableWidthStop;
    readonly initial_position: cmath.Vector2;
    /**
     * Absolute position of the node when the gesture started.
     *
     * Used for snap guide rendering inside nested containers where the local
     * position does not reflect the node's location on the canvas.
     */
    readonly initial_absolute_position: cmath.Vector2;
    /**
     * Initial angle of the curve at the stop position.
     * Used to transform movement perpendicular to the curve direction.
     */
    readonly initial_angle: number;
    /**
     * Initial curve position at the stop.
     * Used to calculate the radius based on cursor distance from curve.
     */
    readonly initial_curve_position: cmath.Vector2;
  };

  /**
   * curves the existing segment
   */
  export type GestureCurve = IGesture & {
    readonly type: "curve";

    /**
     * selected path node id
     */
    readonly node_id: string;

    /**
     * segment index
     */
    readonly segment: number;

    /**
     * control point
     */
    readonly control: "ta" | "tb";

    /**
     * initial position of the control point
     */
    readonly initial: cmath.Vector2;

    /**
     * rather to invert the movement
     */
    readonly invert: boolean;
  };

  /**
   * pre-curve the future segment (when only vertex is present)
   *
   * This is used when user creates a new vertex point without connection, yet dragging to first configure the `ta` of the next segment
   */
  export type GestureCurveA = IGesture & {
    readonly type: "curve-a";

    /**
     * selected path node id
     */
    readonly node_id: string;

    /**
     * vertex index
     */
    readonly vertex: number;

    /**
     * control point - always `ta`
     */
    readonly control: "ta";

    /**
     * initial position of the control point - always `zero`
     */
    readonly initial: cmath.Vector2;

    /**
     * rather to invert the movement
     */
    readonly invert: boolean;
  };
}

export namespace editor.history {
  export interface Patch {
    op: "replace" | "remove" | "add";
    path: (string | number)[];
    value?: any;
  }

  export type HistoryEntry = {
    actionType: Action["type"];
    /**
     * timestamp
     */
    ts: number;
    /**
     * patches
     */
    patches: Patch[];
    /**
     * inverse patches
     */
    inversePatches: Patch[];
  };
}

export namespace editor.a11y {
  export type EscapeStep =
    | "escape-tool"
    | "escape-selection"
    | "escape-content-edit-mode";

  export const a11y_direction_to_order = {
    "a11y/up": "backward",
    "a11y/right": "forward",
    "a11y/down": "forward",
    "a11y/left": "backward",
  } as const;

  export const a11y_direction_to_vector = {
    "a11y/up": [0, -1] as cmath.Vector2,
    "a11y/right": [1, 0] as cmath.Vector2,
    "a11y/down": [0, 1] as cmath.Vector2,
    "a11y/left": [-1, 0] as cmath.Vector2,
  } as const;
}

export namespace editor.multiplayer {
  export type AwarenessPayload = {
    /**
     * user-window-session unique cursor id
     *
     * one user can have multiple cursors (if multiple windows are open)
     */
    cursor_id: string;
    /**
     * player profile information (rarely changes)
     */
    profile: {
      /**
       * theme colors for this player within collaboration ui
       */
      palette: editor.state.MultiplayerCursorColorPalette;
    };
    /**
     * current focus state (changes when switching pages/selecting)
     */
    focus: {
      /**
       * player's current scene (page)
       */
      scene_id: string | undefined;
      /**
       * the selection (node ids) of this player
       */
      selection: string[];
    };
    /**
     * geometric state (changes frequently with mouse movement)
     */
    geo: {
      /**
       * current transform (camera)
       */
      transform: cmath.Transform;
      /**
       * current cursor position
       */
      position: [number, number];
      /**
       * marquee start point
       * the full marquee is a rect with marquee_a and position (current cursor position)
       */
      marquee_a: [number, number] | null;
    };
    /**
     * cursor chat is a ephemeral message that lives for a short time and disappears after few seconds (as configured)
     * only the last message is kept
     */
    cursor_chat: {
      txt: string;
      ts: number;
    } | null;
  };
}

export namespace editor.api {
  /**
   * api protocol with json patch
   *
   * can be used with language boundaries / cli / wasm-wasi / etc.
   */
  export namespace patch {
    export type JsonPatchOperation =
      | ({ op: editor.history.Patch["op"]; path: string } & {
          value: editor.history.Patch["value"];
        })
      | { op: editor.history.Patch["op"]; path: string };

    export function encodeJsonPointerSegment(segment: string | number): string {
      const str = String(segment);
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }

    export function toJsonPointerPath(path: (string | number)[]): string {
      return `/${path.map(encodeJsonPointerSegment).join("/")}`;
    }

    export function toJsonPatchOperations(
      patches: editor.history.Patch[]
    ): JsonPatchOperation[] {
      return patches.map((patch) => {
        const pointer = toJsonPointerPath(patch.path);
        if ("value" in patch) {
          return { op: patch.op, path: pointer, value: patch.value };
        }
        return { op: patch.op, path: pointer };
      });
    }
  }

  export type SubscriptionCallbackFn<T = any> = (
    editor: T,
    action?: Action,
    patches?: editor.history.Patch[]
  ) => void;

  export type SubscriptionWithSelectorCallbackFn<T, E = any> = (
    editor: E,
    selected: T,
    previous: T,
    action?: Action,
    patches?: editor.history.Patch[]
  ) => void;

  export class EditorConsumerVerboseError extends Error {
    context: any;
    constructor(message: string, context: any) {
      super(message); // Pass message to the parent Error class
      this.name = this.constructor.name; // Set the error name
      this.context = context; // Attach the context object
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
    }

    toString(): string {
      return `${this.name}: ${this.message} - Context: ${JSON.stringify(this.context)}`;
    }
  }

  export interface ImageInstance {
    readonly type: grida.program.document.ImageType;
    getBytes(): Uint8Array;
    getDataURL(): Promise<string>;
    getSize(): { width: number; height: number };
  }

  export type FontStyleChangeDescription = {
    fontStyleKey: editor.font_spec.FontStyleKey;
  };

  /**
   * flexible api when resolving font style via api, with unknown or dynamic values.
   */
  export type FontStyleSelectDescription = {
    /**
     * the font family to select from.
     *
     * @example "Inter", "Noto Sans"
     *
     * expects exactly one family name, and expected to exactly match
     *
     * [p0]: must match, otherwise it selects nothing
     */
    fontFamily: string;

    /**
     * non-standard font style name, used by grida, internally.
     *
     * if known, user may pass this.
     *
     * [p1]: highest priority, if given. breaks if match
     */
    fontStyleName?: string;

    /**
     * the requested font weight.
     *
     * [p2#1]: secondary priority, if given. breaks if single match
     */
    fontWeight?: number;

    /**
     * if the requested font style is italic.
     *
     * [p2#2]: secondary priority, if given. breaks if single match
     */
    fontStyleItalic?: boolean;

    /**
     * the postscript name of the typeface.
     */
    fontPostscriptName?: string;

    /**
     * the postscript name of the instance.
     */
    fontInstancePostscriptName?: string | null;

    /**
     * the requested font variations.
     */
    fontVariations?: Record<string, number>;
  };

  export type TChange<T> =
    | {
        type: "set";
        value: T;
      }
    | {
        type: "delta";
        value: NonNullable<T>;
      };

  /**
   * Numeric value change payload.
   */
  export type NumberChange = TChange<number>;

  export type NudgeUXConfig = {
    /**
     * when gesture is true, it will set the gesture state to trigger the surface guide rendering.
     *
     * @default true
     */
    gesture: boolean;

    /**
     * delay in ms to toggle off the gesture state
     *
     * @default 500
     */
    delay: number;
  };

  export interface IDocumentBrushToolActions {
    changeBrush(brush: BitmapEditorBrush): void;
    changeBrushSize(size: editor.api.NumberChange): void;
    changeBrushOpacity(opacity: editor.api.NumberChange): void;
  }

  export interface ICameraActions {
    /**
     * @get the transform of the camera
     * @set set the transform of the camera
     */
    transform: cmath.Transform;

    /**
     * set the transform of the camera
     * @param transform the transform to set
     * @param sync if true, the transform will also re-calculate the cursor position.
     */
    transformWithSync(transform: cmath.Transform, sync: boolean): void;

    /**
     * zoom the camera by the given delta
     * @param delta the delta to zoom by
     * @param origin the origin of the zoom
     */
    zoom(delta: number, origin: cmath.Vector2): void;
    /**
     * pan the camera by the given delta
     * @param delta the delta to pan by
     */
    pan(delta: [number, number]): void;

    scale(
      factor: number | cmath.Vector2,
      origin: cmath.Vector2 | "center"
    ): void;
    fit(
      selector: grida.program.document.Selector,
      options?: {
        margin?: number | [number, number, number, number];
        animate?: boolean;
      }
    ): void;
    zoomIn(): void;
    zoomOut(): void;
  }

  export interface IDocumentGeometryInterfaceProvider {
    /**
     * returns a list of node ids that are intersecting with the pointer event
     * @param event window event
     * @returns
     */
    getNodeIdsFromPointerEvent(event: PointerEvent | MouseEvent): string[];

    /**
     * returns a list of node ids that are intersecting with the point in canvas space
     * @param point canvas space point
     * @returns
     */
    getNodeIdsFromPoint(point: cmath.Vector2): string[];

    /**
     * returns a list of node ids that are intersecting with the envelope in canvas space
     * @param envelope
     * @returns
     */
    getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[];

    /**
     * returns a bounding rect of the node in canvas space
     * @param node_id
     * @returns
     */
    getNodeAbsoluteBoundingRect(node_id: string): cmath.Rectangle | null;
  }

  export interface IDocumentImageExportInterfaceProvider {
    /**
     * exports the node as an image
     * @param node_id
     * @param format
     * @returns
     */
    exportNodeAsImage(
      node_id: string,
      format: "PNG" | "JPEG"
    ): Promise<Uint8Array>;
  }

  export interface IDocumentSVGExportInterfaceProvider {
    /**
     * exports the node as an svg
     * @param node_id
     * @returns
     */
    exportNodeAsSVG(node_id: string): Promise<string>;
  }

  export interface IDocumentPDFExportInterfaceProvider {
    /**
     * exports the node as an pdf
     * @param node_id
     * @returns
     */
    exportNodeAsPDF(node_id: string): Promise<Uint8Array>;
  }

  export interface IDocumentExporterInterfaceProvider {
    readonly formats: "PNG" | "JPEG" | "PDF" | "SVG" | (string & {})[];

    canExportNodeAs(
      node_id: string,
      format: "PNG" | "JPEG" | "PDF" | "SVG" | (string & {})
    ): boolean;

    exportNodeAs(
      node_id: string,
      format: "PNG" | "JPEG" | "PDF" | "SVG" | (string & {})
    ): Promise<Uint8Array | string>;
  }

  /**
   * interface for font parser
   *
   * grida has 2 font parsers:
   * 1. @grida/fonts (js)
   * 2. @grida/canvas-wasm (rust)
   *
   */
  export interface IDocumentFontParserInterfaceProvider {
    // /**
    //  * parse single ttf font
    //  * @param bytes font ttf bytes
    //  */
    // parseTTF(bytes: ArrayBuffer): Promise<any | null>;

    /**
     * parse font family
     * @param faces font faces
     */
    parseFamily(
      familyName: string,
      faces: {
        faceId: string;
        data: ArrayBuffer;
        userFontStyleItalic?: boolean;
      }[]
    ): Promise<editor.font_spec.UIFontFamily | null>;
  }

  /**
   * Agent interface that is responsible for resolving, managing and caching fonts.
   */
  export interface IDocumentFontCollectionInterfaceProvider {
    /**
     * loads the font so that the backend can render it
     * @param font font descriptor
     */
    loadFont(font: { family: string }): Promise<void>;

    /**
     * Lists fonts that have been loaded and are available at runtime.
     * This does not fetch the full webfont list; it only reports fonts
     * that were explicitly loaded through {@link loadFont}.
     */
    listLoadedFonts(): string[];

    /**
     * Sets the default fallback fonts.
     * @param fonts
     */
    setFallbackFonts(fonts: string[]): void;
  }

  export interface IDocumentVectorInterfaceProvider {
    /**
     * converts the node into a vector network
     * @param node_id
     * @returns vector network or null if unsupported
     */
    toVectorNetwork(node_id: string): vn.VectorNetwork | null;
  }

  //

  export interface IDocumentGeometryQuery {
    /**
     * returns a list of node ids that are intersecting with the point in canvas space
     * @param point canvas space point
     * @returns
     */
    getNodeIdsFromPoint(point: cmath.Vector2): string[];
    /**
     * returns a list of node ids that are intersecting with the pointer event
     * @param event window event
     * @returns
     */
    getNodeIdsFromPointerEvent(event: PointerEvent | MouseEvent): string[];
    /**
     * returns a list of node ids that are intersecting with the envelope in canvas space
     * @param envelope canvas space envelope
     * @returns
     */
    getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[];
    /**
     * returns a bounding rect of the node in canvas space
     * @param node_id node id
     * @returns
     */
    getNodeAbsoluteBoundingRect(node_id: NodeID): cmath.Rectangle | null;
    /**
     * returns the absolute rotation of the node in canvas space
     * @param node_id node id
     * @returns
     */
    getNodeAbsoluteRotation(node_id: NodeID): number;
  }

  export interface IDocumentVectorInterfaceActions {
    toVectorNetwork(node_id: string): vn.VectorNetwork | null;
  }

  export interface IDocumentFontActions {
    // #region fonts

    /**
     * Loads the font so that the backend can render it
     */
    loadFontSync(font: { family: string }): Promise<void>;

    /**
     * Lists fonts currently loaded and available to the renderer.
     */
    listLoadedFonts(): string[];

    /**
     * Loads platform default fonts and configures renderer fallback order.
     */
    loadPlatformDefaultFonts(): Promise<void>;

    /**
     * Retrieves font metadata, variation axes and features.
     */
    getFontFamilyDetailsSync(
      fontFamily: string
    ): Promise<editor.font_spec.UIFontFamily | null>;

    // #endregion fonts
  }

  export interface IDocumentImageActions {
    // #region image

    /**
     * creates an image (data) from the given data, registers it to the document
     * @param data
     */
    createImage(
      data: Uint8Array | File
    ): Promise<grida.program.document.ImageRef>;

    /**
     * creates an image (data) from the given src, registers it to the document
     * @param src
     */
    createImageAsync(src: string): Promise<grida.program.document.ImageRef>;

    /**
     * gets the image instance from the given ref
     * @param ref
     */
    getImage(ref: string): ImageInstance | null;

    // #endregion image
  }

  export interface IEditorDocumentStoreConsumerWithConstraintsActions {
    /**
     * inserts the payload with assertions and constraints
     */
    insert(payload: InsertPayload): void;
    autoSizeTextNode(node_id: string, axis: "width" | "height"): void;
  }

  /**
   * Payload signature for inserting node or subdocument
   */
  export type InsertPayload =
    | {
        id?: string;
        prototype: grida.program.nodes.NodePrototype;
      }
    | {
        document: grida.program.document.IPackedSceneDocument;
      };

  export interface IDocumentStoreActions {
    undo(): void;
    redo(): void;
    /**
     * Reset the entire document state
     *
     * Completely replaces the editor state, bypassing the reducer.
     * - Preserves ONLY the camera transform (everything else is replaced)
     * - Clears undo/redo history
     * - Emits a "document/reset" action for subscribers
     * - Auto-generates a timestamp key if not provided
     *
     * @param state - The new complete editor state
     * @param key - Optional unique identifier (auto-generated if omitted)
     * @param force - If true, bypass locked check
     */
    reset(
      state: editor.state.IEditorState,
      key?: string,
      force?: boolean
    ): void;
    insert(payload: InsertPayload): void;
    loadScene(scene_id: string): void;
    createScene(scene?: grida.program.document.SceneInit): void;
    deleteScene(scene_id: string): void;
    duplicateScene(scene_id: string): void;
    renameScene(scene_id: string, name: string): void;
    changeSceneBackground(
      scene_id: string,
      backgroundColor: grida.program.document.ISceneBackground["backgroundColor"]
    ): void;

    /**
     * select the nodes by the given selectors.
     *
     * @param selectors - {@link grida.program.document.Selector}[]
     * @returns the selected node ids. or `false` if ignored.
     */
    select(...selectors: grida.program.document.Selector[]): NodeID[] | false;

    blur(): void;
    cut(target: "selection" | NodeID): void;
    copy(target: "selection" | NodeID): void;
    paste(): void;
    pasteVector(network: vn.VectorNetwork): void;
    pastePayload(payload: io.clipboard.ClipboardPayload): boolean;
    duplicate(target: "selection" | NodeID): void;
    flatten(target: "selection" | NodeID): void;
    op(target: ReadonlyArray<NodeID>, op: cg.BooleanOperation): void;
    union(target: ReadonlyArray<NodeID>): void;
    subtract(target: ReadonlyArray<NodeID>): void;
    intersect(target: ReadonlyArray<NodeID>): void;
    exclude(target: ReadonlyArray<NodeID>): void;
    groupMask(target: ReadonlyArray<NodeID>): void;

    // vector editor
    selectVertex(
      node_id: NodeID,
      vertex: number,
      options: { additive?: boolean }
    ): void;
    deleteVertex(node_id: NodeID, vertex: number): void;
    selectSegment(
      node_id: NodeID,
      segment: number,
      options: { additive?: boolean }
    ): void;
    deleteSegment(node_id: NodeID, segment: number): void;
    splitSegment(node_id: NodeID, point: vn.PointOnSegment): void;
    selectTangent(
      node_id: editor.NodeID,
      vertex: number,
      tangent: 0 | 1,
      options: { additive?: boolean }
    ): void;
    translateVertex(
      node_id: NodeID,
      vertex: number,
      delta: cmath.Vector2
    ): void;
    translateSegment(
      node_id: NodeID,
      segment: number,
      delta: cmath.Vector2
    ): void;
    bendSegment(
      node_id: NodeID,
      segment: number,
      ca: number,
      cb: cmath.Vector2,
      frozen: {
        a: cmath.Vector2;
        b: cmath.Vector2;
        ta: cmath.Vector2;
        tb: cmath.Vector2;
      }
    ): void;
    bendOrClearCorner(
      node_id: editor.NodeID,
      vertex: number,
      tangent?: cmath.Vector2 | 0,
      ref?: "ta" | "tb"
    ): void;
    planarize(ids: editor.NodeID | editor.NodeID[]): void;

    selectVariableWidthStop(node_id: NodeID, stop: number): void;
    deleteVariableWidthStop(node_id: NodeID, stop: number): void;
    addVariableWidthStop(node_id: editor.NodeID, u: number, r: number): void;

    //
    getNodeSnapshotById(node_id: NodeID): Readonly<grida.program.nodes.Node>;
    getNodeById(node_id: NodeID): NodeProxy<grida.program.nodes.Node>;
    getNodeDepth(node_id: NodeID): number;
    //

    //
    insertNode(prototype: grida.program.nodes.NodePrototype): NodeID;
    deleteNode(target: "selection" | NodeID): void;
    //

    createNodeFromSvg(
      svg: string
    ): Promise<NodeProxy<grida.program.nodes.ContainerNode>>;
    createImageNode(
      image: grida.program.document.ImageRef
    ): NodeProxy<grida.program.nodes.ImageNode>;
    createTextNode(text: string): NodeProxy<grida.program.nodes.TextNode>;
    createRectangleNode(): NodeProxy<grida.program.nodes.RectangleNode>;

    order(target: "selection" | NodeID, order: "back" | "front" | number): void;
    mv(source: NodeID[], target: NodeID, index?: number): void;

    align(
      target: "selection" | NodeID,
      alignment: {
        horizontal?: "none" | "min" | "max" | "center";
        vertical?: "none" | "min" | "max" | "center";
      }
    ): void;

    //
    distributeEvenly(target: "selection" | NodeID[], axis: "x" | "y"): void;

    /**
     * Wraps selected nodes into new flex containers with automatically detected layout properties.
     *
     * This command analyzes the spatial arrangement of the selected nodes and creates flex containers
     * that preserve their visual appearance while enabling responsive layout behavior. Nodes are grouped
     * by their parent, and each group gets its own container.
     *
     * **Key Behavior:**
     * - **Automatic detection**: Analyzes node positions to determine flex direction, spacing, and alignment
     * - **Parent grouping**: Nodes with different parents are wrapped into separate containers
     * - **Visual preservation**: Maintains the exact visual appearance after wrapping
     * - **Smart defaults**: Applies contextual padding (16px for single child, 0 for multiple)
     *
     * **Bound to**: SHIFT+A
     *
     * @param target - The nodes to wrap:
     *   - `"selection"` - Wraps currently selected nodes
     *   - `NodeID[]` - Wraps specific node IDs
     *
     * @example
     * ```typescript
     * // Wrap currently selected nodes into flex containers
     * editor.commands.autoLayout("selection");
     *
     * // Wrap specific nodes
     * editor.commands.autoLayout(["node-1", "node-2", "node-3"]);
     * ```
     *
     * @remarks
     * **Layout Detection Algorithm:**
     * The command analyzes the bounding rectangles of selected nodes to determine:
     * - **Direction**: Horizontal or vertical based on primary alignment axis
     * - **Spacing**: Gap between nodes (mainAxisGap and crossAxisGap)
     * - **Alignment**: Main and cross axis alignment based on distribution
     * - **Order**: Maintains visual order of nodes within the container
     *
     * **Parent Grouping:**
     * Nodes are automatically grouped by their parent container. For example:
     * - Nodes A, B under parent X → Container 1 in X
     * - Nodes C, D under parent Y → Container 2 in Y
     * - Root nodes E, F → Container 3 at root
     *
     * **Container Properties:**
     * Each created container has:
     * - `layout: "flex"`
     * - `width: "auto"`, `height: "auto"`
     * - Auto-detected `direction`, `mainAxisGap`, `crossAxisGap`
     * - Auto-detected `mainAxisAlignment`, `crossAxisAlignment`
     * - `padding: 16` (single child) or `0` (multiple children)
     * - `position: "absolute"`
     *
     * **Child Updates:**
     * All wrapped children are updated to:
     * - `position: "relative"`
     * - `top`, `right`, `bottom`, `left` are cleared (undefined)
     *
     * @see {@link reLayout} - To change an existing container's layout mode
     * @see {@link contain} - To wrap nodes in a basic container without auto-layout
     */
    autoLayout(target: "selection" | NodeID[]): void;

    /**
     * Re-applies layout mode to an existing container and automatically configures its children.
     *
     * Similar to {@link autoLayout}, but operates on an existing container instead of creating a new one.
     * While `autoLayout` wraps selected nodes into a new flex container, `reLayout` changes an
     * existing container's layout and updates its children accordingly.
     *
     * Unlike {@link changeContainerNodeLayout}, which only updates the parent's layout property,
     * this method also configures the positioning and constraints of all direct children to ensure
     * visual consistency is maintained during the layout transition.
     *
     * **Key Behavior:**
     * - **Idempotent**: No-op if the layout is already in the desired state
     * - **Visual preservation**: Maintains exact visual appearance during transitions
     * - **Container-only**: Requires the target node to be a container type
     *
     * @param node_id - The container node to re-layout (must be type "container")
     * @param layout - The layout mode to apply:
     *   - `"normal"` - Absolute positioning (flow layout)
     *   - `"flex-row"` - Horizontal flexbox layout
     *   - `"flex-column"` - Vertical flexbox layout
     *
     * @throws {AssertionError} If the target node is not a container
     *
     * @example
     * ```typescript
     * // Convert a normal container to horizontal flex layout
     * editor.commands.reLayout("container-id", "flex-row");
     *
     * // Convert to vertical flex layout
     * editor.commands.reLayout("container-id", "flex-column");
     *
     * // Convert a flex container back to normal (flow) layout
     * editor.commands.reLayout("container-id", "normal");
     *
     * // No-op - already in desired state
     * editor.commands.reLayout("container-id", "flex-row"); // Already flex-row
     * editor.commands.reLayout("container-id", "flex-row"); // Does nothing
     * ```
     *
     * @remarks
     * **When changing from normal to flex layout (`"flex-row"` or `"flex-column"`):**
     * - Internally calls {@link autoLayout} on the container's children
     * - Analyzes spatial arrangement to detect optimal flex properties
     * - Applies auto-detected gap, alignment, and direction to the container
     * - Converts children to relative positioning
     * - Preserves exact visual appearance
     *
     * **When changing from flex to normal layout (`"normal"`):**
     * - Captures current absolute positions of all children
     * - Removes all flex-related properties from the container (`layout`, `direction`, `mainAxisGap`, `crossAxisGap`, `mainAxisAlignment`, `crossAxisAlignment`, `layoutWrap`)
     * - Converts children to absolute positioning with calculated positions
     * - Positions are relative to parent's bounding box
     * - Preserves exact visual appearance
     *
     * **Visual Consistency:**
     * Both transitions ensure that the rendered output remains visually identical
     * before and after the operation. Only the internal layout mechanism changes.
     *
     * @see {@link autoLayout} - To wrap nodes into a new flex container
     * @see {@link changeContainerNodeLayout} - To only change the layout property
     */
    reLayout(
      node_id: NodeID,
      layout: "normal" | "flex-row" | "flex-column"
    ): void;

    contain(target: "selection" | NodeID[]): void;

    /**
     * group the nodes
     * @param target - the nodes to group
     */
    group(target: "selection" | NodeID[]): void;

    /**
     * ungroup the nodes (from group or boolean)
     * @param target - the nodes to ungroup
     */
    ungroup(target: "selection" | NodeID[]): void;

    /**
     * delete the guide at the given index
     * @param idx
     */
    deleteGuide(idx: number): void;
  }

  /**
   * node reducer actions that requires font management & font parsing dependencies
   */
  export interface IDocumentNodeTextNodeFontActions {
    changeTextNodeFontFamilySync(
      node_id: NodeID,
      fontFamily: string,
      force?: boolean
    ): Promise<boolean>;

    /**
     * use when font style change or family change
     *
     * | property              | operation        | notes |
     * |-----------------------|------------------|-------|
     * | `fontFamily`          | validate & set   | validate if the requested family / postscript is registered and ready to use, else reject |
     * | `fontPostscriptName`  | set              | |
     * | `fontStyleItalic`     | set              | |
     * | `fontWeight`          | set              | |
     * | `fontWidth`           | set              | |
     * | `fontOpticalSizing`   | set              | |
     * | `fontVariations`      | update / clean   | if instance change, remove not-defined variations |
     * | `fontFeatures`        | clean            | if instance change, remove not-def features |
     */
    changeTextNodeFontStyle(
      node_id: NodeID,
      fontStyleDescription: editor.api.FontStyleChangeDescription
    ): void;

    /**
     * @param node_id text node id
     * @returns the font weight if the node is toggled, false otherwise
     *
     * @remarks
     * not all fonts can be toggled bold, the font should actually have 400 / 700 weight defined.
     */
    toggleTextNodeBold(node_id: NodeID): false | cg.NFontWeight;

    /**
     * @param node_id text node id
     * @returns true if the node is toggled, false otherwise
     *
     * note: the boolean does not return if its italic, it returns the result of successful toggle
     * not all fonts can be toggled italic, the font should actually have italic style defined.
     */
    toggleTextNodeItalic(node_id: NodeID): boolean;
  }

  export interface IDocumentNodeChangeActions {
    toggleNodeActive(node_id: NodeID): void;
    toggleNodeLocked(node_id: NodeID): void;

    changeNodeUserData(node_id: NodeID, userdata: unknown): void;
    changeNodeSize(
      node_id: NodeID,
      axis: "width" | "height",
      value: grida.program.css.LengthPercentage | "auto"
    ): void;

    changeNodePropertyBorder(
      node_id: NodeID,
      border: grida.program.css.Border | undefined
    ): void;
    changeNodePropertyProps(
      node_id: string,
      key: string,
      value?: tokens.StringValueExpression
    ): void;
    changeNodePropertyComponent(node_id: NodeID, component: string): void;
    changeNodePropertyText(
      node_id: NodeID,
      text: tokens.StringValueExpression | null
    ): void;
    changeNodePropertyStyle(
      node_id: NodeID,
      key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
      value: any
    ): void;
    changeNodePropertyMouseCursor(
      node_id: NodeID,
      mouseCursor: cg.SystemMouseCursor
    ): void;
    changeNodePropertySrc(
      node_id: NodeID,
      src?: tokens.StringValueExpression
    ): void;
    changeNodePropertyHref(
      node_id: NodeID,
      href?: grida.program.nodes.i.IHrefable["href"]
    ): void;
    changeNodePropertyTarget(
      node_id: NodeID,
      target?: grida.program.nodes.i.IHrefable["target"]
    ): void;
    changeNodePropertyPositioning(
      node_id: NodeID,
      positioning: grida.program.nodes.i.IPositioning
    ): void;
    changeNodePropertyPositioningMode(
      node_id: NodeID,
      positioningMode: "absolute" | "relative"
    ): void;
    changeNodePropertyCornerRadius(
      node_id: NodeID,
      cornerRadius: cg.CornerRadius
    ): void;
    changeNodePropertyCornerSmoothing(
      node_id: NodeID,
      cornerSmoothing: number
    ): void;
    changeNodePropertyCornerRadiusWithDelta(
      node_id: NodeID,
      delta: number
    ): void;
    changeNodePropertyPointCount(node_id: NodeID, pointCount: number): void;
    changeNodePropertyInnerRadius(node_id: NodeID, innerRadius: number): void;
    changeNodePropertyArcData(
      node_id: NodeID,
      arcData: grida.program.nodes.i.IEllipseArcData
    ): void;
    changeNodePropertyFills(node_id: NodeID, fills: cg.Paint[]): void;
    changeNodePropertyFills(node_id: NodeID[], fills: cg.Paint[]): void;
    changeNodePropertyStrokes(node_id: NodeID, strokes: cg.Paint[]): void;
    changeNodePropertyStrokes(node_id: NodeID[], strokes: cg.Paint[]): void;

    changeNodePropertyStrokeWidth(
      node_id: NodeID,
      strokeWidth: editor.api.NumberChange
    ): void;
    changeNodePropertyStrokeCap(node_id: NodeID, strokeCap: cg.StrokeCap): void;
    changeNodePropertyStrokeAlign(
      node_id: NodeID,
      strokeAlign: cg.StrokeAlign
    ): void;
    changeNodePropertyFit(node_id: NodeID, fit: cg.BoxFit): void;

    addNodeFill(node_id: NodeID, fill: cg.Paint, at?: "start" | "end"): void;
    addNodeFill(node_id: NodeID[], fill: cg.Paint, at?: "start" | "end"): void;

    addNodeStroke(
      node_id: NodeID,
      stroke: cg.Paint,
      at?: "start" | "end"
    ): void;
    addNodeStroke(
      node_id: NodeID[],
      stroke: cg.Paint,
      at?: "start" | "end"
    ): void;

    changeContainerNodePadding(
      node_id: NodeID,
      padding: grida.program.nodes.i.IPadding["padding"]
    ): void;
    changeContainerNodeLayout(
      node_id: NodeID,
      layout: grida.program.nodes.i.IFlexContainer["layout"]
    ): void;

    changeFlexContainerNodeDirection(node_id: string, direction: cg.Axis): void;
    changeFlexContainerNodeMainAxisAlignment(
      node_id: string,
      mainAxisAlignment: cg.MainAxisAlignment
    ): void;
    changeFlexContainerNodeCrossAxisAlignment(
      node_id: string,
      crossAxisAlignment: cg.CrossAxisAlignment
    ): void;
    changeFlexContainerNodeGap(
      node_id: string,
      gap: number | { mainAxisGap: number; crossAxisGap: number }
    ): void;
    changeFlexContainerNodeWrap(node_id: string, wrap: "wrap" | "nowrap"): void;

    changeNodeFilterEffects(node_id: NodeID, effects?: cg.FilterEffect[]): void;
    changeNodeFeShadows(node_id: NodeID, effect?: cg.FeShadow[]): void;
    changeNodeFeBlur(node_id: NodeID, effect?: cg.FeBlur): void;
    changeNodeFeBackdropBlur(
      node_id: NodeID,
      effect?: cg.IFeGaussianBlur
    ): void;

    // ==============================================================
    // TextNode
    // ==============================================================

    changeTextNodeFontWeight(node_id: NodeID, fontWeight: cg.NFontWeight): void;
    changeTextNodeFontKerning(node_id: NodeID, fontKerning: boolean): void;
    changeTextNodeFontWidth(node_id: NodeID, fontWidth: number): void;

    changeTextNodeFontFeature(
      node_id: NodeID,
      feature: cg.OpenTypeFeature,
      value: boolean
    ): void;
    changeTextNodeFontVariation(
      node_id: NodeID,
      key: string,
      value: number
    ): void;
    changeTextNodeFontOpticalSizing(
      node_id: NodeID,
      fontOpticalSizing: cg.OpticalSizing
    ): void;
    changeTextNodeFontSize(
      node_id: NodeID,
      fontSize: editor.api.NumberChange
    ): void;
    changeTextNodeTextAlign(node_id: NodeID, textAlign: cg.TextAlign): void;
    changeTextNodeTextAlignVertical(
      node_id: NodeID,
      textAlignVertical: cg.TextAlignVertical
    ): void;
    changeTextNodeTextTransform(
      node_id: NodeID,
      transform: cg.TextTransform
    ): void;
    changeTextNodeTextDecorationLine(
      node_id: NodeID,
      textDecorationLine: cg.TextDecorationLine
    ): void;
    changeTextNodeTextDecorationStyle(
      node_id: NodeID,
      textDecorationStyle: cg.TextDecorationStyle
    ): void;
    changeTextNodeTextDecorationThickness(
      node_id: NodeID,
      textDecorationThickness: cg.TextDecorationThicknessPercentage
    ): void;
    changeTextNodeTextDecorationColor(
      node_id: NodeID,
      textDecorationColor: cg.TextDecorationColor
    ): void;
    changeTextNodeTextDecorationSkipInk(
      node_id: NodeID,
      textDecorationSkipInk: cg.TextDecorationSkipInkFlag
    ): void;
    changeTextNodeLineHeight(
      node_id: NodeID,
      lineHeight: TChange<grida.program.nodes.TextNode["lineHeight"]>
    ): void;
    changeTextNodeLetterSpacing(
      node_id: NodeID,
      letterSpacing: TChange<grida.program.nodes.TextNode["letterSpacing"]>
    ): void;
    changeTextNodeWordSpacing(
      node_id: NodeID,
      wordSpacing: TChange<grida.program.nodes.TextNode["wordSpacing"]>
    ): void;
    changeTextNodeMaxlength(
      node_id: NodeID,
      maxlength: number | undefined
    ): void;
    changeTextNodeMaxLines(node_id: NodeID, maxLines: number | null): void;

    toggleTextNodeUnderline(node_id: NodeID): void;
    toggleTextNodeLineThrough(node_id: NodeID): void;

    // ==============================================================
  }

  export type EditorCommands = editor.api.IDocumentStoreActions &
    editor.api.IDocumentNodeChangeActions &
    editor.api.IDocumentBrushToolActions &
    editor.api.IDocumentSchemaActions_Experimental;

  /**
   * ## A11y actions
   */
  export interface IEditorA11yActions {
    //
    a11ySetClipboardColor(color: cg.RGBA8888): void;
    a11yNudgeResize(
      target: "selection" | NodeID,
      axis: "x" | "y",
      delta: number
    ): void;

    a11yArrow(
      direction: "up" | "down" | "left" | "right",
      shiftKey: boolean
    ): void;

    a11yAlign(alignment: {
      horizontal?: "min" | "max" | "center";
      vertical?: "min" | "max" | "center";
    }): void;

    /**
     * ux a11y escape command.
     *
     * - In vector content edit mode, prioritizes:
     *   1. resetting active tool to cursor,
     *   2. clearing vector selection,
     *   3. exiting the content edit mode.
     * - Otherwise exits the content edit mode.
     *
     * bind this to `escape` key.
     */
    a11yEscape(): void;

    /**
     * semantic copy command for accessibility features.
     *
     * currently proxies to copying the current selection.
     */
    a11yCopy(): void;

    /**
     * semantic cut command for accessibility features.
     *
     * currently proxies to cutting the current selection.
     */
    a11yCut(): void;

    /**
     * semantic paste command for accessibility features.
     *
     * currently proxies to the standard paste behavior.
     */
    a11yPaste(): void;
    a11yDelete(): void;
    //
    // //
    a11yToggleActive(target: "selection" | NodeID): void;
    a11yToggleLocked(target: "selection" | NodeID): void;
    a11yToggleBold(target: "selection" | NodeID): void;
    a11yToggleItalic(target: "selection" | NodeID): void;
    a11yToggleUnderline(target: "selection" | NodeID): void;
    a11yToggleLineThrough(target: "selection" | NodeID): void;
    // //
    a11ySetOpacity(target: "selection" | NodeID, opacity: number): void;
  }

  /**
   * ## Surface actions
   *
   * Surface actions are grida-distro specific opinionated surface api, which they won't be exposed to public api nor plugin api.
   * They only make sense to be used within grida-distro.
   *
   * Difference between ally* and surface* actions:
   * - a11y actions are "intended" to be used by users, specific to key binded actions, but make sense to be exposed as api as well.
   * - surface actions are "NOT intended" to be used by developers, but rather directly called to UI-specific actions.
   *
   * a11y actions are generic, surface actions are specific.
   */
  export interface IEditorSurfaceActions {
    surfaceHoverNode(node_id: string, event: "enter" | "leave"): void;
    surfaceHoverEnterNode(node_id: string): void;
    surfaceHoverLeaveNode(node_id: string): void;

    /**
     * [gesture/nudge] - used with `nudge` {@link EditorNudgeAction} or `nudge-resize` {@link EditorNudgeResizeAction}
     *
     * By default, nudge is not a gesture, but a command. Unlike dragging, nudge does not has a "duration", as it's snap guides cannot be displayed.
     * To mimic the nudge as a gesture (mostly when needed to display snap guides), use this action.
     *
     * @example when `nudge`, also call `gesture/nudge` to display snap guides. after certain duration, call `gesture/nudge` with `state: "off"`
     */
    surfaceLockNudgeGesture(state: "on" | "off"): void;

    surfaceStartGuideGesture(axis: cmath.Axis, idx: number | -1): void;
    surfaceStartScaleGesture(
      selection: string | string[],
      direction: cmath.CardinalDirection
    ): void;
    surfaceStartSortGesture(
      selection: string | string[],
      node_id: string
    ): void;
    surfaceStartGapGesture(selection: string | string[], axis: "x" | "y"): void;
    surfaceStartPaddingGesture(
      node_id: string,
      side: "top" | "right" | "bottom" | "left"
    ): void;
    surfaceStartCornerRadiusGesture(
      selection: string,
      anchor?: cmath.IntercardinalDirection
    ): void;
    surfaceStartRotateGesture(selection: string): void;
    surfaceStartTranslateVectorNetwork(node_id: string): void;
    surfaceStartCurveGesture(
      node_id: string,
      segment: number,
      control: "ta" | "tb"
    ): void;

    surfacePointerDown(event: PointerEvent): void;
    surfacePointerUp(event: PointerEvent): void;
    surfacePointerMove(event: PointerEvent): void;

    surfaceClick(event: MouseEvent): void;
    surfaceDoubleClick(event: MouseEvent): void;
    surfaceMultipleSelectionOverlayClick(
      group: string[],
      event: MouseEvent
    ): void;

    surfaceDragStart(event: PointerEvent): void;
    surfaceDragEnd(event: PointerEvent): void;
    surfaceDrag(event: TCanvasEventTargetDragGestureState): void;

    // pixel grid
    surfaceConfigurePixelGrid(state: "on" | "off"): void;
    surfaceTogglePixelGrid(): "on" | "off";
    //
    // ruler
    surfaceConfigureRuler(state: "on" | "off"): void;
    surfaceToggleRuler(): "on" | "off";
    //

    //
    surfaceSetTool(tool: editor.state.ToolMode): void;
    surfaceTryExitContentEditMode(): void;
    surfaceTryToggleContentEditMode(): void;
    surfaceTryEnterContentEditMode(): void;
    surfaceTryEnterContentEditMode(
      node_id?: string,
      mode?: "auto" | "paint/gradient" | "paint/image",
      options?: {
        paintIndex?: number;
        paintTarget?: "fill" | "stroke";
      }
    ): void;
    //

    /**
     * select the gradient stop by the given index
     *
     * only effective when content edit mode is {@link editor.state.PaintGradientContentEditMode}
     *
     * @param node_id node id
     * @param stop index of the stop
     */
    surfaceSelectGradientStop(
      node_id: NodeID,
      stop: number,
      options?: {
        paintIndex?: number;
        paintTarget?: "fill" | "stroke";
      }
    ): void;
    //

    /**
     * Updates the hovered control in vector content edit mode.
     *
     * @param hoveredControl - The hovered control with type and index, or null if no control is hovered
     */
    surfaceUpdateVectorHoveredControl(
      hoveredControl: {
        type: editor.state.VectorContentEditModeHoverableGeometryControlType;
        index: number;
      } | null
    ): void;

    //
    surfaceConfigureSurfaceRaycastTargeting(
      config: Partial<state.HitTestingConfig>
    ): void;
    surfaceConfigureMeasurement(measurement: "on" | "off"): void;
    surfaceConfigureTranslateWithCloneModifier(
      translate_with_clone: "on" | "off"
    ): void;
    surfaceConfigureTranslateWithAxisLockModifier(
      tarnslate_with_axis_lock: "on" | "off"
    ): void;
    surfaceConfigureTranslateWithForceDisableSnap(
      translate_with_force_disable_snap: "on" | "off"
    ): void;
    surfaceConfigureTransformWithCenterOriginModifier(
      transform_with_center_origin: "on" | "off"
    ): void;
    surfaceConfigureTransformWithPreserveAspectRatioModifier(
      transform_with_preserve_aspect_ratio: "on" | "off"
    ): void;
    surfaceConfigureRotateWithQuantizeModifier(
      rotate_with_quantize: number | "off"
    ): void;
    surfaceConfigureCurveTangentMirroringModifier(
      curve_tangent_mirroring: vn.TangentMirroringMode
    ): void;

    /**
     * Toggles whether the path tool should keep projecting after connecting
     * to an existing vertex.
     *
     * When set to `"on"`, drawing a path and closing it on an existing
     * vertex will continue extending the path from that vertex. When set to
     * `"off"`, the path gesture concludes on close.
     */
    surfaceConfigurePathKeepProjectingModifier(
      path_keep_projecting: "on" | "off"
    ): void;
    /**
     * Toggles whether padding gestures mirror changes across the same axis.
     *
     * When set to `"on"`, changing one padding side also updates its opposite:
     * - Changing left also changes right (horizontal mirroring)
     * - Changing top also changes bottom (vertical mirroring)
     *
     * Typically toggled when the alt/option key is pressed during a padding gesture.
     */
    surfaceConfigurePaddingWithMirroringModifier(
      padding_with_axis_mirroring: "on" | "off"
    ): void;
    //
  }

  export interface IDocumentSchemaActions_Experimental {
    // //
    schemaDefineProperty(
      key?: string,
      definition?: grida.program.schema.PropertyDefinition
    ): void;
    schemaRenameProperty(key: string, newName: string): void;
    schemaUpdateProperty(
      key: string,
      definition: grida.program.schema.PropertyDefinition
    ): void;
    schemaPutProperty(key: string, value: any): void;
    schemaDeleteProperty(key: string): void;
  }

  export interface IDocumentExportPluginActions {
    exportNodeAs(
      node_id: string,
      format: "PNG" | "JPEG"
    ): Promise<Uint8Array | false>;
    exportNodeAs(node_id: string, format: "PDF"): Promise<Uint8Array | false>;
    exportNodeAs(node_id: string, format: "SVG"): Promise<string | false>;
  }

  export interface ISurfaceMultiplayerFollowPluginActions {
    follow(cursor_id: string): void;
    unfollow(): void;
  }

  export interface ISurfaceMultiplayerCursorChatActions {
    openCursorChat(): void;
    closeCursorChat(): void;
    updateCursorChatMessage(message: string | null): void;
  }
}
