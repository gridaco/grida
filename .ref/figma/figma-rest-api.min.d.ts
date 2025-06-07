export type IsLayerTrait = {
  /**
   * A string uniquely identifying this node within the document.
   */
  id: string;

  /**
   * The name given to the node by the user in the tool.
   */
  name: string;

  /**
   * The type of the node
   */
  type: string;

  /**
   * Whether or not the node is visible on the canvas.
   */
  visible?: boolean;

  /**
   * If true, layer is locked and cannot be edited
   */
  locked?: boolean;

  /**
   * Whether the layer is fixed while the parent is scrolling
   *
   * @deprecated
   */
  isFixed?: boolean;

  /**
   * How layer should be treated when the frame is resized
   */
  scrollBehavior: "SCROLLS" | "FIXED" | "STICKY_SCROLLS";

  /**
   * The rotation of the node, if not 0.
   */
  rotation?: number;

  /**
   * A mapping of a layer's property to component property name of component properties attached to
   * this node. The component property name can be used to look up more information on the
   * corresponding component's or component set's componentPropertyDefinitions.
   */
  componentPropertyReferences?: { [key: string]: string };

  /**
   * Data written by plugins that is visible only to the plugin that wrote it. Requires the
   * `pluginData` to include the ID of the plugin.
   */
  pluginData?: unknown;

  /**
   * Data written by plugins that is visible to all plugins. Requires the `pluginData` parameter to
   * include the string "shared".
   */
  sharedPluginData?: unknown;

  /**
   * A mapping of variable collection ID to mode ID representing the explicitly set modes for this
   * node.
   */
  explicitVariableModes?: { [key: string]: string };
};

export type HasChildrenTrait = {
  /**
   * An array of nodes that are direct children of this node
   */
  children: SubcanvasNode[];
};

export type HasLayoutTrait = {
  /**
   * Bounding box of the node in absolute space coordinates.
   */
  absoluteBoundingBox: Rectangle | null;

  /**
   * The actual bounds of a node accounting for drop shadows, thick strokes, and anything else that
   * may fall outside the node's regular bounding box defined in `x`, `y`, `width`, and `height`. The
   * `x` and `y` inside this property represent the absolute position of the node on the page. This
   * value will be `null` if the node is invisible.
   */
  absoluteRenderBounds: Rectangle | null;

  /**
   * Keep height and width constrained to same ratio.
   */
  preserveRatio?: boolean;

  /**
   * Horizontal and vertical layout constraints for node.
   */
  constraints?: LayoutConstraint;

  /**
   * The top two rows of a matrix that represents the 2D transform of this node relative to its
   * parent. The bottom row of the matrix is implicitly always (0, 0, 1). Use to transform coordinates
   * in geometry. Only present if `geometry=paths` is passed.
   */
  relativeTransform?: Transform;

  /**
   * Width and height of element. This is different from the width and height of the bounding box in
   * that the absolute bounding box represents the element after scaling and rotation. Only present if
   * `geometry=paths` is passed.
   */
  size?: Vector;

  /**
   * Determines if the layer should stretch along the parent's counter axis. This property is only
   * provided for direct children of auto-layout frames.
   *
   * - `INHERIT`
   * - `STRETCH`
   *
   * In previous versions of auto layout, determined how the layer is aligned inside an auto-layout
   * frame. This property is only provided for direct children of auto-layout frames.
   *
   * - `MIN`
   * - `CENTER`
   * - `MAX`
   * - `STRETCH`
   *
   * In horizontal auto-layout frames, "MIN" and "MAX" correspond to "TOP" and "BOTTOM". In vertical
   * auto-layout frames, "MIN" and "MAX" correspond to "LEFT" and "RIGHT".
   */
  layoutAlign?: "INHERIT" | "STRETCH" | "MIN" | "CENTER" | "MAX";

  /**
   * This property is applicable only for direct children of auto-layout frames, ignored otherwise.
   * Determines whether a layer should stretch along the parent's primary axis. A `0` corresponds to a
   * fixed size and `1` corresponds to stretch.
   */
  layoutGrow?: 0 | 1;

  /**
   * Determines whether a layer's size and position should be determined by auto-layout settings or
   * manually adjustable.
   */
  layoutPositioning?: "AUTO" | "ABSOLUTE";

  /**
   * The minimum width of the frame. This property is only applicable for auto-layout frames or direct
   * children of auto-layout frames.
   */
  minWidth?: number;

  /**
   * The maximum width of the frame. This property is only applicable for auto-layout frames or direct
   * children of auto-layout frames.
   */
  maxWidth?: number;

  /**
   * The minimum height of the frame. This property is only applicable for auto-layout frames or
   * direct children of auto-layout frames.
   */
  minHeight?: number;

  /**
   * The maximum height of the frame. This property is only applicable for auto-layout frames or
   * direct children of auto-layout frames.
   */
  maxHeight?: number;

  /**
   * The horizontal sizing setting on this auto-layout frame or frame child.
   *
   * - `FIXED`
   * - `HUG`: only valid on auto-layout frames and text nodes
   * - `FILL`: only valid on auto-layout frame children
   */
  layoutSizingHorizontal?: "FIXED" | "HUG" | "FILL";

  /**
   * The vertical sizing setting on this auto-layout frame or frame child.
   *
   * - `FIXED`
   * - `HUG`: only valid on auto-layout frames and text nodes
   * - `FILL`: only valid on auto-layout frame children
   */
  layoutSizingVertical?: "FIXED" | "HUG" | "FILL";
};

export type HasFramePropertiesTrait = {
  /**
   * Whether or not this node clip content outside of its bounds
   */
  clipsContent: boolean;

  /**
   * Background of the node. This is deprecated, as backgrounds for frames are now in the `fills`
   * field.
   *
   * @deprecated
   */
  background?: Paint[];

  /**
   * Background color of the node. This is deprecated, as frames now support more than a solid color
   * as a background. Please use the `fills` field instead.
   *
   * @deprecated
   */
  backgroundColor?: RGBA;

  /**
   * An array of layout grids attached to this node (see layout grids section for more details). GROUP
   * nodes do not have this attribute
   */
  layoutGrids?: LayoutGrid[];

  /**
   * Whether a node has primary axis scrolling, horizontal or vertical.
   */
  overflowDirection?:
    | "HORIZONTAL_SCROLLING"
    | "VERTICAL_SCROLLING"
    | "HORIZONTAL_AND_VERTICAL_SCROLLING"
    | "NONE";

  /**
   * Whether this layer uses auto-layout to position its children.
   */
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";

  /**
   * Whether the primary axis has a fixed length (determined by the user) or an automatic length
   * (determined by the layout engine). This property is only applicable for auto-layout frames.
   */
  primaryAxisSizingMode?: "FIXED" | "AUTO";

  /**
   * Whether the counter axis has a fixed length (determined by the user) or an automatic length
   * (determined by the layout engine). This property is only applicable for auto-layout frames.
   */
  counterAxisSizingMode?: "FIXED" | "AUTO";

  /**
   * Determines how the auto-layout frame's children should be aligned in the primary axis direction.
   * This property is only applicable for auto-layout frames.
   */
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";

  /**
   * Determines how the auto-layout frame's children should be aligned in the counter axis direction.
   * This property is only applicable for auto-layout frames.
   */
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "BASELINE";

  /**
   * The padding between the left border of the frame and its children. This property is only
   * applicable for auto-layout frames.
   */
  paddingLeft?: number;

  /**
   * The padding between the right border of the frame and its children. This property is only
   * applicable for auto-layout frames.
   */
  paddingRight?: number;

  /**
   * The padding between the top border of the frame and its children. This property is only
   * applicable for auto-layout frames.
   */
  paddingTop?: number;

  /**
   * The padding between the bottom border of the frame and its children. This property is only
   * applicable for auto-layout frames.
   */
  paddingBottom?: number;

  /**
   * The distance between children of the frame. Can be negative. This property is only applicable for
   * auto-layout frames.
   */
  itemSpacing?: number;

  /**
   * Determines the canvas stacking order of layers in this frame. When true, the first layer will be
   * draw on top. This property is only applicable for auto-layout frames.
   */
  itemReverseZIndex?: boolean;

  /**
   * Determines whether strokes are included in layout calculations. When true, auto-layout frames
   * behave like css "box-sizing: border-box". This property is only applicable for auto-layout
   * frames.
   */
  strokesIncludedInLayout?: boolean;

  /**
   * Whether this auto-layout frame has wrapping enabled.
   */
  layoutWrap?: "NO_WRAP" | "WRAP";

  /**
   * The distance between wrapped tracks of an auto-layout frame. This property is only applicable for
   * auto-layout frames with `layoutWrap: "WRAP"`
   */
  counterAxisSpacing?: number;

  /**
   * Determines how the auto-layout frame’s wrapped tracks should be aligned in the counter axis
   * direction. This property is only applicable for auto-layout frames with `layoutWrap: "WRAP"`.
   */
  counterAxisAlignContent?: "AUTO" | "SPACE_BETWEEN";
};

export type HasBlendModeAndOpacityTrait = {
  /**
   * How this node blends with nodes behind it in the scene (see blend mode section for more details)
   */
  blendMode: BlendMode;

  /**
   * Opacity of the node
   */
  opacity?: number;
};

export type HasExportSettingsTrait = {
  /**
   * An array of export settings representing images to export from the node.
   */
  exportSettings?: ExportSetting[];
};

export type HasGeometryTrait = MinimalFillsTrait &
  MinimalStrokesTrait & {
    /**
     * Map from ID to PaintOverride for looking up fill overrides. To see which regions are overriden,
     * you must use the `geometry=paths` option. Each path returned may have an `overrideID` which maps
     * to this table.
     */
    fillOverrideTable?: { [key: string]: PaintOverride | null };

    /**
     * Only specified if parameter `geometry=paths` is used. An array of paths representing the object
     * fill.
     */
    fillGeometry?: Path[];

    /**
     * Only specified if parameter `geometry=paths` is used. An array of paths representing the object
     * stroke.
     */
    strokeGeometry?: Path[];

    /**
     * A string enum describing the end caps of vector paths.
     */
    strokeCap?:
      | "NONE"
      | "ROUND"
      | "SQUARE"
      | "LINE_ARROW"
      | "TRIANGLE_ARROW"
      | "DIAMOND_FILLED"
      | "CIRCLE_FILLED"
      | "TRIANGLE_FILLED"
      | "WASHI_TAPE_1"
      | "WASHI_TAPE_2"
      | "WASHI_TAPE_3"
      | "WASHI_TAPE_4"
      | "WASHI_TAPE_5"
      | "WASHI_TAPE_6";

    /**
     * Only valid if `strokeJoin` is "MITER". The corner angle, in degrees, below which `strokeJoin`
     * will be set to "BEVEL" to avoid super sharp corners. By default this is 28.96 degrees.
     */
    strokeMiterAngle?: number;
  };

export type MinimalFillsTrait = {
  /**
   * An array of fill paints applied to the node.
   */
  fills: Paint[];

  /**
   * A mapping of a StyleType to style ID (see Style) of styles present on this node. The style ID can
   * be used to look up more information about the style in the top-level styles field.
   */
  styles?: { [key: string]: string };
};

export type MinimalStrokesTrait = {
  /**
   * An array of stroke paints applied to the node.
   */
  strokes?: Paint[];

  /**
   * The weight of strokes on the node.
   */
  strokeWeight?: number;

  /**
   * Position of stroke relative to vector outline, as a string enum
   *
   * - `INSIDE`: stroke drawn inside the shape boundary
   * - `OUTSIDE`: stroke drawn outside the shape boundary
   * - `CENTER`: stroke drawn centered along the shape boundary
   */
  strokeAlign?: "INSIDE" | "OUTSIDE" | "CENTER";

  /**
   * A string enum with value of "MITER", "BEVEL", or "ROUND", describing how corners in vector paths
   * are rendered.
   */
  strokeJoin?: "MITER" | "BEVEL" | "ROUND";

  /**
   * An array of floating point numbers describing the pattern of dash length and gap lengths that the
   * vector stroke will use when drawn.
   *
   * For example a value of [1, 2] indicates that the stroke will be drawn with a dash of length 1
   * followed by a gap of length 2, repeated.
   */
  strokeDashes?: number[];
};

export type IndividualStrokesTrait = {
  /**
   * An object including the top, bottom, left, and right stroke weights. Only returned if individual
   * stroke weights are used.
   */
  individualStrokeWeights?: StrokeWeights;
};

export type CornerTrait = {
  /**
   * Radius of each corner if a single radius is set for all corners
   */
  cornerRadius?: number;

  /**
   * A value that lets you control how "smooth" the corners are. Ranges from 0 to 1. 0 is the default
   * and means that the corner is perfectly circular. A value of 0.6 means the corner matches the iOS
   * 7 "squircle" icon shape. Other values produce various other curves.
   */
  cornerSmoothing?: number;

  /**
   * Array of length 4 of the radius of each corner of the frame, starting in the top left and
   * proceeding clockwise.
   *
   * Values are given in the order top-left, top-right, bottom-right, bottom-left.
   */
  rectangleCornerRadii?: number[];
};

export type HasEffectsTrait = {
  /**
   * An array of effects attached to this node (see effects section for more details)
   */
  effects: Effect[];
};

export type HasMaskTrait = {
  /**
   * Does this node mask sibling nodes in front of it?
   */
  isMask?: boolean;

  /**
   * If this layer is a mask, this property describes the operation used to mask the layer's siblings.
   * The value may be one of the following:
   *
   * - ALPHA: the mask node's alpha channel will be used to determine the opacity of each pixel in the
   *   masked result.
   * - VECTOR: if the mask node has visible fill paints, every pixel inside the node's fill regions will
   *   be fully visible in the masked result. If the mask has visible stroke paints, every pixel
   *   inside the node's stroke regions will be fully visible in the masked result.
   * - LUMINANCE: the luminance value of each pixel of the mask node will be used to determine the
   *   opacity of that pixel in the masked result.
   */
  maskType?: "ALPHA" | "VECTOR" | "LUMINANCE";

  /**
   * True if maskType is VECTOR. This field is deprecated; use maskType instead.
   *
   * @deprecated
   */
  isMaskOutline?: boolean;
};

export type ComponentPropertiesTrait = {
  /**
   * A mapping of name to `ComponentPropertyDefinition` for every component property on this
   * component. Each property has a type, defaultValue, and other optional values.
   */
  componentPropertyDefinitions?: { [key: string]: ComponentPropertyDefinition };
};

export type TypePropertiesTrait = {
  /**
   * The raw characters in the text node.
   */
  characters: string;

  /**
   * Style of text including font family and weight.
   */
  style: TypeStyle;

  /**
   * The array corresponds to characters in the text box, where each element references the
   * 'styleOverrideTable' to apply specific styles to each character. The array's length can be less
   * than or equal to the number of characters due to the removal of trailing zeros. Elements with a
   * value of 0 indicate characters that use the default type style. If the array is shorter than the
   * total number of characters, the characters beyond the array's length also use the default style.
   */
  characterStyleOverrides: number[];

  /**
   * Internal property, preserved for backward compatibility. Avoid using this value.
   */
  layoutVersion?: number;

  /**
   * Map from ID to TypeStyle for looking up style overrides.
   */
  styleOverrideTable: { [key: string]: TypeStyle };

  /**
   * An array with the same number of elements as lines in the text node, where lines are delimited by
   * newline or paragraph separator characters. Each element in the array corresponds to the list type
   * of a specific line. List types are represented as string enums with one of these possible
   * values:
   *
   * - `NONE`: Not a list item.
   * - `ORDERED`: Text is an ordered list (numbered).
   * - `UNORDERED`: Text is an unordered list (bulleted).
   */
  lineTypes: ("NONE" | "ORDERED" | "UNORDERED")[];

  /**
   * An array with the same number of elements as lines in the text node, where lines are delimited by
   * newline or paragraph separator characters. Each element in the array corresponds to the
   * indentation level of a specific line.
   */
  lineIndentations: number[];
};

export type TextPathPropertiesTrait = {
  /**
   * The raw characters in the text path node.
   */
  characters: string;

  /**
   * Style of text including font family and weight.
   */
  style: TextPathTypeStyle;

  /**
   * The array corresponds to characters in the text box, where each element references the
   * 'styleOverrideTable' to apply specific styles to each character. The array's length can be less
   * than or equal to the number of characters due to the removal of trailing zeros. Elements with a
   * value of 0 indicate characters that use the default type style. If the array is shorter than the
   * total number of characters, the characters beyond the array's length also use the default style.
   */
  characterStyleOverrides: number[];

  /**
   * Internal property, preserved for backward compatibility. Avoid using this value.
   */
  layoutVersion?: number;

  /**
   * Map from ID to TextPathTypeStyle for looking up style overrides.
   */
  styleOverrideTable: { [key: string]: TextPathTypeStyle };
};

export type HasTextSublayerTrait = {
  /**
   * Text contained within a text box.
   */
  characters: string;
};

export type DevStatusTrait = {
  /**
   * Represents whether or not a node has a particular handoff (or dev) status applied to it.
   */
  devStatus?: {
    type: "NONE" | "READY_FOR_DEV" | "COMPLETED";

    /**
     * An optional field where the designer can add more information about the design and what has
     * changed.
     */
    description?: string;
  };
};

export type AnnotationsTrait = object;

export type FrameTraits = IsLayerTrait &
  HasBlendModeAndOpacityTrait &
  HasChildrenTrait &
  HasLayoutTrait &
  HasFramePropertiesTrait &
  CornerTrait &
  HasGeometryTrait &
  HasExportSettingsTrait &
  HasEffectsTrait &
  HasMaskTrait &
  IndividualStrokesTrait &
  DevStatusTrait &
  AnnotationsTrait;

export type DefaultShapeTraits = IsLayerTrait &
  HasBlendModeAndOpacityTrait &
  HasLayoutTrait &
  HasGeometryTrait &
  HasExportSettingsTrait &
  HasEffectsTrait &
  HasMaskTrait;

export type CornerRadiusShapeTraits = DefaultShapeTraits & CornerTrait;

export type RectangularShapeTraits = DefaultShapeTraits &
  CornerTrait &
  IndividualStrokesTrait &
  AnnotationsTrait;

export type Node =
  | BooleanOperationNode
  | ComponentNode
  | ComponentSetNode
  | EllipseNode
  | FrameNode
  | GroupNode
  | InstanceNode
  | LineNode
  | RectangleNode
  | RegularPolygonNode
  | SectionNode
  | SliceNode
  | StarNode
  | StickyNode
  | TableNode
  | TableCellNode
  | TextNode
  | TextPathNode
  | TransformGroupNode
  | VectorNode
  | DocumentNode
  | CanvasNode;

export type DocumentNode = {
  type: "DOCUMENT";

  children: CanvasNode[];
} & IsLayerTrait;

export type CanvasNode = {
  type: "CANVAS";

  children: SubcanvasNode[];

  /**
   * Background color of the canvas.
   */
  backgroundColor: RGBA;

  /**
   * Node ID that corresponds to the start frame for prototypes. This is deprecated with the
   * introduction of multiple flows. Please use the `flowStartingPoints` field.
   *
   * @deprecated
   */
  prototypeStartNodeID: string | null;

  /**
   * An array of flow starting points sorted by its position in the prototype settings panel.
   */
  flowStartingPoints: FlowStartingPoint[];

  /**
   * The device used to view a prototype.
   */
  prototypeDevice: PrototypeDevice;

  /**
   * The background color of the prototype (currently only supports a single solid color paint).
   */
  prototypeBackgrounds?: RGBA[];
} & IsLayerTrait &
  HasExportSettingsTrait;

export type SubcanvasNode =
  | BooleanOperationNode
  | ComponentNode
  | ComponentSetNode
  | EllipseNode
  | FrameNode
  | GroupNode
  | InstanceNode
  | LineNode
  | RectangleNode
  | RegularPolygonNode
  | SectionNode
  | SliceNode
  | StarNode
  | StickyNode
  | TableNode
  | TableCellNode
  | TextNode
  | TextPathNode
  | TransformGroupNode
  | VectorNode;

export type BooleanOperationNode = {
  /**
   * The type of this node, represented by the string literal "BOOLEAN_OPERATION"
   */
  type: "BOOLEAN_OPERATION";

  /**
   * A string enum indicating the type of boolean operation applied.
   */
  booleanOperation: "UNION" | "INTERSECT" | "SUBTRACT" | "EXCLUDE";
} & IsLayerTrait &
  HasBlendModeAndOpacityTrait &
  HasChildrenTrait &
  HasLayoutTrait &
  HasGeometryTrait &
  HasExportSettingsTrait &
  HasEffectsTrait &
  HasMaskTrait;

export type SectionNode = {
  /**
   * The type of this node, represented by the string literal "SECTION"
   */
  type: "SECTION";

  /**
   * Whether the contents of the section are visible
   */
  sectionContentsHidden: boolean;
} & IsLayerTrait &
  HasGeometryTrait &
  HasChildrenTrait &
  HasLayoutTrait &
  DevStatusTrait;

export type FrameNode = {
  /**
   * The type of this node, represented by the string literal "FRAME"
   */
  type: "FRAME";
} & FrameTraits;

export type GroupNode = {
  /**
   * The type of this node, represented by the string literal "GROUP"
   */
  type: "GROUP";
} & FrameTraits;

export type ComponentNode = {
  /**
   * The type of this node, represented by the string literal "COMPONENT"
   */
  type: "COMPONENT";
} & FrameTraits &
  ComponentPropertiesTrait;

export type ComponentSetNode = {
  /**
   * The type of this node, represented by the string literal "COMPONENT_SET"
   */
  type: "COMPONENT_SET";
} & FrameTraits &
  ComponentPropertiesTrait;

export type VectorNode = {
  /**
   * The type of this node, represented by the string literal "VECTOR"
   */
  type: "VECTOR";
} & CornerRadiusShapeTraits &
  AnnotationsTrait;

export type StarNode = {
  /**
   * The type of this node, represented by the string literal "STAR"
   */
  type: "STAR";
} & CornerRadiusShapeTraits &
  AnnotationsTrait;

export type LineNode = {
  /**
   * The type of this node, represented by the string literal "LINE"
   */
  type: "LINE";
} & DefaultShapeTraits &
  AnnotationsTrait;

export type EllipseNode = {
  /**
   * The type of this node, represented by the string literal "ELLIPSE"
   */
  type: "ELLIPSE";

  arcData: ArcData;
} & DefaultShapeTraits &
  AnnotationsTrait;

export type RegularPolygonNode = {
  /**
   * The type of this node, represented by the string literal "REGULAR_POLYGON"
   */
  type: "REGULAR_POLYGON";
} & CornerRadiusShapeTraits &
  AnnotationsTrait;

export type RectangleNode = {
  /**
   * The type of this node, represented by the string literal "RECTANGLE"
   */
  type: "RECTANGLE";
} & RectangularShapeTraits;

export type TextNode = {
  /**
   * The type of this node, represented by the string literal "TEXT"
   */
  type: "TEXT";
} & DefaultShapeTraits &
  TypePropertiesTrait &
  AnnotationsTrait;

export type TextPathNode = {
  /**
   * The type of this node, represented by the string literal "TEXT_PATH"
   */
  type: "TEXT_PATH";
} & DefaultShapeTraits &
  TextPathPropertiesTrait;

export type TableNode = {
  /**
   * The type of this node, represented by the string literal "TABLE"
   */
  type: "TABLE";
} & IsLayerTrait &
  HasChildrenTrait &
  HasLayoutTrait &
  MinimalStrokesTrait &
  HasEffectsTrait &
  HasBlendModeAndOpacityTrait &
  HasExportSettingsTrait;

export type TableCellNode = {
  /**
   * The type of this node, represented by the string literal "TABLE_CELL"
   */
  type: "TABLE_CELL";
} & IsLayerTrait &
  MinimalFillsTrait &
  HasLayoutTrait &
  HasTextSublayerTrait;

export type TransformGroupNode = {
  /**
   * The type of this node, represented by the string literal "TRANSFORM_GROUP"
   */
  type: "TRANSFORM_GROUP";
} & FrameTraits;

export type SliceNode = {
  /**
   * The type of this node, represented by the string literal "SLICE"
   */
  type: "SLICE";
} & IsLayerTrait;

export type InstanceNode = {
  /**
   * The type of this node, represented by the string literal "INSTANCE"
   */
  type: "INSTANCE";

  /**
   * ID of component that this instance came from.
   */
  componentId: string;

  /**
   * If true, this node has been marked as exposed to its containing component or component set.
   */
  isExposedInstance?: boolean;

  /**
   * IDs of instances that have been exposed to this node's level.
   */
  exposedInstances?: string[];

  /**
   * A mapping of name to `ComponentProperty` for all component properties on this instance. Each
   * property has a type, value, and other optional values.
   */
  componentProperties?: { [key: string]: ComponentProperty };

  /**
   * An array of all of the fields directly overridden on this instance. Inherited overrides are not
   * included.
   */
  overrides: Overrides[];
} & FrameTraits;

export type StickyNode = {
  /**
   * The type of this node, represented by the string literal "STICKY"
   */
  type: "STICKY";

  /**
   * If true, author name is visible.
   */
  authorVisible?: boolean;
} & IsLayerTrait &
  HasLayoutTrait &
  HasBlendModeAndOpacityTrait &
  MinimalFillsTrait &
  HasMaskTrait &
  HasEffectsTrait &
  HasExportSettingsTrait &
  HasTextSublayerTrait;

/**
 * An RGB color
 */
export type RGB = {
  /**
   * Red channel value, between 0 and 1.
   */
  r: number;

  /**
   * Green channel value, between 0 and 1.
   */
  g: number;

  /**
   * Blue channel value, between 0 and 1.
   */
  b: number;
};

/**
 * An RGBA color
 */
export type RGBA = {
  /**
   * Red channel value, between 0 and 1.
   */
  r: number;

  /**
   * Green channel value, between 0 and 1.
   */
  g: number;

  /**
   * Blue channel value, between 0 and 1.
   */
  b: number;

  /**
   * Alpha channel value, between 0 and 1.
   */
  a: number;
};

/**
 * A flow starting point used when launching a prototype to enter Presentation view.
 */
export type FlowStartingPoint = {
  /**
   * Unique identifier specifying the frame.
   */
  nodeId: string;

  /**
   * Name of flow.
   */
  name: string;
};

/**
 * A width and a height.
 */
export type Size = {
  /**
   * The width of a size.
   */
  width: number;

  /**
   * The height of a size.
   */
  height: number;
};

/**
 * The device used to view a prototype.
 */
export type PrototypeDevice = {
  type: "NONE" | "PRESET" | "CUSTOM" | "PRESENTATION";

  size?: Size;

  presetIdentifier?: string;

  rotation: "NONE" | "CCW_90";
};

/**
 * Sizing constraint for exports.
 */
export type Constraint = {
  /**
   * Type of constraint to apply:
   *
   * - `SCALE`: Scale by `value`.
   * - `WIDTH`: Scale proportionally and set width to `value`.
   * - `HEIGHT`: Scale proportionally and set height to `value`.
   */
  type: "SCALE" | "WIDTH" | "HEIGHT";

  /**
   * See type property for effect of this field.
   */
  value: number;
};

/**
 * An export setting.
 */
export type ExportSetting = {
  suffix: string;

  format: "JPG" | "PNG" | "SVG" | "PDF";

  constraint: Constraint;
};

/**
 * This type is a string enum with the following possible values
 *
 * Normal blends:
 *
 * - `PASS_THROUGH` (only applicable to objects with children)
 * - `NORMAL`
 *
 * Darken:
 *
 * - `DARKEN`
 * - `MULTIPLY`
 * - `LINEAR_BURN`
 * - `COLOR_BURN`
 *
 * Lighten:
 *
 * - `LIGHTEN`
 * - `SCREEN`
 * - `LINEAR_DODGE`
 * - `COLOR_DODGE`
 *
 * Contrast:
 *
 * - `OVERLAY`
 * - `SOFT_LIGHT`
 * - `HARD_LIGHT`
 *
 * Inversion:
 *
 * - `DIFFERENCE`
 * - `EXCLUSION`
 *
 * Component:
 *
 * - `HUE`
 * - `SATURATION`
 * - `COLOR`
 * - `LUMINOSITY`
 */
export type BlendMode =
  | "PASS_THROUGH"
  | "NORMAL"
  | "DARKEN"
  | "MULTIPLY"
  | "LINEAR_BURN"
  | "COLOR_BURN"
  | "LIGHTEN"
  | "SCREEN"
  | "LINEAR_DODGE"
  | "COLOR_DODGE"
  | "OVERLAY"
  | "SOFT_LIGHT"
  | "HARD_LIGHT"
  | "DIFFERENCE"
  | "EXCLUSION"
  | "HUE"
  | "SATURATION"
  | "COLOR"
  | "LUMINOSITY";

/**
 * A 2d vector.
 */
export type Vector = {
  /**
   * X coordinate of the vector.
   */
  x: number;

  /**
   * Y coordinate of the vector.
   */
  y: number;
};

/**
 * A single color stop with its position along the gradient axis, color, and bound variables if any
 */
export type ColorStop = {
  /**
   * Value between 0 and 1 representing position along gradient axis.
   */
  position: number;

  /**
   * Color attached to corresponding position.
   */
  color: RGBA;
};

/**
 * A transformation matrix is standard way in computer graphics to represent translation and
 * rotation. These are the top two rows of a 3x3 matrix. The bottom row of the matrix is assumed to
 * be [0, 0, 1]. This is known as an affine transform and is enough to represent translation,
 * rotation, and skew.
 *
 * The identity transform is [[1, 0, 0], [0, 1, 0]].
 *
 * A translation matrix will typically look like:
 *
 *     ;[
 *       [1, 0, tx],
 *       [0, 1, ty],
 *     ]
 *
 * And a rotation matrix will typically look like:
 *
 *     ;[
 *       [cos(angle), sin(angle), 0],
 *       [-sin(angle), cos(angle), 0],
 *     ]
 *
 * Another way to think about this transform is as three vectors:
 *
 * - The x axis (t[0][0], t[1][0])
 * - The y axis (t[0][1], t[1][1])
 * - The translation offset (t[0][2], t[1][2])
 *
 * The most common usage of the Transform matrix is the `relativeTransform property`. This
 * particular usage of the matrix has a few additional restrictions. The translation offset can take
 * on any value but we do enforce that the axis vectors are unit vectors (i.e. have length 1). The
 * axes are not required to be at 90° angles to each other.
 */
export type Transform = number[][];

/**
 * Image filters to apply to the node.
 */
export type ImageFilters = {
  exposure?: number;

  contrast?: number;

  saturation?: number;

  temperature?: number;

  tint?: number;

  highlights?: number;

  shadows?: number;
};

export type BasePaint = {
  /**
   * Is the paint enabled?
   */
  visible?: boolean;

  /**
   * Overall opacity of paint (colors within the paint can also have opacity values which would blend
   * with this)
   */
  opacity?: number;

  /**
   * How this node blends with nodes behind it in the scene
   */
  blendMode: BlendMode;
};

export type SolidPaint = {
  /**
   * The string literal "SOLID" representing the paint's type. Always check the `type` before reading
   * other properties.
   */
  type: "SOLID";

  /**
   * Solid color of the paint
   */
  color: RGBA;
} & BasePaint;

export type GradientPaint = {
  /**
   * The string literal representing the paint's type. Always check the `type` before reading other
   * properties.
   */
  type:
    | "GRADIENT_LINEAR"
    | "GRADIENT_RADIAL"
    | "GRADIENT_ANGULAR"
    | "GRADIENT_DIAMOND";

  /**
   * This field contains three vectors, each of which are a position in normalized object space
   * (normalized object space is if the top left corner of the bounding box of the object is (0, 0)
   * and the bottom right is (1,1)). The first position corresponds to the start of the gradient
   * (value 0 for the purposes of calculating gradient stops), the second position is the end of the
   * gradient (value 1), and the third handle position determines the width of the gradient.
   */
  gradientHandlePositions: Vector[];

  /**
   * Positions of key points along the gradient axis with the colors anchored there. Colors along the
   * gradient are interpolated smoothly between neighboring gradient stops.
   */
  gradientStops: ColorStop[];
} & BasePaint;

export type ImagePaint = {
  /**
   * The string literal "IMAGE" representing the paint's type. Always check the `type` before reading
   * other properties.
   */
  type: "IMAGE";

  /**
   * Image scaling mode.
   */
  scaleMode: "FILL" | "FIT" | "TILE" | "STRETCH";

  /**
   * A reference to an image embedded in this node. To download the image using this reference, use
   * the `GET file images` endpoint to retrieve the mapping from image references to image URLs.
   */
  imageRef: string;

  /**
   * Affine transform applied to the image, only present if `scaleMode` is `STRETCH`
   */
  imageTransform?: Transform;

  /**
   * Amount image is scaled by in tiling, only present if scaleMode is `TILE`.
   */
  scalingFactor?: number;

  /**
   * Defines what image filters have been applied to this paint, if any. If this property is not
   * defined, no filters have been applied.
   */
  filters?: ImageFilters;

  /**
   * Image rotation, in degrees.
   */
  rotation?: number;

  /**
   * A reference to an animated GIF embedded in this node. To download the image using this reference,
   * use the `GET file images` endpoint to retrieve the mapping from image references to image URLs.
   */
  gifRef?: string;
} & BasePaint;

export type PatternPaint = {
  /**
   * The string literal "PATTERN" representing the paint's type. Always check the `type` before
   * reading other properties.
   */
  type: "PATTERN";

  /**
   * The node id of the source node for the pattern
   */
  sourceNodeId: string;

  /**
   * The tile type for the pattern
   */
  tileType: "RECTANGULAR" | "HORIZONTAL_HEXAGONAL" | "VERTICAL_HEXAGONAL";

  /**
   * The scaling factor for the pattern
   */
  scalingFactor: number;

  /**
   * The spacing for the pattern
   */
  spacing: Vector;

  /**
   * The horizontal alignment for the pattern
   */
  horizontalAlignment: "START" | "CENTER" | "END";

  /**
   * The vertical alignment for the pattern
   */
  verticalAlignment: "START" | "CENTER" | "END";
} & BasePaint;

export type Paint = SolidPaint | GradientPaint | ImagePaint | PatternPaint;

/**
 * Layout constraint relative to containing Frame
 */
export type LayoutConstraint = {
  /**
   * Vertical constraint (relative to containing frame) as an enum:
   *
   * - `TOP`: Node is laid out relative to top of the containing frame
   * - `BOTTOM`: Node is laid out relative to bottom of the containing frame
   * - `CENTER`: Node is vertically centered relative to containing frame
   * - `TOP_BOTTOM`: Both top and bottom of node are constrained relative to containing frame (node
   *   stretches with frame)
   * - `SCALE`: Node scales vertically with containing frame
   */
  vertical: "TOP" | "BOTTOM" | "CENTER" | "TOP_BOTTOM" | "SCALE";

  /**
   * Horizontal constraint (relative to containing frame) as an enum:
   *
   * - `LEFT`: Node is laid out relative to left of the containing frame
   * - `RIGHT`: Node is laid out relative to right of the containing frame
   * - `CENTER`: Node is horizontally centered relative to containing frame
   * - `LEFT_RIGHT`: Both left and right of node are constrained relative to containing frame (node
   *   stretches with frame)
   * - `SCALE`: Node scales horizontally with containing frame
   */
  horizontal: "LEFT" | "RIGHT" | "CENTER" | "LEFT_RIGHT" | "SCALE";
};

/**
 * A rectangle that expresses a bounding box in absolute coordinates.
 */
export type Rectangle = {
  /**
   * X coordinate of top left corner of the rectangle.
   */
  x: number;

  /**
   * Y coordinate of top left corner of the rectangle.
   */
  y: number;

  /**
   * Width of the rectangle.
   */
  width: number;

  /**
   * Height of the rectangle.
   */
  height: number;
};

/**
 * Guides to align and place objects within a frames.
 */
export type LayoutGrid = {
  /**
   * Orientation of the grid as a string enum
   *
   * - `COLUMNS`: Vertical grid
   * - `ROWS`: Horizontal grid
   * - `GRID`: Square grid
   */
  pattern: "COLUMNS" | "ROWS" | "GRID";

  /**
   * Width of column grid or height of row grid or square grid spacing.
   */
  sectionSize: number;

  /**
   * Is the grid currently visible?
   */
  visible: boolean;

  /**
   * Color of the grid
   */
  color: RGBA;

  /**
   * Positioning of grid as a string enum
   *
   * - `MIN`: Grid starts at the left or top of the frame
   * - `MAX`: Grid starts at the right or bottom of the frame
   * - `STRETCH`: Grid is stretched to fit the frame
   * - `CENTER`: Grid is center aligned
   */
  alignment: "MIN" | "MAX" | "STRETCH" | "CENTER";

  /**
   * Spacing in between columns and rows
   */
  gutterSize: number;

  /**
   * Spacing before the first column or row
   */
  offset: number;

  /**
   * Number of columns or rows
   */
  count: number;
};

/**
 * Base properties shared by all shadow effects
 */
export type BaseShadowEffect = {
  /**
   * The color of the shadow
   */
  color: RGBA;

  /**
   * Blend mode of the shadow
   */
  blendMode: BlendMode;

  /**
   * How far the shadow is projected in the x and y directions
   */
  offset: Vector;

  /**
   * Radius of the blur effect (applies to shadows as well)
   */
  radius: number;

  /**
   * The distance by which to expand (or contract) the shadow.
   *
   * For drop shadows, a positive `spread` value creates a shadow larger than the node, whereas a
   * negative value creates a shadow smaller than the node.
   *
   * For inner shadows, a positive `spread` value contracts the shadow. Spread values are only
   * accepted on rectangles and ellipses, or on frames, components, and instances with visible fill
   * paints and `clipsContent` enabled. When left unspecified, the default value is 0.
   */
  spread?: number;

  /**
   * Whether this shadow is visible.
   */
  visible: boolean;
};

export type DropShadowEffect = {
  /**
   * A string literal representing the effect's type. Always check the type before reading other
   * properties.
   */
  type: "DROP_SHADOW";

  /**
   * Whether to show the shadow behind translucent or transparent pixels
   */
  showShadowBehindNode: boolean;
} & BaseShadowEffect;

export type InnerShadowEffect = {
  /**
   * A string literal representing the effect's type. Always check the type before reading other
   * properties.
   */
  type?: "INNER_SHADOW";
} & BaseShadowEffect;

export type BlurEffect = NormalBlurEffect | ProgressiveBlurEffect;

/**
 * Base properties shared by all blur effects
 */
export type BaseBlurEffect = {
  /**
   * A string literal representing the effect's type. Always check the type before reading other
   * properties.
   */
  type: "LAYER_BLUR" | "BACKGROUND_BLUR";

  /**
   * Whether this blur is active.
   */
  visible: boolean;

  /**
   * Radius of the blur effect
   */
  radius: number;
};

export type NormalBlurEffect = {
  /**
   * The string literal 'NORMAL' representing the blur type. Always check the blurType before reading
   * other properties.
   */
  blurType?: "NORMAL";
} & BaseBlurEffect;

export type ProgressiveBlurEffect = {
  /**
   * The string literal 'PROGRESSIVE' representing the blur type. Always check the blurType before
   * reading other properties.
   */
  blurType: "PROGRESSIVE";

  /**
   * The starting radius of the progressive blur
   */
  startRadius: number;

  /**
   * The starting offset of the progressive blur
   */
  startOffset: Vector;

  /**
   * The ending offset of the progressive blur
   */
  endOffset: Vector;
} & BaseBlurEffect;

/**
 * A texture effect
 */
export type TextureEffect = {
  /**
   * The string literal 'TEXTURE' representing the effect's type. Always check the type before reading
   * other properties.
   */
  type: "TEXTURE";

  /**
   * The size of the texture effect
   */
  noiseSize: number;

  /**
   * The radius of the texture effect
   */
  radius: number;

  /**
   * Whether the texture is clipped to the shape
   */
  clipToShape: boolean;
};

export type MonotoneNoiseEffect = {
  /**
   * The string literal 'MONOTONE' representing the noise type.
   */
  noiseType: "MONOTONE";
} & BaseNoiseEffect;

export type MultitoneNoiseEffect = {
  /**
   * The string literal 'MULTITONE' representing the noise type.
   */
  noiseType: "MULTITONE";

  /**
   * The opacity of the noise effect
   */
  opacity: number;
} & BaseNoiseEffect;

export type DuotoneNoiseEffect = {
  /**
   * The string literal 'DUOTONE' representing the noise type.
   */
  noiseType: "DUOTONE";

  /**
   * The secondary color of the noise effect
   */
  secondaryColor: RGBA;
} & BaseNoiseEffect;

/**
 * A noise effect
 */
export type BaseNoiseEffect = {
  /**
   * The string literal 'NOISE' representing the effect's type. Always check the type before reading
   * other properties.
   */
  type: "NOISE";

  /**
   * Blend mode of the noise effect
   */
  blendMode: BlendMode;

  /**
   * The size of the noise effect
   */
  noiseSize: number;

  /**
   * The density of the noise effect
   */
  density: number;
};

export type NoiseEffect =
  | MonotoneNoiseEffect
  | MultitoneNoiseEffect
  | DuotoneNoiseEffect;

export type Effect =
  | DropShadowEffect
  | InnerShadowEffect
  | BlurEffect
  | TextureEffect
  | NoiseEffect;

/**
 * A set of properties that can be applied to nodes and published. Styles for a property can be
 * created in the corresponding property's panel while editing a file.
 */
export type Style = {
  /**
   * The key of the style
   */
  key: string;

  /**
   * Name of the style
   */
  name: string;

  /**
   * Description of the style
   */
  description: string;

  /**
   * Whether this style is a remote style that doesn't live in this file
   */
  remote: boolean;
};

/**
 * This type is a string enum with the following possible values:
 *
 * - `EASE_IN`: Ease in with an animation curve similar to CSS ease-in.
 * - `EASE_OUT`: Ease out with an animation curve similar to CSS ease-out.
 * - `EASE_IN_AND_OUT`: Ease in and then out with an animation curve similar to CSS ease-in-out.
 * - `LINEAR`: No easing, similar to CSS linear.
 * - `EASE_IN_BACK`: Ease in with an animation curve that moves past the initial keyframe's value and
 *   then accelerates as it reaches the end.
 * - `EASE_OUT_BACK`: Ease out with an animation curve that starts fast, then slows and goes past the
 *   ending keyframe's value.
 * - `EASE_IN_AND_OUT_BACK`: Ease in and then out with an animation curve that overshoots the initial
 *   keyframe's value, then accelerates quickly before it slows and overshoots the ending keyframes
 *   value.
 * - `CUSTOM_CUBIC_BEZIER`: User-defined cubic bezier curve.
 * - `GENTLE`: Gentle animation similar to react-spring.
 * - `QUICK`: Quick spring animation, great for toasts and notifications.
 * - `BOUNCY`: Bouncy spring, for delightful animations like a heart bounce.
 * - `SLOW`: Slow spring, useful as a steady, natural way to scale up fullscreen content.
 * - `CUSTOM_SPRING`: User-defined spring animation.
 */
export type EasingType =
  | "EASE_IN"
  | "EASE_OUT"
  | "EASE_IN_AND_OUT"
  | "LINEAR"
  | "EASE_IN_BACK"
  | "EASE_OUT_BACK"
  | "EASE_IN_AND_OUT_BACK"
  | "CUSTOM_CUBIC_BEZIER"
  | "GENTLE"
  | "QUICK"
  | "BOUNCY"
  | "SLOW"
  | "CUSTOM_SPRING";

/**
 * Individual stroke weights
 */
export type StrokeWeights = {
  /**
   * The top stroke weight.
   */
  top: number;

  /**
   * The right stroke weight.
   */
  right: number;

  /**
   * The bottom stroke weight.
   */
  bottom: number;

  /**
   * The left stroke weight.
   */
  left: number;
};

/**
 * Paint metadata to override default paints.
 */
export type PaintOverride = {
  /**
   * Paints applied to characters.
   */
  fills?: Paint[];

  /**
   * ID of style node, if any, that this inherits fill data from.
   */
  inheritFillStyleId?: string;
};

/**
 * Defines a single path
 */
export type Path = {
  /**
   * A series of path commands that encodes how to draw the path.
   */
  path: string;

  /**
   * The winding rule for the path (same as in SVGs). This determines whether a given point in space
   * is inside or outside the path.
   */
  windingRule: "NONZERO" | "EVENODD";

  /**
   * If there is a per-region fill, this refers to an ID in the `fillOverrideTable`.
   */
  overrideID?: number;
};

/**
 * Information about the arc properties of an ellipse. 0° is the x axis and increasing angles rotate
 * clockwise.
 */
export type ArcData = {
  /**
   * Start of the sweep in radians.
   */
  startingAngle: number;

  /**
   * End of the sweep in radians.
   */
  endingAngle: number;

  /**
   * Inner radius value between 0 and 1
   */
  innerRadius: number;
};

/**
 * A link to either a URL or another frame (node) in the document.
 */
export type Hyperlink = {
  /**
   * The type of hyperlink. Can be either `URL` or `NODE`.
   */
  type: "URL" | "NODE";

  /**
   * The URL that the hyperlink points to, if `type` is `URL`.
   */
  url?: string;

  /**
   * The ID of the node that the hyperlink points to, if `type` is `NODE`.
   */
  nodeID?: string;
};

export type BaseTypeStyle = {
  /**
   * Font family of text (standard name).
   */
  fontFamily?: string;

  /**
   * PostScript font name.
   */
  fontPostScriptName?: string | null;

  /**
   * Describes visual weight or emphasis, such as Bold or Italic.
   */
  fontStyle?: string;

  /**
   * Whether or not text is italicized.
   */
  italic?: boolean;

  /**
   * Numeric font weight.
   */
  fontWeight?: number;

  /**
   * Font size in px.
   */
  fontSize?: number;

  /**
   * Text casing applied to the node, default is the original casing.
   */
  textCase?: "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS" | "SMALL_CAPS_FORCED";

  /**
   * Horizontal text alignment as string enum.
   */
  textAlignHorizontal?: "LEFT" | "RIGHT" | "CENTER" | "JUSTIFIED";

  /**
   * Vertical text alignment as string enum.
   */
  textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";

  /**
   * Space between characters in px.
   */
  letterSpacing?: number;

  /**
   * An array of fill paints applied to the characters.
   */
  fills?: Paint[];

  /**
   * Link to a URL or frame.
   */
  hyperlink?: Hyperlink;

  /**
   * A map of OpenType feature flags to 1 or 0, 1 if it is enabled and 0 if it is disabled. Note that
   * some flags aren't reflected here. For example, SMCP (small caps) is still represented by the
   * `textCase` field.
   */
  opentypeFlags?: { [key: string]: number };

  /**
   * Indicates how the font weight was overridden when there is a text style override.
   */
  semanticWeight?: "BOLD" | "NORMAL";

  /**
   * Indicates how the font style was overridden when there is a text style override.
   */
  semanticItalic?: "ITALIC" | "NORMAL";
};

export type TypeStyle = {
  /**
   * Space between paragraphs in px, 0 if not present.
   */
  paragraphSpacing?: number;

  /**
   * Paragraph indentation in px, 0 if not present.
   */
  paragraphIndent?: number;

  /**
   * Space between list items in px, 0 if not present.
   */
  listSpacing?: number;

  /**
   * Text decoration applied to the node, default is none.
   */
  textDecoration?: "NONE" | "STRIKETHROUGH" | "UNDERLINE";

  /**
   * Dimensions along which text will auto resize, default is that the text does not auto-resize.
   * TRUNCATE means that the text will be shortened and trailing text will be replaced with "…" if the
   * text contents is larger than the bounds. `TRUNCATE` as a return value is deprecated and will be
   * removed in a future version. Read from `textTruncation` instead.
   */
  textAutoResize?: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE";

  /**
   * Whether this text node will truncate with an ellipsis when the text contents is larger than the
   * text node.
   */
  textTruncation?: "DISABLED" | "ENDING";

  /**
   * When `textTruncation: "ENDING"` is set, `maxLines` determines how many lines a text node can grow
   * to before it truncates.
   */
  maxLines?: number;

  /**
   * Line height in px.
   */
  lineHeightPx?: number;

  /**
   * Line height as a percentage of normal line height. This is deprecated; in a future version of the
   * API only lineHeightPx and lineHeightPercentFontSize will be returned.
   */
  lineHeightPercent?: number;

  /**
   * Line height as a percentage of the font size. Only returned when `lineHeightPercent` (deprecated)
   * is not 100.
   */
  lineHeightPercentFontSize?: number;

  /**
   * The unit of the line height value specified by the user.
   */
  lineHeightUnit?: "PIXELS" | "FONT_SIZE_%" | "INTRINSIC_%";

  /**
   * Whether or not this style has overrides over a text style. The possible fields to override are
   * semanticWeight, semanticItalic, hyperlink, and textDecoration. If this is true, then those fields
   * are overrides if present.
   */
  isOverrideOverTextStyle?: boolean;
} & BaseTypeStyle;

export type TextPathTypeStyle = {
  /**
   * Whether or not this style has overrides over a text style. The possible fields to override are
   * semanticWeight, semanticItalic, and hyperlink. If this is true, then those fields are overrides
   * if present.
   */
  isOverrideOverTextStyle?: boolean;
} & BaseTypeStyle;

/**
 * Component property type.
 */
export type ComponentPropertyType =
  | "BOOLEAN"
  | "INSTANCE_SWAP"
  | "TEXT"
  | "VARIANT";

/**
 * Instance swap preferred value.
 */
export type InstanceSwapPreferredValue = {
  /**
   * Type of node for this preferred value.
   */
  type: "COMPONENT" | "COMPONENT_SET";

  /**
   * Key of this component or component set.
   */
  key: string;
};

/**
 * A property of a component.
 */
export type ComponentPropertyDefinition = {
  /**
   * Type of this component property.
   */
  type: ComponentPropertyType;

  /**
   * Initial value of this property for instances.
   */
  defaultValue: boolean | string;

  /**
   * All possible values for this property. Only exists on VARIANT properties.
   */
  variantOptions?: string[];

  /**
   * Preferred values for this property. Only applicable if type is `INSTANCE_SWAP`.
   */
  preferredValues?: InstanceSwapPreferredValue[];
};

/**
 * A property of a component.
 */
export type ComponentProperty = {
  /**
   * Type of this component property.
   */
  type: ComponentPropertyType;

  /**
   * Value of the property for this component instance.
   */
  value: boolean | string;

  /**
   * Preferred values for this property. Only applicable if type is `INSTANCE_SWAP`.
   */
  preferredValues?: InstanceSwapPreferredValue[];
};

/**
 * Fields directly overridden on an instance. Inherited overrides are not included.
 */
export type Overrides = {
  /**
   * A unique ID for a node.
   */
  id: string;

  /**
   * An array of properties.
   */
  overriddenFields: string[];
};
