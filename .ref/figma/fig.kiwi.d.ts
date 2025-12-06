export type MessageType =
  "JOIN_START" |
  "NODE_CHANGES" |
  "USER_CHANGES" |
  "JOIN_END" |
  "SIGNAL" |
  "STYLE" |
  "STYLE_SET" |
  "JOIN_START_SKIP_RELOAD" |
  "NOTIFY_SHOULD_UPGRADE" |
  "UPGRADE_DONE" |
  "UPGRADE_REFRESH" |
  "SCENE_GRAPH_QUERY" |
  "SCENE_GRAPH_REPLY" |
  "DIFF" |
  "CLIENT_BROADCAST" |
  "JOIN_START_JOURNALED" |
  "STREAM_START" |
  "STREAM_END" |
  "INTERACTIVE_SLIDE_CHANGE" |
  "RECONNECT_SCENE_GRAPH_QUERY" |
  "RECONNECT_SCENE_GRAPH_REPLY" |
  "JOIN_END_INCREMENTAL_RECONNECT" |
  "NODE_STATUS_CHANGE" |
  "CLIENT_RENDERED";

export type Axis =
  "X" |
  "Y";

export type Access =
  "READ_ONLY" |
  "READ_WRITE";

export type NodePhase =
  "CREATED" |
  "REMOVED";

export type WindingRule =
  "NONZERO" |
  "ODD";

export type NodeType =
  "NONE" |
  "DOCUMENT" |
  "CANVAS" |
  "GROUP" |
  "FRAME" |
  "BOOLEAN_OPERATION" |
  "VECTOR" |
  "STAR" |
  "LINE" |
  "ELLIPSE" |
  "RECTANGLE" |
  "REGULAR_POLYGON" |
  "ROUNDED_RECTANGLE" |
  "TEXT" |
  "SLICE" |
  "SYMBOL" |
  "INSTANCE" |
  "STICKY" |
  "SHAPE_WITH_TEXT" |
  "CONNECTOR" |
  "CODE_BLOCK" |
  "WIDGET" |
  "STAMP" |
  "MEDIA" |
  "HIGHLIGHT" |
  "SECTION" |
  "SECTION_OVERLAY" |
  "WASHI_TAPE" |
  "VARIABLE" |
  "TABLE" |
  "TABLE_CELL" |
  "VARIABLE_SET" |
  "SLIDE" |
  "ASSISTED_LAYOUT" |
  "INTERACTIVE_SLIDE_ELEMENT" |
  "VARIABLE_OVERRIDE" |
  "MODULE" |
  "SLIDE_GRID" |
  "SLIDE_ROW" |
  "RESPONSIVE_SET" |
  "CODE_COMPONENT" |
  "TEXT_PATH" |
  "CODE_INSTANCE" |
  "CODE_LIBRARY" |
  "CODE_FILE" |
  "CODE_LAYER" |
  "BRUSH" |
  "MANAGED_STRING" |
  "TRANSFORM" |
  "CMS_RICH_TEXT" |
  "REPEATER" |
  "JSX" |
  "EMBEDDED_PROTOTYPE" |
  "REACT_FIBER" |
  "RESPONSIVE_NODE_SET" |
  "WEBPAGE" |
  "KEYFRAME" |
  "KEYFRAME_TRACK" |
  "ANIMATION_PRESET_INSTANCE";

export type ShapeWithTextType =
  "SQUARE" |
  "ELLIPSE" |
  "DIAMOND" |
  "TRIANGLE_UP" |
  "TRIANGLE_DOWN" |
  "ROUNDED_RECTANGLE" |
  "PARALLELOGRAM_RIGHT" |
  "PARALLELOGRAM_LEFT" |
  "ENG_DATABASE" |
  "ENG_QUEUE" |
  "ENG_FILE" |
  "ENG_FOLDER" |
  "TRAPEZOID" |
  "PREDEFINED_PROCESS" |
  "SHIELD" |
  "DOCUMENT_SINGLE" |
  "DOCUMENT_MULTIPLE" |
  "MANUAL_INPUT" |
  "HEXAGON" |
  "CHEVRON" |
  "PENTAGON" |
  "OCTAGON" |
  "STAR" |
  "PLUS" |
  "ARROW_LEFT" |
  "ARROW_RIGHT" |
  "SUMMING_JUNCTION" |
  "OR" |
  "SPEECH_BUBBLE" |
  "INTERNAL_STORAGE";

export type BlendMode =
  "PASS_THROUGH" |
  "NORMAL" |
  "DARKEN" |
  "MULTIPLY" |
  "LINEAR_BURN" |
  "COLOR_BURN" |
  "LIGHTEN" |
  "SCREEN" |
  "LINEAR_DODGE" |
  "COLOR_DODGE" |
  "OVERLAY" |
  "SOFT_LIGHT" |
  "HARD_LIGHT" |
  "DIFFERENCE" |
  "EXCLUSION" |
  "HUE" |
  "SATURATION" |
  "COLOR" |
  "LUMINOSITY";

export type PaintType =
  "SOLID" |
  "GRADIENT_LINEAR" |
  "GRADIENT_RADIAL" |
  "GRADIENT_ANGULAR" |
  "GRADIENT_DIAMOND" |
  "IMAGE" |
  "EMOJI" |
  "VIDEO" |
  "PATTERN" |
  "NOISE";

export type ImageScaleMode =
  "STRETCH" |
  "FIT" |
  "FILL" |
  "TILE";

export type EffectType =
  "INNER_SHADOW" |
  "DROP_SHADOW" |
  "FOREGROUND_BLUR" |
  "BACKGROUND_BLUR" |
  "REPEAT" |
  "SYMMETRY" |
  "GRAIN" |
  "NOISE" |
  "GLASS";

export type TextCase =
  "ORIGINAL" |
  "UPPER" |
  "LOWER" |
  "TITLE" |
  "SMALL_CAPS" |
  "SMALL_CAPS_FORCED";

export type TextDecoration =
  "NONE" |
  "UNDERLINE" |
  "STRIKETHROUGH";

export type TextDecorationStyle =
  "SOLID" |
  "DOTTED" |
  "WAVY";

export type LeadingTrim =
  "NONE" |
  "CAP_HEIGHT";

export type NumberUnits =
  "RAW" |
  "PIXELS" |
  "PERCENT";

export type ConstraintType =
  "MIN" |
  "CENTER" |
  "MAX" |
  "STRETCH" |
  "SCALE" |
  "FIXED_MIN" |
  "FIXED_MAX";

export type StrokeAlign =
  "CENTER" |
  "INSIDE" |
  "OUTSIDE";

export type StrokeCap =
  "NONE" |
  "ROUND" |
  "SQUARE" |
  "ARROW_LINES" |
  "ARROW_EQUILATERAL" |
  "DIAMOND_FILLED" |
  "TRIANGLE_FILLED" |
  "HIGHLIGHT" |
  "WASHI_TAPE_1" |
  "WASHI_TAPE_2" |
  "WASHI_TAPE_3" |
  "WASHI_TAPE_4" |
  "WASHI_TAPE_5" |
  "WASHI_TAPE_6" |
  "CIRCLE_FILLED";

export type StrokeJoin =
  "MITER" |
  "BEVEL" |
  "ROUND";

export type BooleanOperation =
  "UNION" |
  "INTERSECT" |
  "SUBTRACT" |
  "XOR";

export type TextAlignHorizontal =
  "LEFT" |
  "CENTER" |
  "RIGHT" |
  "JUSTIFIED";

export type TextAlignVertical =
  "TOP" |
  "CENTER" |
  "BOTTOM";

export type MouseCursor =
  "DEFAULT" |
  "CROSSHAIR" |
  "EYEDROPPER" |
  "HAND" |
  "PAINT_BUCKET" |
  "PEN" |
  "PENCIL" |
  "MARKER" |
  "ERASER" |
  "HIGHLIGHTER" |
  "LASSO";

export type VectorMirror =
  "NONE" |
  "ANGLE" |
  "ANGLE_AND_LENGTH";

export type DashMode =
  "CLIP" |
  "STRETCH";

export type ImageType =
  "PNG" |
  "JPEG" |
  "SVG" |
  "PDF" |
  "MP4";

export type ExportConstraintType =
  "CONTENT_SCALE" |
  "CONTENT_WIDTH" |
  "CONTENT_HEIGHT";

export type LayoutGridType =
  "MIN" |
  "CENTER" |
  "STRETCH" |
  "MAX";

export type LayoutGridPattern =
  "STRIPES" |
  "GRID";

export type TextAutoResize =
  "NONE" |
  "WIDTH_AND_HEIGHT" |
  "HEIGHT";

export type TextTruncation =
  "DISABLED" |
  "ENDING";

export type StyleSetType =
  "PERSONAL" |
  "TEAM" |
  "CUSTOM" |
  "FREQUENCY" |
  "TEMPORARY";

export type StyleSetContentType =
  "SOLID" |
  "GRADIENT" |
  "IMAGE";

export type StackMode =
  "NONE" |
  "HORIZONTAL" |
  "VERTICAL" |
  "GRID";

export type StackAlign =
  "MIN" |
  "CENTER" |
  "MAX" |
  "BASELINE";

export type StackCounterAlign =
  "MIN" |
  "CENTER" |
  "MAX" |
  "STRETCH" |
  "AUTO" |
  "BASELINE";

export type StackJustify =
  "MIN" |
  "CENTER" |
  "MAX" |
  "SPACE_EVENLY" |
  "SPACE_BETWEEN";

export type GridChildAlign =
  "AUTO" |
  "MIN" |
  "CENTER" |
  "MAX";

export type StackSize =
  "FIXED" |
  "RESIZE_TO_FIT" |
  "RESIZE_TO_FIT_WITH_IMPLICIT_SIZE";

export type StackPositioning =
  "AUTO" |
  "ABSOLUTE";

export type StackWrap =
  "NO_WRAP" |
  "WRAP";

export type StackCounterAlignContent =
  "AUTO" |
  "SPACE_BETWEEN";

export type ConnectionType =
  "NONE" |
  "INTERNAL_NODE" |
  "URL" |
  "BACK" |
  "CLOSE" |
  "SET_VARIABLE" |
  "UPDATE_MEDIA_RUNTIME" |
  "CONDITIONAL" |
  "SET_VARIABLE_MODE" |
  "OBJECT_ANIMATION";

export type InteractionType =
  "ON_CLICK" |
  "AFTER_TIMEOUT" |
  "MOUSE_IN" |
  "MOUSE_OUT" |
  "ON_HOVER" |
  "MOUSE_DOWN" |
  "MOUSE_UP" |
  "ON_PRESS" |
  "NONE" |
  "DRAG" |
  "ON_KEY_DOWN" |
  "ON_VOICE" |
  "ON_MEDIA_HIT" |
  "ON_MEDIA_END" |
  "MOUSE_ENTER" |
  "MOUSE_LEAVE";

export type TransitionType =
  "INSTANT_TRANSITION" |
  "DISSOLVE" |
  "FADE" |
  "SLIDE_FROM_LEFT" |
  "SLIDE_FROM_RIGHT" |
  "SLIDE_FROM_TOP" |
  "SLIDE_FROM_BOTTOM" |
  "PUSH_FROM_LEFT" |
  "PUSH_FROM_RIGHT" |
  "PUSH_FROM_TOP" |
  "PUSH_FROM_BOTTOM" |
  "MOVE_FROM_LEFT" |
  "MOVE_FROM_RIGHT" |
  "MOVE_FROM_TOP" |
  "MOVE_FROM_BOTTOM" |
  "SLIDE_OUT_TO_LEFT" |
  "SLIDE_OUT_TO_RIGHT" |
  "SLIDE_OUT_TO_TOP" |
  "SLIDE_OUT_TO_BOTTOM" |
  "MOVE_OUT_TO_LEFT" |
  "MOVE_OUT_TO_RIGHT" |
  "MOVE_OUT_TO_TOP" |
  "MOVE_OUT_TO_BOTTOM" |
  "MAGIC_MOVE" |
  "SMART_ANIMATE" |
  "SCROLL_ANIMATE";

export type EasingType =
  "IN_CUBIC" |
  "OUT_CUBIC" |
  "INOUT_CUBIC" |
  "LINEAR" |
  "IN_BACK_CUBIC" |
  "OUT_BACK_CUBIC" |
  "INOUT_BACK_CUBIC" |
  "CUSTOM_CUBIC" |
  "SPRING" |
  "GENTLE_SPRING" |
  "CUSTOM_SPRING" |
  "SPRING_PRESET_ONE" |
  "SPRING_PRESET_TWO" |
  "SPRING_PRESET_THREE";

export type ScrollDirection =
  "NONE" |
  "HORIZONTAL" |
  "VERTICAL" |
  "BOTH";

export type ScrollContractedState =
  "EXPANDED" |
  "CONTRACTED";

export type FontVariantNumericFigure =
  "NORMAL" |
  "LINING" |
  "OLDSTYLE";

export type FontVariantNumericSpacing =
  "NORMAL" |
  "PROPORTIONAL" |
  "TABULAR";

export type FontVariantNumericFraction =
  "NORMAL" |
  "DIAGONAL" |
  "STACKED";

export type FontVariantCaps =
  "NORMAL" |
  "SMALL" |
  "ALL_SMALL" |
  "PETITE" |
  "ALL_PETITE" |
  "UNICASE" |
  "TITLING";

export type FontVariantPosition =
  "NORMAL" |
  "SUB" |
  "SUPER";

export type FontStyle =
  "NORMAL" |
  "ITALIC";

export type SemanticWeight =
  "NORMAL" |
  "BOLD";

export type SemanticItalic =
  "NORMAL" |
  "ITALIC";

export type CodeSnapshotState =
  "INITIAL" |
  "SNAPSHOTTING" |
  "OK" |
  "SNAPSHOT_ERROR" |
  "LLM_IN_PROGRESS";

export type CodeObjectType =
  "WEB_LAYER" |
  "WEB_INTERACTION" |
  "NATIVE_LAYER" |
  "ANIMATION_PRESET";

export type LockMode =
  "NONE" |
  "ALL" |
  "BACKGROUND_ONLY";

export type OpenTypeFeature =
  "PCAP" |
  "C2PC" |
  "CASE" |
  "CPSP" |
  "TITL" |
  "UNIC" |
  "ZERO" |
  "SINF" |
  "ORDN" |
  "AFRC" |
  "DNOM" |
  "NUMR" |
  "LIGA" |
  "CLIG" |
  "DLIG" |
  "HLIG" |
  "RLIG" |
  "AALT" |
  "CALT" |
  "RCLT" |
  "SALT" |
  "RVRN" |
  "VERT" |
  "SWSH" |
  "CSWH" |
  "NALT" |
  "CCMP" |
  "STCH" |
  "HIST" |
  "SIZE" |
  "ORNM" |
  "ITAL" |
  "RAND" |
  "DTLS" |
  "FLAC" |
  "MGRK" |
  "SSTY" |
  "KERN" |
  "FWID" |
  "HWID" |
  "HALT" |
  "TWID" |
  "QWID" |
  "PWID" |
  "JUST" |
  "LFBD" |
  "OPBD" |
  "RTBD" |
  "PALT" |
  "PKNA" |
  "LTRA" |
  "LTRM" |
  "RTLA" |
  "RTLM" |
  "ABRV" |
  "ABVM" |
  "ABVS" |
  "VALT" |
  "VHAL" |
  "BLWF" |
  "BLWM" |
  "BLWS" |
  "AKHN" |
  "CJCT" |
  "CFAR" |
  "CPCT" |
  "CURS" |
  "DIST" |
  "EXPT" |
  "FALT" |
  "FINA" |
  "FIN2" |
  "FIN3" |
  "HALF" |
  "HALN" |
  "HKNA" |
  "HNGL" |
  "HOJO" |
  "INIT" |
  "ISOL" |
  "JP78" |
  "JP83" |
  "JP90" |
  "JP04" |
  "LJMO" |
  "LOCL" |
  "MARK" |
  "MEDI" |
  "MED2" |
  "MKMK" |
  "NLCK" |
  "NUKT" |
  "PREF" |
  "PRES" |
  "VPAL" |
  "PSTF" |
  "PSTS" |
  "RKRF" |
  "RPHF" |
  "RUBY" |
  "SMPL" |
  "TJMO" |
  "TNAM" |
  "TRAD" |
  "VATU" |
  "VJMO" |
  "VKNA" |
  "VKRN" |
  "VRTR" |
  "VRT2" |
  "SS01" |
  "SS02" |
  "SS03" |
  "SS04" |
  "SS05" |
  "SS06" |
  "SS07" |
  "SS08" |
  "SS09" |
  "SS10" |
  "SS11" |
  "SS12" |
  "SS13" |
  "SS14" |
  "SS15" |
  "SS16" |
  "SS17" |
  "SS18" |
  "SS19" |
  "SS20" |
  "CV01" |
  "CV02" |
  "CV03" |
  "CV04" |
  "CV05" |
  "CV06" |
  "CV07" |
  "CV08" |
  "CV09" |
  "CV10" |
  "CV11" |
  "CV12" |
  "CV13" |
  "CV14" |
  "CV15" |
  "CV16" |
  "CV17" |
  "CV18" |
  "CV19" |
  "CV20" |
  "CV21" |
  "CV22" |
  "CV23" |
  "CV24" |
  "CV25" |
  "CV26" |
  "CV27" |
  "CV28" |
  "CV29" |
  "CV30" |
  "CV31" |
  "CV32" |
  "CV33" |
  "CV34" |
  "CV35" |
  "CV36" |
  "CV37" |
  "CV38" |
  "CV39" |
  "CV40" |
  "CV41" |
  "CV42" |
  "CV43" |
  "CV44" |
  "CV45" |
  "CV46" |
  "CV47" |
  "CV48" |
  "CV49" |
  "CV50" |
  "CV51" |
  "CV52" |
  "CV53" |
  "CV54" |
  "CV55" |
  "CV56" |
  "CV57" |
  "CV58" |
  "CV59" |
  "CV60" |
  "CV61" |
  "CV62" |
  "CV63" |
  "CV64" |
  "CV65" |
  "CV66" |
  "CV67" |
  "CV68" |
  "CV69" |
  "CV70" |
  "CV71" |
  "CV72" |
  "CV73" |
  "CV74" |
  "CV75" |
  "CV76" |
  "CV77" |
  "CV78" |
  "CV79" |
  "CV80" |
  "CV81" |
  "CV82" |
  "CV83" |
  "CV84" |
  "CV85" |
  "CV86" |
  "CV87" |
  "CV88" |
  "CV89" |
  "CV90" |
  "CV91" |
  "CV92" |
  "CV93" |
  "CV94" |
  "CV95" |
  "CV96" |
  "CV97" |
  "CV98" |
  "CV99";

export type NoiseType =
  "MULTITONE" |
  "MONOTONE" |
  "DUOTONE";

export type PatternTileType =
  "RECTANGULAR" |
  "HORIZONTAL_HEXAGONAL" |
  "VERTICAL_HEXAGONAL";

export type PatternAlignment =
  "START" |
  "CENTER" |
  "END";

export type CollaborativeTextOpType =
  "INSERT" |
  "DELETE";

export type FlappType =
  "POLL" |
  "EMBED" |
  "FACEPILE" |
  "ALIGNMENT" |
  "YOUTUBE";

export type BlurOpType =
  "NORMAL" |
  "PROGRESSIVE";

export type RepeatType =
  "LINEAR" |
  "RADIAL";

export type UnitType =
  "PIXELS" |
  "RELATIVE";

export type RepeatOrder =
  "FORWARD" |
  "REVERSE";

export type EffectAxis =
  "X" |
  "Y" |
  "X_AND_Y";

export type TransformModifierType =
  "REPEAT" |
  "SYMMETRY" |
  "SKEW";

export type PrototypeDeviceType =
  "NONE" |
  "PRESET" |
  "CUSTOM" |
  "PRESENTATION";

export type DeviceRotation =
  "NONE" |
  "CCW_90";

export type OverlayPositionType =
  "CENTER" |
  "TOP_LEFT" |
  "TOP_CENTER" |
  "TOP_RIGHT" |
  "BOTTOM_LEFT" |
  "BOTTOM_CENTER" |
  "BOTTOM_RIGHT" |
  "MANUAL";

export type OverlayBackgroundInteraction =
  "NONE" |
  "CLOSE_ON_CLICK_OUTSIDE";

export type OverlayBackgroundType =
  "NONE" |
  "SOLID_COLOR";

export type NavigationType =
  "NAVIGATE" |
  "OVERLAY" |
  "SWAP" |
  "SWAP_STATE" |
  "SCROLL_TO";

export type ExportColorProfile =
  "DOCUMENT" |
  "SRGB" |
  "DISPLAY_P3_V4" |
  "CMYK";

export type ExportSVGIDMode =
  "IF_NEEDED" |
  "ALWAYS";

export type StyleType =
  "NONE" |
  "FILL" |
  "STROKE" |
  "TEXT" |
  "EFFECT" |
  "EXPORT" |
  "GRID";

export type BrushOrientation =
  "FORWARD" |
  "REVERSE";

export type BrushType =
  "STRETCH" |
  "SCATTER";

export type ScrollBehavior =
  "SCROLLS" |
  "FIXED_WHEN_CHILD_OF_SCROLLING_FRAME" |
  "STICKY_SCROLLS";

export type ConnectorMagnet =
  "NONE" |
  "AUTO" |
  "TOP" |
  "LEFT" |
  "BOTTOM" |
  "RIGHT" |
  "CENTER" |
  "AUTO_HORIZONTAL" |
  "EDGE" |
  "ABSOLUTE";

export type ConnectorTextSection =
  "MIDDLE_TO_START" |
  "MIDDLE_TO_END";

export type ConnectorOffAxisOffset =
  "NONE" |
  "ABOVE" |
  "BELOW";

export type ConnectorLineStyle =
  "ELBOWED" |
  "STRAIGHT" |
  "CURVED";

export type ConnectorType =
  "MANUAL" |
  "DIAGRAM";

export type AnnotationPropertyType =
  "FILL" |
  "STROKE" |
  "WIDTH" |
  "HEIGHT" |
  "MIN_WIDTH" |
  "MIN_HEIGHT" |
  "MAX_WIDTH" |
  "MAX_HEIGHT" |
  "STROKE_WIDTH" |
  "CORNER_RADIUS" |
  "EFFECT" |
  "TEXT_STYLE" |
  "TEXT_ALIGN_HORIZONTAL" |
  "FONT_FAMILY" |
  "FONT_SIZE" |
  "FONT_WEIGHT" |
  "LINE_HEIGHT" |
  "LETTER_SPACING" |
  "STACK_SPACING" |
  "STACK_PADDING" |
  "STACK_MODE" |
  "STACK_ALIGNMENT" |
  "OPACITY" |
  "COMPONENT" |
  "FONT_STYLE" |
  "GRID_ROW_GAP" |
  "GRID_COLUMN_GAP" |
  "GRID_ROW_COUNT" |
  "GRID_COLUMN_COUNT" |
  "GRID_ROW_ANCHOR_INDEX" |
  "GRID_COLUMN_ANCHOR_INDEX" |
  "GRID_ROW_SPAN" |
  "GRID_COLUMN_SPAN";

export type AnnotationCategoryPreset =
  "NONE" |
  "ACCESSIBILITY" |
  "BEHAVIOR" |
  "CONTENT" |
  "DEVELOPMENT" |
  "INTERACTION";

export type AnnotationCategoryColor =
  "YELLOW" |
  "ORANGE" |
  "RED" |
  "PINK" |
  "VIOLET" |
  "BLUE" |
  "TEAL" |
  "GREEN";

export type AnnotationMeasurementNodeSide =
  "TOP" |
  "BOTTOM" |
  "LEFT" |
  "RIGHT";

export type EditorType =
  "DESIGN" |
  "WHITEBOARD" |
  "SLIDES" |
  "DEV_HANDOFF" |
  "SITES" |
  "COOPER" |
  "ILLUSTRATION" |
  "FIGMAKE";

export type MaskType =
  "ALPHA" |
  "OUTLINE" |
  "LUMINANCE";

export type ModuleType =
  "NONE" |
  "SINGLE_NODE" |
  "MULTI_NODE";

export type SectionStatus =
  "NONE" |
  "BUILD" |
  "COMPLETED";

export type BuzzApprovalNodeStatus =
  "NONE" |
  "IN_REVIEW" |
  "APPROVED" |
  "CHANGES_REQUESTED";

export type CookieBannerComponentType =
  "BANNER" |
  "MODAL";

export type TriggerComponentType =
  "BANNER" |
  "TAG";

export type CookieXAlignment =
  "LEFT" |
  "CENTER" |
  "RIGHT";

export type CookieYAlignment =
  "TOP" |
  "CENTER" |
  "BOTTOM";

export type ResponsiveScalingMode =
  "REFLOW" |
  "SCALE";

export type CMSFilterCriteriaMatchType =
  "MATCH_ALL" |
  "MATCH_ANY";

export type CMSSelectorFilterOperator =
  "EQUALS";

export type CMSFieldOrderBy =
  "ASCENDING" |
  "DESCENDING";

export type CMSConsumptionField =
  "MISSING" |
  "TEXT_DATA";

export type CMSRichTextStyleClass =
  "HEADING1" |
  "HEADING2" |
  "HEADING3" |
  "HEADING4" |
  "HEADING5" |
  "HEADING6" |
  "PARAGRAPH" |
  "LINK" |
  "BLOCKQUOTE";

export type ManagedStringContentSchema =
  "V0";

export type ManagedStringNodeType =
  "TEXT" |
  "CONCATENATE" |
  "PLURAL" |
  "PLACEHOLDER";

export type ManagedStringPluralType =
  "ZERO" |
  "ONE" |
  "TWO" |
  "FEW" |
  "MANY" |
  "OTHER";

export type ManagedStringFormatType =
  "TEXT" |
  "DATE" |
  "TIME" |
  "NUMBER";

export type MediaAction =
  "PLAY" |
  "PAUSE" |
  "TOGGLE_PLAY_PAUSE" |
  "MUTE" |
  "UNMUTE" |
  "TOGGLE_MUTE_UNMUTE" |
  "SKIP_FORWARD" |
  "SKIP_BACKWARD" |
  "SKIP_TO" |
  "SET_PLAYBACK_RATE";

export type VariableField =
  "MISSING" |
  "CORNER_RADIUS" |
  "PARAGRAPH_SPACING" |
  "PARAGRAPH_INDENT" |
  "STROKE_WEIGHT" |
  "STACK_SPACING" |
  "STACK_PADDING_LEFT" |
  "STACK_PADDING_TOP" |
  "STACK_PADDING_RIGHT" |
  "STACK_PADDING_BOTTOM" |
  "VISIBLE" |
  "TEXT_DATA" |
  "WIDTH" |
  "HEIGHT" |
  "RECTANGLE_TOP_LEFT_CORNER_RADIUS" |
  "RECTANGLE_TOP_RIGHT_CORNER_RADIUS" |
  "RECTANGLE_BOTTOM_LEFT_CORNER_RADIUS" |
  "RECTANGLE_BOTTOM_RIGHT_CORNER_RADIUS" |
  "BORDER_TOP_WEIGHT" |
  "BORDER_BOTTOM_WEIGHT" |
  "BORDER_LEFT_WEIGHT" |
  "BORDER_RIGHT_WEIGHT" |
  "VARIANT_PROPERTIES" |
  "STACK_COUNTER_SPACING" |
  "MIN_WIDTH" |
  "MAX_WIDTH" |
  "MIN_HEIGHT" |
  "MAX_HEIGHT" |
  "FONT_FAMILY" |
  "FONT_STYLE" |
  "FONT_VARIATIONS" |
  "OPACITY" |
  "FONT_SIZE" |
  "LETTER_SPACING" |
  "LINE_HEIGHT" |
  "OVERRIDDEN_SYMBOL_ID" |
  "HYPERLINK" |
  "CMS_SERIALIZED_RICH_TEXT_DATA" |
  "SLOT_CONTENT_ID" |
  "GRID_ROW_GAP" |
  "GRID_COLUMN_GAP" |
  "X_POSITION" |
  "Y_POSITION" |
  "ROTATION";

export type GridTrackSizingType =
  "FLEX" |
  "FIXED" |
  "HUG";

export type AgendaItemType =
  "NODE" |
  "BLOCK";

export type DiagramLayoutRuleType =
  "NONE" |
  "TREE";

export type DiagramLayoutPaused =
  "NO" |
  "YES";

export type ComponentPropNodeField =
  "VISIBLE" |
  "TEXT_DATA" |
  "OVERRIDDEN_SYMBOL_ID" |
  "INHERIT_FILL_STYLE_ID" |
  "SLOT_CONTENT_ID";

export type ComponentPropType =
  "BOOL" |
  "TEXT" |
  "COLOR" |
  "INSTANCE_SWAP" |
  "VARIANT" |
  "NUMBER" |
  "IMAGE" |
  "SLOT";

export type ParameterConfigControl =
  "DEFAULT" |
  "SLIDER" |
  "INPUT" |
  "SELECT";

export type InstanceSwapPreferredValueType =
  "COMPONENT" |
  "STATE_GROUP";

export type WidgetEvent =
  "MOUSE_DOWN" |
  "CLICK" |
  "TEXT_EDIT_END" |
  "ATTACHED_STICKABLES_CHANGED" |
  "STUCK_STATUS_CHANGED";

export type WidgetInputBehavior =
  "WRAP" |
  "TRUNCATE" |
  "MULTILINE";

export type WidgetPropertyMenuItemType =
  "ACTION" |
  "SEPARATOR" |
  "COLOR" |
  "DROPDOWN" |
  "COLOR_SELECTOR" |
  "TOGGLE" |
  "LINK";

export type WidgetInputTextNodeType =
  "WIDGET_CONTROLLED" |
  "RICH_TEXT";

export type CodeBlockLanguage =
  "TYPESCRIPT" |
  "CPP" |
  "RUBY" |
  "CSS" |
  "JAVASCRIPT" |
  "HTML" |
  "JSON" |
  "GRAPHQL" |
  "PYTHON" |
  "GO" |
  "SQL" |
  "SWIFT" |
  "KOTLIN" |
  "RUST" |
  "BASH" |
  "PLAINTEXT";

export type CodeBlockTheme =
  "FIGJAM_DARK" |
  "DRACULA" |
  "DUOTONE_SEA" |
  "DUOTONE_SPACE" |
  "DUOTONE_EARTH" |
  "DUOTONE_FOREST" |
  "DUOTONE_LIGHT";

export type InternalEnumForTest =
  "OLD";

export type BulletType =
  "ORDERED" |
  "UNORDERED" |
  "INDENT" |
  "NO_LIST";

export type LineType =
  "PLAIN" |
  "ORDERED_LIST" |
  "UNORDERED_LIST" |
  "BLOCKQUOTE" |
  "HEADER";

export type SourceDirectionality =
  "AUTO" |
  "LTR" |
  "RTL";

export type Directionality =
  "LTR" |
  "RTL";

export type DirectionalityIntent =
  "IMPLICIT" |
  "EXPLICIT";

export type AnimationPhase =
  "IN" |
  "OUT";

export type AnimationType =
  "NONE" |
  "FADE" |
  "SLIDE_FROM_LEFT" |
  "SLIDE_FROM_RIGHT" |
  "SLIDE_FROM_TOP" |
  "SLIDE_FROM_BOTTOM";

export type TriggerDevice =
  "KEYBOARD" |
  "UNKNOWN_CONTROLLER" |
  "XBOX_ONE" |
  "PS4" |
  "SWITCH_PRO";

export type MentionSource =
  "DEFAULT" |
  "COPY_DUPLICATE";

export type TransitionDirection =
  "FORWARD" |
  "REVERSE";

export type PlaybackChangePhase =
  "INITIATED" |
  "ABORTED" |
  "COMMITTED";

export type Heartbeat =
  "FOREGROUND" |
  "BACKGROUND";

export type SitesViewState =
  "FILE" |
  "CODE" |
  "DAKOTA" |
  "SETTINGS" |
  "INSERT";

export type DesignFullPageViewState =
  "NONE" |
  "DESIGN_SYSTEM" |
  "VARIABLES";

export type SceneGraphQueryBehavior =
  "DEFAULT" |
  "CONTAINING_PAGE" |
  "PLUGIN";

export type PasteAssetType =
  "UNKNOWN" |
  "VARIABLE";

export type DiffType =
  "BRANCHING" |
  "NODE_CHANGES_ONLY";

export type RichMediaType =
  "ANIMATED_IMAGE" |
  "VIDEO";

export type VariableDataType =
  "BOOLEAN" |
  "FLOAT" |
  "STRING" |
  "ALIAS" |
  "COLOR" |
  "EXPRESSION" |
  "MAP" |
  "SYMBOL_ID" |
  "FONT_STYLE" |
  "TEXT_DATA" |
  "INVALID" |
  "NODE_FIELD_ALIAS" |
  "CMS_ALIAS" |
  "PROP_REF" |
  "IMAGE" |
  "MANAGED_STRING_ALIAS" |
  "LINK" |
  "JS_RUNTIME_ALIAS" |
  "SLOT_CONTENT_ID" |
  "DATE" |
  "KEYFRAME_TRACK_ID" |
  "KEYFRAME_TRACK_PARAMETER_DATA";

export type VariableResolvedDataType =
  "BOOLEAN" |
  "FLOAT" |
  "STRING" |
  "COLOR" |
  "MAP" |
  "SYMBOL_ID" |
  "FONT_STYLE" |
  "TEXT_DATA" |
  "IMAGE" |
  "LINK" |
  "JS_RUNTIME_ALIAS" |
  "SLOT_CONTENT_ID" |
  "KEYFRAME_TRACK_ID" |
  "KEYFRAME_TRACK_PARAMETER_DATA";

export type ExpressionFunction =
  "ADDITION" |
  "SUBTRACTION" |
  "RESOLVE_VARIANT" |
  "MULTIPLY" |
  "DIVIDE" |
  "EQUALS" |
  "NOT_EQUAL" |
  "LESS_THAN" |
  "LESS_THAN_OR_EQUAL" |
  "GREATER_THAN" |
  "GREATER_THAN_OR_EQUAL" |
  "AND" |
  "OR" |
  "NOT" |
  "STRINGIFY" |
  "TERNARY" |
  "VAR_MODE_LOOKUP" |
  "NEGATE" |
  "IS_TRUTHY" |
  "KEYFRAME";

export type NodeFieldAliasType =
  "MISSING" |
  "COMPONENT_PROP_ASSIGNMENTS";

export type VariableScope =
  "ALL_SCOPES" |
  "TEXT_CONTENT" |
  "CORNER_RADIUS" |
  "WIDTH_HEIGHT" |
  "GAP" |
  "ALL_FILLS" |
  "FRAME_FILL" |
  "SHAPE_FILL" |
  "TEXT_FILL" |
  "STROKE" |
  "STROKE_FLOAT" |
  "EFFECT_FLOAT" |
  "EFFECT_COLOR" |
  "OPACITY" |
  "FONT_STYLE" |
  "FONT_FAMILY" |
  "FONT_SIZE" |
  "LINE_HEIGHT" |
  "LETTER_SPACING" |
  "PARAGRAPH_SPACING" |
  "PARAGRAPH_INDENT" |
  "FONT_VARIATIONS" |
  "TRANSFORM";

export type KeyframeValueType =
  "FLOAT" |
  "INVALID";

export type KeyframeTrackParameterType =
  "INVALID" |
  "MANUAL" |
  "ANIMATION_PRESET";

export type CodeSyntaxPlatform =
  "WEB" |
  "ANDROID" |
  "iOS";

export type HTMLTag =
  "AUTO" |
  "ARTICLE" |
  "SECTION" |
  "NAV" |
  "ASIDE" |
  "H1" |
  "H2" |
  "H3" |
  "H4" |
  "H5" |
  "H6" |
  "HGROUP" |
  "HEADER" |
  "FOOTER" |
  "ADDRESS" |
  "P" |
  "HR" |
  "PRE" |
  "BLOCKQUOTE" |
  "OL" |
  "UL" |
  "MENU" |
  "LI" |
  "DL" |
  "DT" |
  "DD" |
  "FIGURE" |
  "FIGCAPTION" |
  "MAIN" |
  "DIV" |
  "A" |
  "EM" |
  "STRONG" |
  "SMALL" |
  "S" |
  "CITE" |
  "Q" |
  "DFN" |
  "ABBR" |
  "RUBY" |
  "RT" |
  "RP" |
  "DATA" |
  "TIME" |
  "CODE" |
  "VAR" |
  "SAMP" |
  "KBD" |
  "SUB" |
  "SUP" |
  "I" |
  "B" |
  "U" |
  "MARK" |
  "BDI" |
  "BDO" |
  "SPAN" |
  "BR" |
  "WBR" |
  "PICTURE" |
  "SOURCE" |
  "IMG" |
  "FORM" |
  "LABEL" |
  "INPUT" |
  "BUTTON" |
  "SELECT" |
  "DATALIST" |
  "OPTGROUP" |
  "OPTION" |
  "TEXTAREA" |
  "OUTPUT" |
  "PROGRESS" |
  "METER" |
  "FIELDSET" |
  "LEGEND" |
  "VIDEO";

export type ARIARole =
  "AUTO" |
  "NONE" |
  "APPLICATION" |
  "BANNER" |
  "COMPLEMENTARY" |
  "CONTENTINFO" |
  "FORM" |
  "MAIN" |
  "NAVIGATION" |
  "REGION" |
  "SEARCH" |
  "SEPARATOR" |
  "ARTICLE" |
  "COLUMNHEADER" |
  "DEFINITION" |
  "DIRECTORY" |
  "DOCUMENT" |
  "GROUP" |
  "HEADING" |
  "IMG" |
  "LIST" |
  "LISTITEM" |
  "MATH" |
  "NOTE" |
  "PRESENTATION" |
  "ROW" |
  "ROWGROUP" |
  "ROWHEADER" |
  "TABLE" |
  "TOOLBAR" |
  "BUTTON" |
  "CHECKBOX" |
  "GRIDCELL" |
  "LINK" |
  "MENUITEM" |
  "MENUITEMCHECKBOX" |
  "MENUITEMRADIO" |
  "OPTION" |
  "PROGRESSBAR" |
  "RADIO" |
  "SCROLLBAR" |
  "SLIDER" |
  "SPINBUTTON" |
  "TAB" |
  "TABPANEL" |
  "TEXTBOX" |
  "TREEITEM" |
  "COMBOBOX" |
  "GRID" |
  "LISTBOX" |
  "MENU" |
  "MENUBAR" |
  "RADIOGROUP" |
  "TABLIST" |
  "TREE" |
  "TREEGRID" |
  "TOOLTIP" |
  "ALERT" |
  "LOG" |
  "MARQUEE" |
  "STATUS" |
  "TIMER" |
  "ALERTDIALOG" |
  "DIALOG" |
  "SEARCHBOX" |
  "SWITCH" |
  "BLOCKQUOTE" |
  "CAPTION" |
  "CELL" |
  "DELETION" |
  "EMPHASIS" |
  "FEED" |
  "FIGURE" |
  "GENERIC" |
  "INSERTION" |
  "METER" |
  "PARAGRAPH" |
  "STRONG" |
  "SUBSCRIPT" |
  "SUPERSCRIPT" |
  "TERM" |
  "TIME" |
  "IMAGE" |
  "HEADING_1" |
  "HEADING_2" |
  "HEADING_3" |
  "HEADING_4" |
  "HEADING_5" |
  "HEADING_6" |
  "HEADER" |
  "FOOTER" |
  "SIDEBAR" |
  "SECTION" |
  "MAINCONTENT" |
  "TABLE_CELL" |
  "WIDGET";

export type ColorProfile =
  "SRGB" |
  "DISPLAY_P3";

export type DocumentColorProfile =
  "LEGACY" |
  "SRGB" |
  "DISPLAY_P3";

export type ChildReadingDirection =
  "NONE" |
  "LEFT_TO_RIGHT" |
  "RIGHT_TO_LEFT";

export type ARIAAttributeDataType =
  "BOOLEAN" |
  "STRING" |
  "FLOAT" |
  "INT" |
  "STRING_LIST";

export type EditScopeType =
  "INVALID" |
  "TEST_SETUP" |
  "USER" |
  "PLUGIN" |
  "SYSTEM" |
  "REST_API" |
  "ONBOARDING" |
  "AUTOSAVE" |
  "AI";

export type SectionPresetState =
  "INSERTED" |
  "USER_EDITED";

export type EmojiImageSet =
  "APPLE" |
  "NOTO";

export type SelectionRegionFocusType =
  "NONE" |
  "PRIMARY" |
  "SECONDARY";

export type FirstDraftKitType =
  "LOCAL" |
  "LIBRARY" |
  "NONE";

export type FirstDraftKitElementType =
  "NONE" |
  "BUILDING_BLOCK" |
  "GROUPED_COMPONENT";

export type PlatformShapeProperty =
  "FILL" |
  "STROKE" |
  "TEXT" |
  "STROKE_COLOR";

export type PlatformShapeBehaviorType =
  "SHAPE" |
  "CONTAINER" |
  "ADVANCED_CONTAINER";

export type AppearBehaviorTrigger =
  "PAGE_LOAD" |
  "THIS_LAYER_IN_VIEW" |
  "OTHER_LAYER_IN_VIEW" |
  "SCROLL_DIRECTION";

export type RelativeDirection =
  "UP" |
  "DOWN" |
  "LEFT" |
  "RIGHT";

export type ScrollTransformBehaviorTrigger =
  "PAGE_HEIGHT" |
  "THIS_LAYER_IN_VIEW" |
  "OTHER_LAYER_IN_VIEW";

export type LinkBehaviorType =
  "URL" |
  "PAGE";

export type SlideNumber =
  "NONE" |
  "SLIDE" |
  "SECTION" |
  "SUBSECTION" |
  "TOTAL_WITHIN_DECK" |
  "TOTAL_WITHIN_SECTION";

export type NodeChatMessageType =
  "USER_MESSAGE" |
  "ASSISTANT_MESSAGE" |
  "TOOL_MESSAGE" |
  "SYSTEM_MESSAGE";

export type AIChatContentPartType =
  "INVALID" |
  "TEXT" |
  "SELECTED_NODE_IDS";

export type AIChatMessageRole =
  "USER" |
  "ASSISTANT" |
  "TOOL" |
  "SYSTEM";

export type CooperTemplateType =
  "CUSTOM" |
  "TWITTER_POST" |
  "LINKEDIN_POST" |
  "INSTA_POST_SQUARE" |
  "INSTA_POST_PORTRAIT" |
  "INSTA_STORY" |
  "INSTA_AD" |
  "FACEBOOK_POST" |
  "FACEBOOK_COVER_PHOTO" |
  "FACEBOOK_EVENT_COVER" |
  "FACEBOOK_AD_PORTRAIT" |
  "FACEBOOK_AD_SQUARE" |
  "PINTEREST_AD_PIN" |
  "TWITTER_BANNER" |
  "LINKEDIN_POST_SQUARE" |
  "LINKEDIN_POST_PORTRAIT" |
  "LINKEDIN_POST_LANDSCAPE" |
  "LINKEDIN_PROFILE_BANNER" |
  "LINKEDIN_ARTICLE_BANNER" |
  "LINKEDIN_AD_LANDSCAPE" |
  "LINKEDIN_AD_SQUARE" |
  "LINKEDIN_AD_VERTICAL" |
  "YOUTUBE_THUMBNAIL" |
  "YOUTUBE_BANNER" |
  "YOUTUBE_AD" |
  "TWITCH_BANNER" |
  "GOOGLE_LEADERBOARD_AD" |
  "GOOGLE_LARGE_AD" |
  "GOOGLE_MED_AD" |
  "GOOGLE_MOBILE_BANNER_AD" |
  "GOOGLE_SKYSCRAPER_AD" |
  "CARD_HORIZONTAL" |
  "CARD_VERTICAL" |
  "PRINT_US_LETTER" |
  "POSTER" |
  "BANNER_STANDARD" |
  "BANNER_WIDE" |
  "BANNER_ULTRAWIDE" |
  "NAME_TAG_PORTRAIT" |
  "NAME_TAG_LANDSCAPE" |
  "INSTA_REEL_COVER" |
  "ZOOM_BACKGROUND" |
  "TIKTOK_POST";

export type InterpolationType =
  "HOLD" |
  "BEZIER";

export type KeyframeOperation =
  "SET" |
  "SCALE" |
  "OFFSET";

export type TimelinePositionType =
  "ABSOLUTE" |
  "RELATIVE";

export type PlaybackStyle =
  "ONCE" |
  "LOOP" |
  "BOOMERANG";

export interface GUID {
  sessionID: number;
  localID: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Vector {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ColorStop {
  color: Color;
  position: number;
}

export interface ColorStopVar {
  color?: Color;
  colorVar?: VariableData;
  position?: number;
}

export interface Matrix {
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
}

export interface ParentIndex {
  guid: GUID;
  position: string;
}

export interface Number {
  value: number;
  units: NumberUnits;
}

export interface FontName {
  family: string;
  style: string;
  postscript: string;
}

export interface ExportConstraint {
  type: ExportConstraintType;
  value: number;
}

export interface GUIDMapping {
  from: GUID;
  to: GUID;
}

export interface Blob {
  bytes: Uint8Array;
}

export interface Image {
  hash?: Uint8Array;
  name?: string;
  dataBlob?: number;
}

export interface Video {
  hash?: Uint8Array;
  s3Url?: string;
}

export interface PasteSource {
  srcFile?: string;
  srcNode?: GUID;
}

export interface FilterColorAdjust {
  tint: number;
  shadows: number;
  highlights: number;
  detail: number;
  exposure: number;
  vignette: number;
  temperature: number;
  vibrance: number;
}

export interface PaintFilterMessage {
  tint?: number;
  shadows?: number;
  highlights?: number;
  detail?: number;
  exposure?: number;
  vignette?: number;
  temperature?: number;
  vibrance?: number;
  contrast?: number;
  brightness?: number;
}

export interface Paint {
  type?: PaintType;
  color?: Color;
  opacity?: number;
  visible?: boolean;
  blendMode?: BlendMode;
  stops?: ColorStop[];
  transform?: Matrix;
  image?: Image;
  imageThumbnail?: Image;
  animatedImage?: Image;
  animationFrame?: number;
  imageScaleMode?: ImageScaleMode;
  imageShouldColorManage?: boolean;
  rotation?: number;
  scale?: number;
  filterColorAdjust?: FilterColorAdjust;
  paintFilter?: PaintFilterMessage;
  emojiCodePoints?: number[];
  video?: Video;
  originalImageWidth?: number;
  originalImageHeight?: number;
  colorVar?: VariableData;
  imageVar?: VariableData;
  stopsVar?: ColorStopVar[];
  thumbHashBase64?: string;
  thumbHash?: Uint8Array;
  sourceNodeId?: GUID;
  spacing?: number;
  patternSpacing?: Vector;
  patternTileType?: PatternTileType;
  verticalAlignment?: PatternAlignment;
  horizontalAlignment?: PatternAlignment;
  id?: GUID;
  altText?: string;
  noiseType?: NoiseType;
  density?: number;
  noiseSize?: Vector;
}

export interface FontMetaData {
  key?: FontName;
  fontLineHeight?: number;
  fontDigest?: Uint8Array;
  fontStyle?: FontStyle;
  fontWeight?: number;
}

export interface FontVariation {
  axisTag?: number;
  axisName?: string;
  value?: number;
}

export interface TextData {
  characters?: string;
  characterStyleIDs?: number[];
  styleOverrideTable?: NodeChange[];
  lines?: TextLineData[];
  layoutVersion?: number;
  fallbackFonts?: FontName[];
  minContentHeight?: number;
  layoutSize?: Vector;
  baselines?: Baseline[];
  glyphs?: Glyph[];
  decorations?: Decoration[];
  blockquotes?: Blockquote[];
  fontMetaData?: FontMetaData[];
  hyperlinkBoxes?: HyperlinkBox[];
  truncationStartIndex?: number;
  truncatedHeight?: number;
  logicalIndexToCharacterOffsetMap?: number[];
  mentionBoxes?: MentionBox[];
  derivedLines?: DerivedTextLineData[];
}

export interface DerivedTextData {
  layoutSize?: Vector;
  baselines?: Baseline[];
  glyphs?: Glyph[];
  decorations?: Decoration[];
  blockquotes?: Blockquote[];
  fontMetaData?: FontMetaData[];
  hyperlinkBoxes?: HyperlinkBox[];
  truncationStartIndex?: number;
  truncatedHeight?: number;
  logicalIndexToCharacterOffsetMap?: number[];
  mentionBoxes?: MentionBox[];
  derivedLines?: DerivedTextLineData[];
}

export interface HyperlinkBox {
  bounds?: Rect;
  url?: string;
  guid?: GUID;
  cmsTarget?: CMSItemPageTarget;
  openInNewTab?: boolean;
  hyperlinkID?: number;
}

export interface MentionBox {
  bounds?: Rect;
  startIndex?: number;
  endIndex?: number;
  isValid?: boolean;
  mentionKey?: number;
}

export interface Baseline {
  position?: Vector;
  width?: number;
  lineY?: number;
  lineHeight?: number;
  lineAscent?: number;
  ignoreLeadingTrim?: number;
  firstCharacter?: number;
  endCharacter?: number;
}

export interface Glyph {
  commandsBlob?: number;
  position?: Vector;
  styleID?: number;
  fontSize?: number;
  firstCharacter?: number;
  advance?: number;
  emojiCodePoints?: number[];
  emojiImageSet?: EmojiImageSet;
  rotation?: number;
}

export interface Decoration {
  rects?: Rect[];
  styleID?: number;
}

export interface Blockquote {
  verticalBar?: Rect;
  quoteMarkBounds?: Rect;
  styleID?: number;
}

export interface VectorData {
  vectorNetworkBlob?: number;
  normalizedSize?: Vector;
  styleOverrideTable?: NodeChange[];
}

export interface TextPathStart {
  tValue?: number;
  forward?: boolean;
}

export interface GUIDPath {
  guids?: GUID[];
}

export interface SymbolData {
  symbolID?: GUID;
  symbolOverrides?: NodeChange[];
  uniformScaleFactor?: number;
}

export interface GUIDPathMapping {
  id?: GUID;
  path?: GUIDPath;
}

export interface DerivedBreakpointData {
  overrides?: NodeChange[];
}

export interface NodeGenerationData {
  overrides?: NodeChange[];
  useFineGrainedSyncing?: boolean;
  diffOnlyRemovals?: NodeChange[];
}

export interface DerivedImmutableFrameData {
  overrides?: NodeChange[];
  version?: number;
}

export interface JsxData {
  overrides?: NodeChange[];
}

export interface DerivedJsxData {
  overrides?: NodeChange[];
}

export interface AssetIdMap {
  entries?: AssetIdEntry[];
}

export interface AssetIdEntry {
  assetKey?: string;
  assetId?: AssetId;
}

export interface AssetRef {
  key?: string;
  version?: string;
}

export interface AssetId {
  guid?: GUID;
  assetRef?: AssetRef;
  stateGroupId?: StateGroupId;
  styleId?: StyleId;
  symbolId?: SymbolId;
  variableId?: VariableID;
  variableSetId?: VariableSetID;
}

export interface StateGroupId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface StyleId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface SymbolId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface VariableID {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface VariableOverrideId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface VariableSetID {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface ModuleId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface ResponsiveSetId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface ThemeID {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface CodeLibraryId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface CodeFileId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface CodeComponentId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface CanvasNodeId {
  guid?: GUID;
  symbolId?: SymbolId;
  stateGroupId?: StateGroupId;
}

export interface IndexRange {
  startIndex: number;
  endIndexExclusive: number;
}

export interface CollaborativeTextOpID {
  sessionID: number;
  counterID: number;
}

export interface CollaborativeTextStrippedOpRunWithIDs {
  firstId?: CollaborativeTextOpID;
  runLength?: number;
  parentIds?: CollaborativeTextOpID[];
  rebasedOnOpIds?: CollaborativeTextOpID[];
}

export interface CollaborativeTextStrippedOpRunWithLoc {
  type?: CollaborativeTextOpType;
  range?: IndexRange;
  rangeShouldBeIteratedInReverse?: boolean;
  contentBytesInBuffer?: IndexRange;
  rebasedRange?: IndexRange;
}

export interface CollaborativeTextOpRun {
  id?: CollaborativeTextOpID;
  parentIds?: CollaborativeTextOpID[];
  type?: CollaborativeTextOpType;
  range?: IndexRange;
  rangeShouldBeIteratedInReverse?: boolean;
  content?: string;
  rebasedOnOpIds?: CollaborativeTextOpID[];
  rebasedRange?: IndexRange;
}

export interface CollaborativePlainText {
  historyOpsWithIds?: CollaborativeTextStrippedOpRunWithIDs[];
  historyOpsWithLoc?: CollaborativeTextStrippedOpRunWithLoc[];
  historyStringContentBuffer?: Uint8Array;
  changesToAppend?: CollaborativeTextOpRun[];
}

export interface CollaborativeTextSelection {
  node?: GUID;
  field?: number;
  selectedRange?: IndexRange;
  caretAtFront?: boolean;
  textVersion?: CollaborativeTextOpID[];
}

export interface ResponsiveTextStyleVariant {
  minWidth?: number;
  fields?: NodeChange;
  variableFontSize?: VariableData;
  variableLineHeight?: VariableData;
  variableLetterSpacing?: VariableData;
  variableParagraphSpacing?: VariableData;
  name?: string;
}

export interface SlideThemeProps {
  themeVersion?: string;
  variableSetId?: VariableSetID;
  textStyleIds?: StyleId[];
  isTextColorManuallySelected?: boolean;
  isBorderColorManuallySelected?: boolean;
  subscribedThemeRef?: AssetRef;
  schemaVersion?: number;
  isGeneratedFromDesign?: boolean;
}

export interface SlideThemeMap {
  entries?: SlideThemeMapEntry[];
}

export interface SlideThemeMapEntry {
  themeId?: ThemeID;
  themeProps?: SlideThemeProps;
}

export interface SharedSymbolReference {
  fileKey?: string;
  symbolID?: GUID;
  versionHash?: string;
  guidPathMappings?: GUIDPathMapping[];
  bytes?: Uint8Array;
  libraryGUIDToSubscribingGUID?: GUIDMapping[];
  componentKey?: string;
  unflatteningMappings?: GUIDPathMapping[];
  isUnflattened?: boolean;
}

export interface SharedComponentMasterData {
  componentKey?: string;
  publishingGUIDPathToTeamLibraryGUID?: GUIDPathMapping[];
  isUnflattened?: boolean;
}

export interface InstanceOverrideStash {
  overridePathOfSwappedInstance?: GUIDPath;
  componentKey?: string;
  overrides?: NodeChange[];
}

export interface InstanceOverrideStashV2 {
  overridePathOfSwappedInstance?: GUIDPath;
  localSymbolID?: GUID;
  overrides?: NodeChange[];
}

export interface ImportedCodeFileEntry {
  codeFileId?: CodeFileId;
}

export interface ImportedCodeFiles {
  entries?: ImportedCodeFileEntry[];
}

export interface Effect {
  type?: EffectType;
  offset?: Vector;
  radius?: number;
  visible?: boolean;
  blendMode?: BlendMode;
  spread?: number;
  showShadowBehindNode?: boolean;
  radiusVar?: VariableData;
  colorVar?: VariableData;
  spreadVar?: VariableData;
  xVar?: VariableData;
  yVar?: VariableData;
  count?: number;
  repeatType?: RepeatType;
  axis?: EffectAxis;
  unitType?: UnitType;
  order?: RepeatOrder;
  blurOpType?: BlurOpType;
  startOffset?: Vector;
  endOffset?: Vector;
  startRadius?: number;
  color?: Color;
  secondaryColor?: Color;
  noiseSize?: Vector;
  seed?: number;
  clipToShape?: boolean;
  density?: number;
  noiseType?: NoiseType;
  opacity?: number;
  refractionRadius?: number;
  specularAngle?: number;
  specularIntensity?: number;
  bevelSize?: number;
  chromaticAberration?: number;
  reflectionDistance?: number;
  refractionIntensity?: number;
}

export interface TransformModifier {
  type?: TransformModifierType;
  offset?: Vector;
  visible?: boolean;
  count?: number;
  repeatType?: RepeatType;
  axis?: EffectAxis;
  unitType?: UnitType;
  order?: RepeatOrder;
  skewX?: number;
  skewY?: number;
}

export interface TransitionInfo {
  type?: TransitionType;
  duration?: number;
}

export interface PrototypeDevice {
  type?: PrototypeDeviceType;
  size?: Vector;
  presetIdentifier?: string;
  rotation?: DeviceRotation;
}

export interface OverlayBackgroundAppearance {
  backgroundType?: OverlayBackgroundType;
  backgroundColor?: Color;
}

export interface ExportSettings {
  suffix?: string;
  imageType?: ImageType;
  constraint?: ExportConstraint;
  svgDataName?: boolean;
  svgIDMode?: ExportSVGIDMode;
  svgOutlineText?: boolean;
  contentsOnly?: boolean;
  svgForceStrokeMasks?: boolean;
  useAbsoluteBounds?: boolean;
  colorProfile?: ExportColorProfile;
  quality?: number;
  useBicubicSampler?: boolean;
}

export interface LayoutGrid {
  type?: LayoutGridType;
  axis?: Axis;
  visible?: boolean;
  numSections?: number;
  offset?: number;
  sectionSize?: number;
  gutterSize?: number;
  color?: Color;
  pattern?: LayoutGridPattern;
  numSectionsVar?: VariableData;
  offsetVar?: VariableData;
  sectionSizeVar?: VariableData;
  gutterSizeVar?: VariableData;
}

export interface Guide {
  axis?: Axis;
  offset?: number;
  guid?: GUID;
}

export interface Path {
  windingRule?: WindingRule;
  commandsBlob?: number;
  styleID?: number;
}

export interface DynamicStrokeSettings {
  frequency?: number;
  wiggle?: number;
  smoothen?: number;
}

export interface ScatterStrokeSettings {
  gap?: number;
  wiggle?: number;
  angularJitter?: number;
  rotation?: number;
  sizeJitter?: number;
}

export interface StretchStrokeSettings {
  orientation?: BrushOrientation;
}

export interface VariableWidthPoint {
  position?: number;
  ascent?: number;
  descent?: number;
  segmentId?: number;
}

export interface SharedStyleReference {
  styleKey?: string;
  versionHash?: string;
}

export interface SharedStyleMasterData {
  styleKey?: string;
  sortPosition?: string;
  fileKey?: string;
}

export interface ArcData {
  startingAngle?: number;
  endingAngle?: number;
  innerRadius?: number;
}

export interface SymbolLink {
  uri?: string;
  displayName?: string;
  displayText?: string;
}

export interface PluginData {
  pluginID?: string;
  value?: string;
  key?: string;
}

export interface PluginRelaunchData {
  pluginID?: string;
  message?: string;
  command?: string;
  isDeleted?: boolean;
}

export interface MultiplayerFieldVersion {
  counter?: number;
  sessionID?: number;
}

export interface ConnectorEndpoint {
  endpointNodeID?: GUID;
  position?: Vector;
  magnet?: ConnectorMagnet;
  relativePosition?: Vector;
}

export interface ConnectorControlPoint {
  position?: Vector;
  axis?: Vector;
}

export interface ConnectorTextMidpoint {
  section?: ConnectorTextSection;
  offset?: number;
  offAxisOffset?: ConnectorOffAxisOffset;
}

export interface AnnotationProperty {
  type?: AnnotationPropertyType;
}

export interface AnnotationCategoryCustom {
  color?: AnnotationCategoryColor;
  customColor?: Color;
  label?: string;
}

export interface AnnotationCategory {
  id?: GUID;
  preset?: AnnotationCategoryPreset;
  custom?: AnnotationCategoryCustom;
}

export interface AnnotationCategories {
  version?: number;
  items?: AnnotationCategory[];
}

export interface Annotation {
  label?: string;
  properties?: AnnotationProperty[];
  labelV2?: string;
  categoryId?: GUID;
}

export interface AnnotationMeasurement {
  id?: GUID;
  fromNode?: GUID;
  toNode?: GUID;
  fromNodeSide?: AnnotationMeasurementNodeSide;
  toSameSide?: boolean;
  innerOffsetRelative?: number;
  outerOffsetFixed?: number;
  toNodeStablePath?: GUIDPath;
  freeText?: string;
}

export interface LibraryMoveInfo {
  oldKey?: string;
  pasteFileKey?: string;
}

export interface LibraryMoveHistoryItem {
  sourceNodeId?: GUID;
  sourceComponentKey?: string;
}

export interface DeveloperRelatedLink {
  nodeId?: string;
  fileKey?: string;
  linkName?: string;
  linkUrl?: string;
}

export interface WidgetPointer {
  nodeId?: GUID;
}

export interface EditInfo {
  timestampIso8601?: string;
  userId?: string;
  lastEditedAt?: number;
  createdAt?: number;
}

export interface SectionStatusInfo {
  status?: SectionStatus;
  lastUpdateUnixTimestamp?: number;
  description?: string;
  userId?: string;
  prevStatus?: SectionStatus;
}

export interface BuzzApprovalRequestInfo {
  requestId?: string;
  requesterUserId?: string;
  requestedAt?: number;
  reviewerUserIds?: string[];
  title?: string;
  note?: string;
  assetsInRequest?: GUID[];
}

export interface BuzzApprovalRequests {
  requests?: BuzzApprovalRequestInfo[];
}

export interface BuzzApprovalNodeStatusInfo {
  currentStatus?: BuzzApprovalNodeStatus;
  wasPreviouslyApproved?: boolean;
  approvalRevokedAtHistory?: number[];
}

export interface NodeChange {
  guid?: GUID;
  guidTag?: number;
  phase?: NodePhase;
  phaseTag?: number;
  parentIndex?: ParentIndex;
  parentIndexTag?: number;
  type?: NodeType;
  typeTag?: number;
  name?: string;
  nameTag?: number;
  isPublishable?: boolean;
  description?: string;
  libraryMoveInfo?: LibraryMoveInfo;
  libraryMoveHistory?: LibraryMoveHistoryItem[];
  key?: string;
  fileAssetIds?: AssetIdMap;
  styleID?: number;
  styleIDTag?: number;
  isFillStyle?: boolean;
  isStrokeStyle?: boolean;
  isOverrideOverTextStyle?: boolean;
  styleType?: StyleType;
  styleDescription?: string;
  version?: string;
  userFacingVersion?: string;
  sortPosition?: string;
  ojansSuperSecretNodeField?: SharedStyleMasterData;
  sevMoonlitLilyData?: SharedStyleMasterData;
  isSoftDeletedStyle?: boolean;
  isNonUpdateable?: boolean;
  sharedStyleMasterData?: SharedStyleMasterData;
  sharedStyleReference?: SharedStyleReference;
  inheritFillStyleID?: GUID;
  inheritStrokeStyleID?: GUID;
  inheritTextStyleID?: GUID;
  inheritExportStyleID?: GUID;
  inheritEffectStyleID?: GUID;
  inheritGridStyleID?: GUID;
  inheritFillStyleIDForStroke?: GUID;
  styleIdForFill?: StyleId;
  styleIdForStrokeFill?: StyleId;
  styleIdForText?: StyleId;
  styleIdForEffect?: StyleId;
  styleIdForGrid?: StyleId;
  backgroundPaints?: Paint[];
  inheritFillStyleIDForBackground?: GUID;
  isStateGroup?: boolean;
  stateGroupPropertyValueOrders?: StateGroupPropertyValueOrder[];
  sharedSymbolReference?: SharedSymbolReference;
  isSymbolPublishable?: boolean;
  sharedSymbolMappings?: GUIDPathMapping[];
  sharedSymbolVersion?: string;
  sharedComponentMasterData?: SharedComponentMasterData;
  symbolDescription?: string;
  unflatteningMappings?: GUIDPathMapping[];
  forceUnflatteningMappings?: GUIDPathMapping[];
  publishFile?: string;
  sourceLibraryKey?: string;
  publishID?: GUID;
  componentKey?: string;
  isC2?: boolean;
  publishedVersion?: string;
  originComponentKey?: string;
  componentPropDefs?: ComponentPropDef[];
  componentPropRefs?: ComponentPropRef[];
  variantPropSpecs?: VariantPropSpec[];
  symbolData?: SymbolData;
  symbolDataTag?: number;
  derivedSymbolData?: NodeChange[];
  nestedInstanceResizeEnabled?: boolean;
  overriddenSymbolID?: GUID;
  componentPropAssignments?: ComponentPropAssignment[];
  propsAreBubbled?: boolean;
  overrideStash?: InstanceOverrideStash[];
  overrideStashV2?: InstanceOverrideStashV2[];
  guidPath?: GUIDPath;
  guidPathTag?: number;
  overrideLevel?: number;
  moduleType?: ModuleType;
  isSlot?: boolean;
  isSlotContent?: boolean;
  fontSize?: number;
  fontSizeTag?: number;
  paragraphIndent?: number;
  paragraphIndentTag?: number;
  paragraphSpacing?: number;
  paragraphSpacingTag?: number;
  textAlignHorizontal?: TextAlignHorizontal;
  textAlignHorizontalTag?: number;
  textAlignVertical?: TextAlignVertical;
  textAlignVerticalTag?: number;
  textCase?: TextCase;
  textCaseTag?: number;
  textDecoration?: TextDecoration;
  textDecorationTag?: number;
  lineHeight?: Number;
  lineHeightTag?: number;
  fontName?: FontName;
  fontNameTag?: number;
  textData?: TextData;
  textDataTag?: number;
  derivedTextData?: DerivedTextData;
  fontVariantCommonLigatures?: boolean;
  fontVariantContextualLigatures?: boolean;
  fontVariantDiscretionaryLigatures?: boolean;
  fontVariantHistoricalLigatures?: boolean;
  fontVariantOrdinal?: boolean;
  fontVariantSlashedZero?: boolean;
  fontVariantNumericFigure?: FontVariantNumericFigure;
  fontVariantNumericSpacing?: FontVariantNumericSpacing;
  fontVariantNumericFraction?: FontVariantNumericFraction;
  fontVariantCaps?: FontVariantCaps;
  fontVariantPosition?: FontVariantPosition;
  letterSpacing?: Number;
  fontVersion?: string;
  leadingTrim?: LeadingTrim;
  hangingPunctuation?: boolean;
  hangingList?: boolean;
  maxLines?: number;
  responsiveTextStyleVariants?: ResponsiveTextStyleVariant[];
  sectionStatus?: SectionStatus;
  sectionStatusInfo?: SectionStatusInfo;
  textUserLayoutVersion?: number;
  textExplicitLayoutVersion?: number;
  toggledOnOTFeatures?: OpenTypeFeature[];
  toggledOffOTFeatures?: OpenTypeFeature[];
  hyperlink?: Hyperlink;
  mention?: Mention;
  fontVariations?: FontVariation[];
  textBidiVersion?: number;
  textTruncation?: TextTruncation;
  hasHadRTLText?: boolean;
  emojiImageSet?: EmojiImageSet;
  slideThumbnailHash?: string;
  visible?: boolean;
  visibleTag?: number;
  locked?: boolean;
  lockedTag?: number;
  lockMode?: LockMode;
  opacity?: number;
  opacityTag?: number;
  blendMode?: BlendMode;
  blendModeTag?: number;
  size?: Vector;
  sizeTag?: number;
  transform?: Matrix;
  transformTag?: number;
  dashPattern?: number[];
  dashPatternTag?: number;
  mask?: boolean;
  maskTag?: number;
  rotationOrigin?: Vector;
  maskIsOutline?: boolean;
  maskIsOutlineTag?: number;
  maskType?: MaskType;
  backgroundOpacity?: number;
  backgroundOpacityTag?: number;
  cornerRadius?: number;
  cornerRadiusTag?: number;
  strokeWeight?: number;
  strokeWeightTag?: number;
  strokeAlign?: StrokeAlign;
  strokeAlignTag?: number;
  strokeCap?: StrokeCap;
  strokeCapTag?: number;
  strokeCapSize?: Number;
  strokeJoin?: StrokeJoin;
  strokeJoinTag?: number;
  fillPaints?: Paint[];
  fillPaintsTag?: number;
  strokePaints?: Paint[];
  strokePaintsTag?: number;
  effects?: Effect[];
  effectsTag?: number;
  backgroundColor?: Color;
  backgroundColorTag?: number;
  fillGeometry?: Path[];
  fillGeometryTag?: number;
  strokeGeometry?: Path[];
  strokeGeometryTag?: number;
  textDecorationFillPaints?: Paint[];
  textDecorationSkipInk?: boolean;
  textUnderlineOffset?: Number;
  textDecorationThickness?: Number;
  textDecorationStyle?: TextDecorationStyle;
  transformModifiers?: TransformModifier[];
  rectangleTopLeftCornerRadius?: number;
  rectangleTopRightCornerRadius?: number;
  rectangleBottomLeftCornerRadius?: number;
  rectangleBottomRightCornerRadius?: number;
  rectangleCornerRadiiIndependent?: boolean;
  rectangleCornerToolIndependent?: boolean;
  proportionsConstrained?: boolean;
  targetAspectRatio?: OptionalVector;
  useAbsoluteBounds?: boolean;
  borderTopHidden?: boolean;
  borderBottomHidden?: boolean;
  borderLeftHidden?: boolean;
  borderRightHidden?: boolean;
  bordersTakeSpace?: boolean;
  borderTopWeight?: number;
  borderBottomWeight?: number;
  borderLeftWeight?: number;
  borderRightWeight?: number;
  borderStrokeWeightsIndependent?: boolean;
  horizontalConstraint?: ConstraintType;
  horizontalConstraintTag?: number;
  stackMode?: StackMode;
  stackModeTag?: number;
  stackSpacing?: number;
  stackSpacingTag?: number;
  stackPadding?: number;
  stackPaddingTag?: number;
  stackCounterAlign?: StackCounterAlign;
  stackJustify?: StackJustify;
  stackAlign?: StackAlign;
  stackHorizontalPadding?: number;
  stackVerticalPadding?: number;
  stackWidth?: StackSize;
  stackHeight?: StackSize;
  stackPrimarySizing?: StackSize;
  stackPrimaryAlignItems?: StackJustify;
  stackCounterAlignItems?: StackAlign;
  stackChildPrimaryGrow?: number;
  stackPaddingRight?: number;
  stackPaddingBottom?: number;
  stackChildAlignSelf?: StackCounterAlign;
  stackPositioning?: StackPositioning;
  stackReverseZIndex?: boolean;
  stackWrap?: StackWrap;
  stackCounterSpacing?: number;
  minSize?: OptionalVector;
  maxSize?: OptionalVector;
  stackCounterAlignContent?: StackCounterAlignContent;
  sortedMovingChildIndices?: number[];
  gridRows?: GUIDPositionMap;
  gridColumns?: GUIDPositionMap;
  gridRowGap?: number;
  gridColumnGap?: number;
  gridRowAnchor?: GUID;
  gridColumnAnchor?: GUID;
  gridRowSpan?: number;
  gridColumnSpan?: number;
  gridColumnsSizing?: GUIDGridTrackSizeMap;
  gridRowsSizing?: GUIDGridTrackSizeMap;
  gridChildVerticalAlign?: GridChildAlign;
  gridChildHorizontalAlign?: GridChildAlign;
  isSnakeGameBoard?: boolean;
  transitionNodeID?: GUID;
  prototypeStartNodeID?: GUID;
  prototypeBackgroundColor?: Color;
  transitionInfo?: TransitionInfo;
  transitionType?: TransitionType;
  transitionDuration?: number;
  easingType?: EasingType;
  transitionPreserveScroll?: boolean;
  connectionType?: ConnectionType;
  connectionURL?: string;
  prototypeDevice?: PrototypeDevice;
  interactionType?: InteractionType;
  transitionTimeout?: number;
  interactionMaintained?: boolean;
  interactionDuration?: number;
  destinationIsOverlay?: boolean;
  transitionShouldSmartAnimate?: boolean;
  prototypeInteractions?: PrototypeInteraction[];
  objectAnimations?: PrototypeInteraction[];
  prototypeStartingPoint?: PrototypeStartingPoint;
  pluginData?: PluginData[];
  pluginRelaunchData?: PluginRelaunchData[];
  connectorStart?: ConnectorEndpoint;
  connectorEnd?: ConnectorEndpoint;
  connectorLineStyle?: ConnectorLineStyle;
  connectorStartCap?: StrokeCap;
  connectorEndCap?: StrokeCap;
  connectorControlPoints?: ConnectorControlPoint[];
  connectorBezierControlPoints?: ConnectorControlPoint[];
  connectorTextMidpoint?: ConnectorTextMidpoint;
  connectorType?: ConnectorType;
  annotations?: Annotation[];
  measurements?: AnnotationMeasurement[];
  annotationCategories?: AnnotationCategories;
  shapeWithTextType?: ShapeWithTextType;
  shapeUserHeight?: number;
  isStrokePaintDerived?: boolean;
  derivedImmutableFrameData?: DerivedImmutableFrameData;
  derivedImmutableFrameDataVersion?: MultiplayerFieldVersion;
  nodeGenerationData?: NodeGenerationData;
  jsxData?: JsxData;
  derivedJsxData?: DerivedJsxData;
  stableKey?: string;
  codeBlockLanguage?: CodeBlockLanguage;
  codeBlockTheme?: CodeBlockTheme;
  linkPreviewData?: LinkPreviewData;
  shapeTruncates?: boolean;
  sectionContentsHidden?: boolean;
  videoPlayback?: VideoPlayback;
  stampData?: StampData;
  sectionPresetInfo?: SectionPresetInfo;
  platformShapeDefinition?: PlatformShapeDefinition;
  widgetSyncedState?: MultiplayerMap;
  widgetSyncCursor?: number;
  widgetDerivedSubtreeCursor?: WidgetDerivedSubtreeCursor;
  widgetCachedAncestor?: WidgetPointer;
  widgetInputBehavior?: WidgetInputBehavior;
  widgetTooltip?: string;
  widgetHoverStyle?: WidgetHoverStyle;
  isWidgetStickable?: boolean;
  shouldHideCursorsOnWidgetHover?: boolean;
  widgetMetadata?: WidgetMetadata;
  widgetEvents?: WidgetEvent[];
  widgetPropertyMenuItems?: WidgetPropertyMenuItem[];
  widgetInputTextNodeType?: WidgetInputTextNodeType;
  jsxProps?: MultiplayerMap;
  tableRowPositions?: TableRowColumnPositionMap;
  tableColumnPositions?: TableRowColumnPositionMap;
  tableRowHeights?: TableRowColumnSizeMap;
  tableColumnWidths?: TableRowColumnSizeMap;
  interactiveSlideConfigData?: MultiplayerMap;
  interactiveSlideParticipantData?: MultiplayerMap;
  flappType?: FlappType;
  isEmbeddedPrototype?: boolean;
  slideSpeakerNotes?: string;
  isSkippedSlide?: boolean;
  themeID?: ThemeID;
  slideThemeData?: SlideThemeData;
  slideThemeMap?: SlideThemeMap;
  slideTemplateFileKey?: string;
  slideNumber?: SlideNumber;
  slideNumberSeparator?: string;
  diagramParentId?: GUID;
  layoutRoot?: GUID;
  layoutPosition?: string;
  diagramLayoutRuleType?: DiagramLayoutRuleType;
  diagramParentIndex?: DiagramParentIndex;
  diagramLayoutPaused?: DiagramLayoutPaused;
  isPageDivider?: boolean;
  internalEnumForTest?: InternalEnumForTest;
  internalDataForTest?: InternalDataForTest;
  autoRename?: boolean;
  autoRenameTag?: number;
  backgroundEnabled?: boolean;
  backgroundEnabledTag?: number;
  exportContentsOnly?: boolean;
  exportContentsOnlyTag?: number;
  miterLimit?: number;
  miterLimitTag?: number;
  textTracking?: number;
  textTrackingTag?: number;
  verticalConstraint?: ConstraintType;
  verticalConstraintTag?: number;
  exportSettings?: ExportSettings[];
  exportSettingsTag?: number;
  textAutoResize?: TextAutoResize;
  textAutoResizeTag?: number;
  layoutGrids?: LayoutGrid[];
  layoutGridsTag?: number;
  frameMaskDisabled?: boolean;
  frameMaskDisabledTag?: number;
  resizeToFit?: boolean;
  resizeToFitTag?: number;
  booleanOperation?: BooleanOperation;
  booleanOperationTag?: number;
  handleMirroring?: VectorMirror;
  handleMirroringTag?: number;
  count?: number;
  countTag?: number;
  starInnerScale?: number;
  starInnerScaleTag?: number;
  arcData?: ArcData;
  vectorData?: VectorData;
  vectorDataTag?: number;
  vectorOperationVersion?: number;
  textPathStart?: TextPathStart;
  exportBackgroundDisabled?: boolean;
  guides?: Guide[];
  internalOnly?: boolean;
  scrollDirection?: ScrollDirection;
  cornerSmoothing?: number;
  scrollOffset?: Vector;
  exportTextAsSVGText?: boolean;
  scrollContractedState?: ScrollContractedState;
  contractedSize?: Vector;
  fixedChildrenDivider?: string;
  scrollBehavior?: ScrollBehavior;
  derivedSymbolDataLayoutVersion?: number;
  navigationType?: NavigationType;
  overlayPositionType?: OverlayPositionType;
  overlayRelativePosition?: Vector;
  overlayBackgroundInteraction?: OverlayBackgroundInteraction;
  overlayBackgroundAppearance?: OverlayBackgroundAppearance;
  overrideKey?: GUID;
  containerSupportsFillStrokeAndCorners?: boolean;
  stackCounterSizing?: StackSize;
  containersSupportFillStrokeAndCorners?: boolean;
  keyTrigger?: KeyTrigger;
  voiceEventPhrase?: string;
  ancestorPathBeforeDeletion?: GUID[];
  symbolLinks?: SymbolLink[];
  textListData?: TextListData;
  detachOpticalSizeFromFontSize?: boolean;
  listSpacing?: number;
  embedData?: EmbedData;
  richMediaData?: RichMediaData;
  renderedSyncedState?: MultiplayerMap;
  simplifyInstancePanels?: boolean;
  accessibleHTMLTag?: HTMLTag;
  ariaRole?: ARIARole;
  ariaAttributes?: ARIAAttributesMap;
  accessibleLabel?: string;
  isDecorativeImage?: boolean;
  variableData?: VariableData;
  variableConsumptionMap?: VariableDataMap;
  variableModeBySetMap?: VariableModeBySetMap;
  variableSetModes?: VariableSetMode[];
  variableSetID?: VariableSetID;
  variableResolvedType?: VariableResolvedDataType;
  variableDataValues?: VariableDataValues;
  variableTokenName?: string;
  variableScopes?: VariableScope[];
  parameterConsumptionMap?: VariableDataMap;
  codeSyntax?: CodeSyntaxMap;
  pasteSource?: PasteSource;
  pageType?: EditorType;
  strokeBrushGuid?: GUID;
  strokeSeed?: bigint;
  variableWidthPoints?: VariableWidthPoint[];
  dynamicStrokeSettings?: DynamicStrokeSettings;
  scatterStrokeSettings?: ScatterStrokeSettings;
  stretchStrokeSettings?: StretchStrokeSettings;
  scatterBrushTransforms?: Matrix[];
  brushType?: BrushType;
  backingVariableSetId?: VariableSetID;
  overriddenVariableId?: VariableID;
  backingVariableId?: VariableIdOrVariableOverrideId;
  isCollectionExtendable?: boolean;
  rootVariableKey?: string;
  inheritedVariableIds?: InheritedVariablesData;
  handoffStatusMap?: HandoffStatusMap;
  agendaPositionMap?: AgendaPositionMap;
  agendaMetadataMap?: AgendaMetadataMap;
  migrationStatus?: MigrationStatus;
  isSoftDeleted?: boolean;
  editInfo?: EditInfo;
  colorProfile?: ColorProfile;
  detachedSymbolId?: SymbolId;
  childReadingDirection?: ChildReadingDirection;
  readingIndex?: string;
  documentColorProfile?: DocumentColorProfile;
  developerRelatedLinks?: DeveloperRelatedLink[];
  slideActiveThemeLibKey?: string;
  editScopeInfo?: EditScopeInfo;
  semanticWeight?: SemanticWeight;
  semanticItalic?: SemanticItalic;
  areSlidesManuallyIndented?: boolean;
  isResponsiveSet?: boolean;
  derivedBreakpointData?: DerivedBreakpointData;
  defaultResponsiveSetId?: GUID;
  isPrimaryBreakpoint?: boolean;
  primaryResponsiveNodeId?: GUID;
  multiEditGlueId?: GUID;
  breakpointMinWidth?: number;
  isBreakpointInFocus?: boolean;
  responsiveSetSettings?: ResponsiveSetSettings;
  behaviors?: NodeBehaviors;
  sourceCode?: string;
  collaborativeSourceCode?: CollaborativePlainText;
  belongsToCodeLibraryId?: CodeLibraryId;
  importedCodeFiles?: ImportedCodeFiles;
  codeFileCanvasNodeId?: CanvasNodeId;
  isEntrypointCodeFile?: boolean;
  componentOrStateGroupKey?: string;
  componentOrStateGroupVersion?: number;
  sourceCodeLibraryKey?: string;
  sourceCodeLibraryKeys?: string[];
  usedMakeLibraries?: UsedMakeLibrary[];
  makeLibraryComponentId?: string;
  shouldHidePreviewForMakeKitCreation?: boolean;
  codeExamples?: CodeExample[];
  exportedFromCodeFileId?: CodeFileId;
  codeExportName?: string;
  backingCodeComponentId?: CodeComponentId;
  isMainCodeComponent?: boolean;
  codeSnapshotState?: CodeSnapshotState;
  chatMessages?: NodeChatMessage[];
  chatCompressionState?: NodeChatCompressionState;
  aiChatThread?: AIChatThread;
  codeChatMessagesKey?: string;
  codeSnapshot?: CodeSnapshot;
  codeSnapshotInvalidatedAt?: number;
  isCodeBehavior?: boolean;
  autoForkCode?: boolean;
  hasBeenManuallyRenamed?: boolean;
  codeCreatedFromDesign?: boolean;
  codeCreatedFromDesignNodeId?: CanvasNodeId;
  imageImports?: ImageImportMap;
  codeObjectType?: CodeObjectType;
  codeFilePath?: string;
  codeBehaviorData?: CodeBehaviorData;
  codeLibraryFormat?: number;
  isCodePreviewPlayingOnCanvas?: boolean;
  cmsSelector?: CMSSelector;
  cmsConsumptionMap?: CMSConsumptionMap;
  cmsRichTextStyleMap?: CMSRichTextStyleMap;
  aiEditedNodeChangeFieldNumbers?: number[];
  aiEditScopeLabel?: string;
  firstDraftData?: FirstDraftData;
  firstDraftKitElementData?: FirstDraftKitElementData;
  cooperRevertData?: CooperRevertData;
  cooperTemplateData?: CooperTemplateData;
  buzzApprovalRequests?: BuzzApprovalRequests;
  buzzApprovalNodeStatusInfo?: BuzzApprovalNodeStatusInfo;
  hubFileAttribution?: HubFileAttribution;
  managedStringData?: ManagedStringData;
  thumbnailInfo?: ThumbnailInfo;
  aiCanvasPrompt?: AiCanvasPrompt;
  backingNodeId?: CanvasNodeId;
  motionTransform?: TRSSTransform2D;
  interpolationType?: InterpolationType;
  timelinePosition?: bigint;
  keyframeValue?: KeyframeValueData;
  bezierHandles?: BezierHandles;
  keyframeOperation?: KeyframeOperation;
  timelinePositionType?: TimelinePositionType;
  clipId?: GUID;
  timelineDuration?: bigint;
  timelineOffset?: bigint;
  playbackStyle?: PlaybackStyle;
  animationPresets?: AnimationPresets;
  transitionOverrides?: TransitionOverrideData;
}

export interface CodeSnapshot {
  state?: CodeSnapshotState;
  invalidatedAt?: number;
  paints?: Paint[];
  offset?: Vector;
  layoutSize?: Vector;
  canvasSize?: Vector;
  devicePixelRatio?: number;
}

export interface CodeBehaviorData {
  name?: string;
  icon?: string;
  nodeTypes?: string[];
  category?: string;
  apiVersion?: number;
}

export interface CodeExample {
  exampleName?: string;
  codeExportName?: string;
}

export interface UsedMakeLibrary {
  makeLibraryId?: string;
}

export interface CookieBannerText {
  bannerHeader?: string;
  bannerDisclaimerExplicit?: string;
  bannerDisclaimerImplicit?: string;
  policyLabel?: string;
  acceptText?: string;
  acknowledgeText?: string;
  manageText?: string;
  rejectText?: string;
  necessaryText?: string;
  necessaryDescription?: string;
  analyticsText?: string;
  analyticsDescription?: string;
  preferencesText?: string;
  preferencesDescription?: string;
  marketingText?: string;
  marketingDescription?: string;
  saveLabel?: string;
  triggerLabel?: string;
}

export interface CookieBannerSettings {
  enabled?: boolean;
  componentType?: CookieBannerComponentType;
  xAlignment?: CookieXAlignment;
  yAlignment?: CookieYAlignment;
  triggerXAlignment?: CookieXAlignment;
  triggerYAlignment?: CookieYAlignment;
  triggerComponentType?: TriggerComponentType;
  policyUrl?: string;
  text?: CookieBannerText;
  policyLink?: GUID;
  locale?: string;
}

export interface ResponsiveSetSettings {
  title?: string;
  description?: string;
  scalingMode?: ResponsiveScalingMode;
  scalingMinFontSize?: number;
  scalingMaxFontSize?: number;
  scalingMinLayoutWidth?: number;
  scalingMaxLayoutWidth?: number;
  lang?: string;
  faviconHash?: string;
  socialImageHash?: string;
  googleAnalyticsID?: string;
  blockSearchIndexing?: boolean;
  customCodeHeadStart?: string;
  customCodeHeadEnd?: string;
  customCodeBodyStart?: string;
  customCodeBodyEnd?: string;
  faviconID?: GUID;
  socialImageID?: GUID;
  addBypassLinks?: boolean;
  ignoreReducedMotion?: boolean;
  cookieBanner?: CookieBannerSettings;
}

export interface CMSSelector {
  cmsCollectionId?: string;
  filterCriteria?: CMSFilterCritera;
  sorts?: CMSSelectorSort[];
  limit?: number;
}

export interface CMSFilterCritera {
  matchType?: CMSFilterCriteriaMatchType;
  filters?: CMSSelectorFilter[];
}

export interface CMSSelectorFilter {
  cmsFieldId?: string;
  op?: CMSSelectorFilterOperator;
  comparisonValue?: string;
}

export interface CMSSelectorSort {
  cmsFieldId?: string;
  orderBy?: CMSFieldOrderBy;
}

export interface CMSConsumptionMap {
  entries?: CMSConsumptionMapEntry[];
}

export interface CMSConsumptionMapEntry {
  consumptionField?: CMSConsumptionField;
  cmsFieldId?: string;
}

export interface CMSRichTextStyleMap {
  entries?: CMSRichTextStyleEntry[];
}

export interface CMSRichTextStyleEntry {
  styleClass?: CMSRichTextStyleClass;
  textDescriptor?: CMSRichTextDescriptor;
}

export interface CMSRichTextDescriptor {
  textStyleId?: StyleId;
  fontNameVariants?: FontName[];
}

export interface InheritedVariablesData {
  variableIds?: InheritedVariableEntry[];
}

export interface InheritedVariableEntry {
  variableId?: VariableID;
}

export interface HubFileAttribution {
  hubFileId?: string;
  hubFileName?: string;
}

export interface ManagedStringData {
  key?: string;
  context?: string;
  locale?: string;
  content?: ManagedStringNode;
  contentSchema?: ManagedStringContentSchema;
}

export interface ManagedStringNode {
  type?: ManagedStringNodeType;
  textNodeData?: ManagedStringTextNodeData;
  concatenateNodeData?: ManagedStringConcatenateAstNodeData;
  pluralNodeData?: ManagedStringPluralAstNodeData;
  placeholderNodeData?: ManagedStringPlaceholderAstNodeData;
}

export interface ManagedStringTextNodeData {
  value?: string;
}

export interface ManagedStringConcatenateAstNodeData {
  values?: ManagedStringNode[];
}

export interface ManagedStringPluralAstNodeData {
  identifier?: string;
  conditions?: ManagedStringPluralTypeMapEntry[];
}

export interface ManagedStringPluralTypeMapEntry {
  key?: ManagedStringPluralType;
  value?: ManagedStringNode;
}

export interface ManagedStringPlaceholderAstNodeData {
  identifier?: string;
  formatType?: ManagedStringFormatType;
  formatPattern?: string;
}

export interface CooperRevertData {
  originalValues?: NodeChange;
}

export interface VideoPlayback {
  autoplay?: boolean;
  mediaLoop?: boolean;
  muted?: boolean;
  showControls?: boolean;
  startTimeMs?: number;
  endTimeMs?: number;
}

export interface WidgetHoverStyle {
  fillPaints?: Paint[];
  strokePaints?: Paint[];
  opacity?: number;
  areFillPaintsSet?: boolean;
  areStrokePaintsSet?: boolean;
  isOpacitySet?: boolean;
}

export interface WidgetDerivedSubtreeCursor {
  sessionID?: number;
  counter?: number;
}

export interface MultiplayerMap {
  entries?: MultiplayerMapEntry[];
}

export interface MultiplayerMapEntry {
  key?: string;
  value?: string;
}

export interface VariableDataMap {
  entries?: VariableDataMapEntry[];
}

export interface VariableDataMapEntry {
  nodeField?: number;
  variableData?: VariableData;
  variableField?: VariableField;
}

export interface VariableModeBySetMap {
  entries?: VariableModeBySetMapEntry[];
}

export interface VariableModeBySetMapEntry {
  variableSetID?: VariableSetID;
  variableModeID?: GUID;
  variableSetExtensionID?: VariableSetID;
}

export interface CodeSyntaxMap {
  entries?: CodeSyntaxMapEntry[];
}

export interface CodeSyntaxMapEntry {
  platform?: CodeSyntaxPlatform;
  value?: string;
}

export interface TableRowColumnPositionMap {
  entries?: TableRowColumnPositionMapEntry[];
}

export interface TableRowColumnPositionMapEntry {
  id?: GUID;
  position?: string;
}

export interface GUIDPositionMap {
  entries?: GUIDPositionMapEntry[];
}

export interface GUIDPositionMapEntry {
  id?: GUID;
  position?: string;
}

export interface GUIDGridTrackSizeMap {
  entries?: GUIDGridTrackSizeMapEntry[];
}

export interface GUIDGridTrackSizeMapEntry {
  id?: GUID;
  trackSize?: GridTrackSize;
}

export interface ObjectAnimationList {
  entries?: ObjectAnimationListItem[];
}

export interface ObjectAnimationListItem {
  targetNodeId?: GUID;
  animation?: PrototypeAction;
}

export interface GridTrackSize {
  minSizing?: GridTrackSizingFunction;
  maxSizing?: GridTrackSizingFunction;
}

export interface GridTrackSizingFunction {
  type?: GridTrackSizingType;
  value?: number;
}

export interface TableRowColumnSizeMap {
  entries?: TableRowColumnSizeMapEntry[];
}

export interface TableRowColumnSizeMapEntry {
  id?: GUID;
  size?: number;
}

export interface AgendaPositionMap {
  entries?: AgendaPositionMapEntry[];
}

export interface AgendaPositionMapEntry {
  id?: GUID;
  position?: string;
}

export interface AgendaMetadataMap {
  entries?: AgendaMetadataMapEntry[];
}

export interface AgendaMetadataMapEntry {
  id?: GUID;
  data?: AgendaMetadata;
}

export interface AgendaMetadata {
  name?: string;
  type?: AgendaItemType;
  targetNodeID?: GUID;
  timerInfo?: AgendaTimerInfo;
  voteInfo?: AgendaVoteInfo;
  musicInfo?: AgendaMusicInfo;
}

export interface AgendaTimerInfo {
  timerLength?: number;
}

export interface AgendaVoteInfo {
  voteCount?: number;
}

export interface AgendaMusicInfo {
  songID?: string;
  startTimeMs?: number;
}

export interface DiagramParentIndex {
  guid: GUID;
  position: string;
}

export interface ComponentPropRef {
  nodeField?: number;
  defID?: GUID;
  zombieFallbackName?: string;
  componentPropNodeField?: ComponentPropNodeField;
  isDeleted?: boolean;
}

export interface ComponentPropAssignment {
  defID?: GUID;
  value?: ComponentPropValue;
  varValue?: VariableData;
  legacyDerivedTextData?: DerivedTextData;
}

export interface ComponentPropDef {
  id?: GUID;
  name?: string;
  initialValue?: ComponentPropValue;
  sortPosition?: string;
  parentPropDefId?: GUID;
  type?: ComponentPropType;
  isDeleted?: boolean;
  preferredValues?: ComponentPropPreferredValues;
  varValue?: VariableData;
  parameterConfig?: ParameterConfig;
  description?: string;
}

export interface ComponentPropValue {
  boolValue?: boolean;
  textValue?: TextData;
  guidValue?: GUID;
  floatValue?: number;
}

export interface ComponentPropPreferredValues {
  stringValues?: string[];
  instanceSwapValues?: InstanceSwapPreferredValue[];
}

export interface ParameterConfig {
  numberPropConfig?: NumberPropConfig;
  control?: ParameterConfigControl;
  sliderConfig?: SliderConfig;
  label?: VariableData;
  inputConfig?: InputConfig;
  selectConfig?: SelectConfig;
}

export interface InputConfig {
  unit?: VariableData;
  min?: VariableData;
  max?: VariableData;
}

export interface SliderConfig {
  min?: VariableData;
  max?: VariableData;
  step?: VariableData;
}

export interface SelectOption {
  value?: VariableData;
  label?: string;
}

export interface SelectConfig {
  options?: SelectOption[];
}

export interface NumberPropConfig {
  control?: ParameterConfigControl;
  min?: VariableData;
  max?: VariableData;
  step?: VariableData;
}

export interface InstanceSwapPreferredValue {
  type?: InstanceSwapPreferredValueType;
  key?: string;
}

export interface WidgetMetadata {
  pluginID?: string;
  pluginVersionID?: string;
  widgetName?: string;
  isResizable?: boolean;
  isRotatable?: boolean;
}

export interface WidgetPropertyMenuSelectorOption {
  option?: string;
  tooltip?: string;
}

export interface WidgetPropertyMenuItem {
  propertyName?: string;
  tooltip?: string;
  itemType?: WidgetPropertyMenuItemType;
  icon?: string;
  options?: WidgetPropertyMenuSelectorOption[];
  selectedOption?: string;
  isToggled?: boolean;
  href?: string;
  allowCustomColor?: boolean;
}

export interface InternalDataForTest {
  testFieldA?: number;
}

export interface StateGroupPropertyValueOrder {
  property?: string;
  values?: string[];
}

export interface VariantPropSpec {
  propDefId?: GUID;
  value?: string;
}

export interface TextListData {
  listID?: number;
  bulletType?: BulletType;
  indentationLevel?: number;
  lineNumber?: number;
}

export interface TextLineData {
  lineType?: LineType;
  styleId?: number;
  indentationLevel?: number;
  sourceDirectionality?: SourceDirectionality;
  directionality?: Directionality;
  directionalityIntent?: DirectionalityIntent;
  downgradeStyleId?: number;
  consistencyStyleId?: number;
  listStartOffset?: number;
  isFirstLineOfList?: boolean;
}

export interface DerivedTextLineData {
  directionality?: Directionality;
}

export interface PrototypeInteraction {
  id?: GUID;
  event?: PrototypeEvent;
  actions?: PrototypeAction[];
  isDeleted?: boolean;
  stateManagementVersion?: number;
}

export interface PrototypeEvent {
  interactionType?: InteractionType;
  interactionMaintained?: boolean;
  interactionDuration?: number;
  keyTrigger?: KeyTrigger;
  voiceEventPhrase?: string;
  transitionTimeout?: number;
  mediaHitTime?: number;
}

export interface PrototypeVariableTarget {
  id?: VariableID;
  nodeFieldAlias?: NodeFieldAlias;
}

export interface ConditionalActions {
  actions?: PrototypeAction[];
  condition?: VariableData;
}

export interface PrototypeAction {
  transitionNodeID?: GUID;
  transitionType?: TransitionType;
  transitionDuration?: number;
  easingType?: EasingType;
  transitionTimeout?: number;
  transitionShouldSmartAnimate?: boolean;
  connectionType?: ConnectionType;
  overlayRelativePosition?: Vector;
  navigationType?: NavigationType;
  transitionPreserveScroll?: boolean;
  easingFunction?: number[];
  extraScrollOffset?: Vector;
  transitionResetScrollPosition?: boolean;
  transitionResetInteractiveComponents?: boolean;
  connectionURL?: string;
  openUrlInNewTab?: boolean;
  linkParam?: VariableData;
  cmsTarget?: CMSItemPageTarget;
  targetVariableID?: GUID;
  targetVariableValue?: VariableAnyValue;
  targetVariable?: PrototypeVariableTarget;
  targetVariableData?: VariableData;
  mediaAction?: MediaAction;
  transitionResetVideoPosition?: boolean;
  mediaSkipToTime?: number;
  mediaSkipByAmount?: number;
  mediaPlaybackRate?: number;
  conditions?: VariableData[];
  conditionalActions?: ConditionalActions[];
  targetVariableSetID?: VariableSetID;
  targetVariableModeID?: GUID;
  targetVariableSetKey?: string;
  variableSetTargetExtensionId?: VariableSetID;
  animationType?: AnimationType;
  animationTargetId?: GUID;
  animationPhase?: AnimationPhase;
  animationState?: AnimationState;
  simpleLink?: boolean;
}

export interface AnimationState {
  opacity?: number;
  transform?: Matrix;
}

export interface PrototypeStartingPoint {
  name?: string;
  description?: string;
  position?: string;
}

export interface KeyTrigger {
  keyCodes?: number[];
  triggerDevice?: TriggerDevice;
}

export interface Hyperlink {
  url?: string;
  guid?: GUID;
  cmsTarget?: CMSItemPageTarget;
  openInNewTab?: boolean;
}

export interface CMSItemPageTarget {
  nodeId?: GUID;
  cmsItemId?: string;
  fieldSchemaId?: string;
}

export interface Mention {
  id?: GUID;
  mentionedUserId?: string;
  mentionedByUserId?: string;
  fileKey?: string;
  source?: MentionSource;
  mentionedUserIdInt?: bigint;
  mentionedByUserIdInt?: bigint;
}

export interface EmbedData {
  url?: string;
  srcUrl?: string;
  title?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  embedType?: string;
  thumbnailImageHash?: string;
  faviconImageHash?: string;
  provider?: string;
  originalText?: string;
  description?: string;
  embedVersionId?: string;
}

export interface StampData {
  userId?: string;
  votingSessionId?: string;
  stampedByUserId?: string;
}

export interface LinkPreviewData {
  url?: string;
  title?: string;
  provider?: string;
  description?: string;
  thumbnailImageHash?: string;
  faviconImageHash?: string;
  thumbnailImageWidth?: number;
  thumbnailImageHeight?: number;
}

export interface Viewport {
  canvasSpaceBounds?: Rect;
  pixelPreview?: boolean;
  pixelDensity?: number;
  canvasGuid?: GUID;
}

export interface Mouse {
  cursor?: MouseCursor;
  canvasSpaceLocation?: Vector;
  canvasSpaceSelectionBox?: Rect;
  canvasGuid?: GUID;
  cursorHiddenReason?: number;
}

export interface Click {
  id: number;
  point: Vector;
}

export interface ScrollPosition {
  node: GUID;
  scrollOffset: Vector;
}

export interface TriggeredOverlay {
  overlayGuid: GUID;
  hotspotGuid: GUID;
  swapGuid: GUID;
}

export interface TriggeredOverlayData {
  overlayGuid?: GUID;
  hotspotGuid?: GUID;
  swapGuid?: GUID;
  prototypeInteractionGuid?: GUID;
  hotspotBlueprintId?: GUIDPath;
}

export interface TriggeredSetVariableActionData {
  nodeForFindingTopmostScreenId?: GUID;
  targetVariableId?: string;
  targetVariableData?: string;
  resolvedVariableModes?: string;
}

export interface TriggeredSetVariableModeActionData {
  nodeForFindingTopmostScreenId?: GUID;
  targetVariableSetKey?: string;
  targetVariableModeId?: string;
  targetVariableSetId?: VariableSetID;
}

export interface VideoStateChangeData {
  targetNodeId?: GUID;
  isPlaying?: boolean;
  isPlayingSound?: boolean;
  currentTimes?: number[];
  actionTakenTimestamp?: number;
}

export interface EmbeddedPrototypeData {
  nodeId?: GUID;
  sessionId?: number;
}

export interface PresentedState {
  baseScreenID?: GUID;
  overlays?: TriggeredOverlayData[];
}

export interface TopLevelPlaybackChange {
  oldState?: PresentedState;
  newState?: PresentedState;
  hotspotBlueprintID?: GUIDPath;
  interactionID?: GUID;
  isHotspotInNewPresentedState?: boolean;
  direction?: TransitionDirection;
  instanceStablePath?: GUIDPath;
}

export interface InstanceStateChange {
  stateID?: GUID;
  interactionID?: GUID;
  hotspotStablePath?: GUIDPath;
  instanceStablePath?: GUIDPath;
  phase?: PlaybackChangePhase;
}

export interface TextCursor {
  selectionBox?: Rect;
  canvasGuid?: GUID;
  textNodeGuid?: GUID;
}

export interface TextSelection {
  selectionBoxes?: Rect[];
  canvasGuid?: GUID;
  textNodeGuid?: GUID;
  textSelectionRange?: Vector;
  textNodeOrContainingIfGuid?: GUID;
  tableCellRowId?: GUID;
  tableCellColId?: GUID;
}

export interface PlaybackChangeKeyframe {
  phase?: PlaybackChangePhase;
  progress?: number;
  timestamp?: number;
}

export interface StateMapping {
  stablePath?: GUIDPath;
  lastTopLevelChange?: TopLevelPlaybackChange;
  lastTopLevelChangeStatus?: PlaybackChangeKeyframe;
  timestamp?: number;
}

export interface ScrollMapping {
  blueprintID?: GUIDPath;
  overlayIndex?: number;
  scrollOffset?: Vector;
}

export interface PlaybackUpdate {
  lastTopLevelChange?: TopLevelPlaybackChange;
  lastTopLevelChangeStatus?: PlaybackChangeKeyframe;
  scrollMappings?: ScrollMapping[];
  timestamp?: number;
  pointerLocation?: Vector;
  isTopLevelFrameChange?: boolean;
  stateMappings?: StateMapping[];
}

export interface ChatMessage {
  text?: string;
  previousText?: string;
}

export interface VoiceMetadata {
  connectedCallId?: string;
}

export interface AprilFunCursor {
  id?: string;
  trailEnabled?: boolean;
}

export interface AprilFunFigPal {
  customization?: string;
  name?: string;
}

export interface UserChange {
  sessionID?: number;
  stableSessionID?: string;
  connected?: boolean;
  name?: string;
  color?: Color;
  imageURL?: string;
  viewport?: Viewport;
  mouse?: Mouse;
  selection?: GUID[];
  observing?: number[];
  deviceName?: string;
  recentClicks?: Click[];
  scrollPositions?: ScrollPosition[];
  triggeredOverlays?: TriggeredOverlay[];
  userID?: string;
  lastTriggeredHotspot?: GUID;
  lastTriggeredPrototypeInteractionID?: GUID;
  lastTriggeredObjectAnimationIndex?: number;
  triggeredOverlaysData?: TriggeredOverlayData[];
  playbackUpdates?: PlaybackUpdate[];
  chatMessage?: ChatMessage;
  voiceMetadata?: VoiceMetadata;
  canWrite?: boolean;
  highFiveStatus?: boolean;
  instanceStateChanges?: InstanceStateChange[];
  textCursor?: TextCursor;
  textSelection?: TextSelection;
  connectedAtTimeS?: number;
  focusOnTextCursor?: boolean;
  heartbeat?: Heartbeat;
  triggeredSetVariableActionData?: TriggeredSetVariableActionData[];
  videoStateChangeData?: VideoStateChangeData[];
  clientID?: string;
  focusedSlideId?: GUID;
  triggeredSetVariableModeActionData?: TriggeredSetVariableModeActionData[];
  aprilFunCursor?: AprilFunCursor;
  embeddedPrototypeData?: EmbeddedPrototypeData[];
  activeSlidesEmbeddablePrototype?: GUID;
  activeEmbeddedPrototypes?: GUID[];
  activeCodeComponentId?: GUID;
  aprilFunFigPal?: AprilFunFigPal;
  collaborativeTextSelection?: CollaborativeTextSelection;
  sitesViewState?: SitesViewState;
  nodeChatExchanges?: NodeChatExchange[];
  designFullPageViewState?: DesignFullPageViewState;
}

export interface InteractiveSlideElementChange {
  userID?: string;
  anonymousUserID?: string;
  nodeID?: GUID;
  responseData?: string;
}

export interface NodeStatusChange {
  nodeIds?: GUID[];
  statusInfo?: SectionStatusInfo;
}

export interface SceneGraphQuery {
  startingNode?: GUID;
  depth?: number;
  behavior?: SceneGraphQueryBehavior;
}

export interface NodeChangesMetadata {
  blobsFieldOffset?: number;
}

export interface CursorReaction {
  imageUrl?: string;
}

export interface TimerInfo {
  isPaused?: boolean;
  timeRemainingMs?: number;
  totalTimeMs?: number;
  timerID?: number;
  setBy?: string;
  songID?: number;
  lastReceivedSongTimestampMs?: number;
  songUUID?: string;
}

export interface MusicInfo {
  isPaused?: boolean;
  messageID?: number;
  songID?: string;
  lastReceivedSongTimestampMs?: number;
  isStopped?: boolean;
}

export interface PresenterNomination {
  sessionID?: number;
  isCancelled?: boolean;
}

export interface PresenterInfo {
  sessionID?: number;
  nomination?: PresenterNomination;
  isReconnected?: boolean;
}

export interface ClientBroadcast {
  sessionID?: number;
  cursorReaction?: CursorReaction;
  timer?: TimerInfo;
  presenter?: PresenterInfo;
  prototypePresenter?: PresenterInfo;
  music?: MusicInfo;
}

export interface Message {
  type?: MessageType;
  sessionID?: number;
  stableSessionID?: string;
  ackID?: number;
  isRetransmission?: boolean;
  nodeChanges?: NodeChange[];
  userChanges?: UserChange[];
  interactiveSlideElementChange?: InteractiveSlideElementChange;
  nodeStatusChange?: NodeStatusChange;
  blobs?: Blob[];
  blobBaseIndex?: number;
  signalName?: string;
  access?: Access;
  styleSetName?: string;
  styleSetType?: StyleSetType;
  styleSetContentType?: StyleSetContentType;
  pasteID?: number;
  pasteOffset?: Vector;
  pasteFileKey?: string;
  signalPayload?: string;
  sceneGraphQueries?: SceneGraphQuery[];
  nodeChangesMetadata?: NodeChangesMetadata;
  fileVersion?: number;
  pasteIsPartiallyOutsideEnclosingFrame?: boolean;
  pastePageId?: GUID;
  isCut?: boolean;
  localUndoStack?: Message[];
  localRedoStack?: Message[];
  broadcasts?: ClientBroadcast[];
  reconnectSequenceNumber?: number;
  pasteBranchSourceFileKey?: string;
  pasteEditorType?: EditorType;
  postSyncActions?: string;
  publishedAssetGuids?: GUID[];
  dirtyFromInitialLoad?: boolean;
  clipboardSelectionRegions?: ClipboardSelectionRegion[];
  encodedOffsetsIndex?: EncodedOffsetsIndex;
  hasRepeatingContent?: boolean;
  sentTimestamp?: bigint;
  annotationCategories?: AnnotationCategory[];
  clientRenderedMetadata?: ClientRenderedMetadata;
  pasteAssetType?: PasteAssetType;
  objectAnimations?: ObjectAnimationList;
}

export interface EncodedOffsetsIndex {
  nodeChangesFieldOffset?: number;
  nodeChangesFieldLength?: number;
  blobsFieldOffset?: number;
  nodeChangeOffsets?: GUIDAndEncodedOffset[];
}

export interface GUIDAndEncodedOffset {
  guid: GUID;
  offset: number;
}

export interface DiffChunk {
  nodeChanges?: number[];
  phase?: NodePhase;
  displayNode?: NodeChange;
  canvasId?: GUID;
  canvasName?: string;
  canvasIsInternal?: boolean;
  chunksAffectingThisChunk?: number[];
  basisParentHierarchy?: NodeChange[];
  parentHierarchy?: NodeChange[];
  basisParentHierarchyGuids?: GUID[];
  parentHierarchyGuids?: GUID[];
}

export interface DiffPayload {
  nodeChanges?: NodeChange[];
  blobs?: Blob[];
  diffChunks?: DiffChunk[];
  diffBasis?: NodeChange[];
  basisParentNodeChanges?: NodeChange[];
  parentNodeChanges?: NodeChange[];
  diffType?: DiffType;
}

export interface RichMediaData {
  mediaHash?: string;
  richMediaType?: RichMediaType;
}

export interface VariableAnyValue {
  boolValue?: boolean;
  textValue?: string;
  floatValue?: number;
  alias?: VariableID;
  colorValue?: Color;
  expressionValue?: Expression;
  mapValue?: VariableMap;
  symbolIdValue?: SymbolId;
  fontStyleValue?: VariableFontStyle;
  textDataValue?: TextData;
  nodeFieldAliasValue?: NodeFieldAlias;
  cmsAliasValue?: CMSAlias;
  propRefValue?: PropRefValue;
  imageValue?: ImageParameterValue;
  managedStringAliasValue?: ManagedStringAlias;
  linkValue?: Hyperlink;
  jsRuntimeAliasValue?: JsRuntimeAlias;
  slotContentIdValue?: SlotContentId;
  keyframeTrackIdValue?: KeyframeTrackId;
  keyframeTrackParameterValue?: KeyframeTrackParameterValue;
}

export interface Expression {
  expressionFunction?: ExpressionFunction;
  expressionArguments?: VariableData[];
}

export interface VariableMapValue {
  key?: string;
  value?: VariableData;
  guidKey?: GUID;
}

export interface VariableMap {
  values?: VariableMapValue[];
}

export interface VariableFontStyle {
  asString?: VariableData;
  asFloat?: VariableData;
  asVariations?: VariableData;
}

export interface ImageParameterValue {
  image?: Image;
  imageThumbnail?: Image;
  animatedImage?: Image;
  altText?: string;
  originalImageHeight?: number;
  originalImageWidth?: number;
  animationFrame?: number;
}

export interface ThumbnailInfo {
  nodeID?: GUID;
  thumbnailVersion?: string;
}

export interface AiCanvasPrompt {
  userPrompt?: string;
  authorId?: string;
  parentNodeIds?: GUID[];
}

export interface NodeFieldAlias {
  stablePathToNode?: GUIDPath;
  nodeField?: NodeFieldAliasType;
  indexOrKey?: string;
}

export interface CMSAlias {
  collectionId?: string;
  itemId?: string;
  fieldId?: string;
  type?: VariableDataType;
}

export interface JsRuntimeAlias {
  lookupKey?: string;
}

export interface PropRefValue {
  defId?: GUID;
}

export interface ManagedStringId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface ManagedStringPlaceholderMapEntry {
  key?: string;
  value?: string;
}

export interface SlotContentId {
  guid?: GUID;
}

export interface ManagedStringAlias {
  managedStringId?: ManagedStringId;
  placeholderValues?: ManagedStringPlaceholderMapEntry[];
}

export interface KeyframeTrackId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface AnimationPresetId {
  guid?: GUID;
  assetRef?: AssetRef;
}

export interface TRSSTransform2D {
  translation?: Vector;
  rotation?: number;
  scale?: Vector;
  shearX?: number;
}

export interface VariableData {
  value?: VariableAnyValue;
  dataType?: VariableDataType;
  resolvedDataType?: VariableResolvedDataType;
}

export interface VariableSetMode {
  id?: GUID;
  name?: string;
  sortPosition?: string;
  parentVariableSetId?: VariableSetID;
  parentModeId?: GUID;
}

export interface VariableDataValues {
  entries?: VariableDataValuesEntry[];
}

export interface VariableDataValuesEntry {
  modeID?: GUID;
  variableData?: VariableData;
}

export interface KeyframeAnyValue {
  floatValue?: number;
}

export interface KeyframeValueData {
  value?: KeyframeAnyValue;
  valueType?: KeyframeValueType;
}

export interface ManualKeyframeTrackParameter {
  keyframeTrackId?: KeyframeTrackId;
}

export interface AnimationPresetKeyframeTrackParameter {
  animationPresetId?: AnimationPresetId;
  keyframeTrackId?: KeyframeTrackId;
}

export interface KeyframeTrackAnyParameter {
  manual?: ManualKeyframeTrackParameter;
  animationPreset?: AnimationPresetKeyframeTrackParameter;
}

export interface KeyframeTrackParameter {
  value?: KeyframeTrackAnyParameter;
  type?: KeyframeTrackParameterType;
}

export interface KeyframeTrackParameterValue {
  parameters?: KeyframeTrackParameter[];
}

export interface AnimationPresets {
  presets?: AnimationPresetData[];
}

export interface AnimationPresetData {
  animationPresetId?: AnimationPresetId;
}

export interface SpringParams {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export interface TransitionEasingAnyValue {
  springEasing?: SpringParams;
  bezierEasing?: BezierHandles;
}

export interface EasingData {
  easingType?: EasingType;
  easingValue?: TransitionEasingAnyValue;
}

export interface TransitionOverride {
  id?: GUID;
  duration?: number;
  durationVar?: VariableData;
  delay?: number;
  delayVar?: VariableData;
  easing?: EasingData;
  easingVar?: VariableData;
}

export interface TransitionOverrideData {
  all?: TransitionOverride[];
}

export interface OptionalVector {
  value?: Vector;
}

export interface MigrationStatus {
  dsdCleanup?: boolean;
}

export interface NodeFieldMap {
  entries?: NodeFieldMapEntry[];
}

export interface NodeFieldMapEntry {
  guid?: GUID;
  field?: number;
  lastModifiedSequenceNumber?: number;
}

export interface ARIAAttributeAnyValue {
  boolValue?: boolean;
  stringValue?: string;
  floatValue?: number;
  intValue?: number;
  stringArrayValue?: string[];
}

export interface ARIAAttributeData {
  type?: ARIAAttributeDataType;
  value?: ARIAAttributeAnyValue;
}

export interface ARIAAttributesMap {
  entries?: ARIAAttributesMapEntry[];
}

export interface ARIAAttributesMapEntry {
  attribute?: string;
  value?: ARIAAttributeData;
}

export interface HandoffStatusMapEntry {
  guid?: GUID;
  handoffStatus?: SectionStatusInfo;
}

export interface HandoffStatusMap {
  entries?: HandoffStatusMapEntry[];
}

export interface EditScopeInfo {
  editScopeStacks?: EditScopeStack[];
  snapshots?: EditScopeSnapshot[];
}

export interface EditScopeSnapshot {
  frames?: EditScopeStack[];
  nodeChangeFieldNumbers?: number[];
}

export interface EditScopeStack {
  stack?: EditScope[];
}

export interface EditScope {
  type?: EditScopeType;
  label?: string;
  editorType?: EditorType;
}

export interface SectionPresetInfo {
  shelfId?: bigint;
  templateId?: bigint;
  templateName?: string;
  state?: SectionPresetState;
}

export interface ClipboardSelectionRegion {
  parent?: GUID;
  nodes?: GUID[];
  enclosingFrameOffset?: Vector;
  pasteIsPartiallyOutsideEnclosingFrame?: boolean;
  focusType?: SelectionRegionFocusType;
}

export interface FirstDraftKit {
  key?: string;
  type?: FirstDraftKitType;
}

export interface FirstDraftData {
  generationId?: string;
  kit?: FirstDraftKit;
}

export interface FirstDraftKitElementData {
  type?: FirstDraftKitElementType;
}

export interface PlatformShapePropertyMapEntry {
  property?: PlatformShapeProperty;
  nodePaths?: GUIDPath[];
}

export interface PlatformShapeDefinition {
  propertyMapEntries?: PlatformShapePropertyMapEntry[];
  behaviorType?: PlatformShapeBehaviorType;
  thumbnailNode?: GUIDPath;
}

export interface NodeBehaviors {
  link?: LinkBehavior;
  appear?: AppearBehavior;
  hover?: HoverBehavior;
  press?: PressBehavior;
  focus?: FocusBehavior;
  scrollParallax?: ScrollParallaxBehavior;
  scrollTransform?: ScrollTransformBehavior;
  cursor?: CursorBehavior;
  marquee?: MarqueeBehavior;
  code?: CodeBehavior[];
}

export interface BehaviorTransition {
  easingType?: EasingType;
  easingFunction?: number[];
  transitionDuration?: number;
  delay?: number;
  transitionDurationVar?: VariableData;
  delayVar?: VariableData;
}

export interface AppearBehavior {
  trigger?: AppearBehaviorTrigger;
  direction?: RelativeDirection;
  otherLayer?: GUID;
  enterTransition?: BehaviorTransition;
  enterState?: NodeChange;
  exitTransition?: BehaviorTransition;
  exitState?: NodeChange;
  playsOnce?: boolean;
  playsOnceVar?: VariableData;
}

export interface HoverBehavior {
  transition?: BehaviorTransition;
  state?: NodeChange;
}

export interface PressBehavior {
  transition?: BehaviorTransition;
  state?: NodeChange;
}

export interface FocusBehavior {
  transition?: BehaviorTransition;
  state?: NodeChange;
}

export interface ScrollParallaxBehavior {
  axis?: ScrollDirection;
  speed?: number;
  relativeToPage?: boolean;
  speedVar?: VariableData;
}

export interface ScrollTransformBehavior {
  trigger?: ScrollTransformBehaviorTrigger;
  otherLayer?: GUID;
  transition?: BehaviorTransition;
  fromState?: NodeChange;
  toState?: NodeChange;
  playsOnce?: boolean;
  playsOnceVar?: boolean;
  playsOnceVar2?: VariableData;
}

export interface CursorBehavior {
  hotspotX?: number;
  hotspotY?: number;
  cursorGuid?: GUID;
}

export interface MarqueeBehavior {
  direction?: RelativeDirection;
  speed?: number;
  shouldLoopInfinitely?: boolean;
  speedVar?: VariableData;
  shouldLoopInfinitelyVar?: VariableData;
  pauseOnHover?: VariableData;
}

export interface CodeBehavior {
  codeComponentId?: CodeComponentId;
  componentPropAssignments?: ComponentPropAssignment[];
}

export interface ClientRenderedMetadata {
  loadID?: string;
  trackingSessionId?: string;
  trackingSessionSequenceId?: number;
  reconnectID?: string;
}

export interface LinkBehavior {
  type?: LinkBehaviorType;
  url?: string;
  page?: GUID;
  openInNewWindow?: boolean;
}

export interface VariableIdOrVariableOverrideId {
  variableId?: VariableID;
  variableOverrideId?: VariableOverrideId;
}

export interface IndexFontVariationAxis {
  tag: string;
  name: string;
  min: number;
  max: number;
  defaultValue: number;
}

export interface IndexFontVariationAxisValue {
  tag: string;
  value: number;
}

export interface IndexFontStyle {
  name?: string;
  postscript?: string;
  weight?: number;
  italic?: boolean;
  stretch?: number;
  variationAxisValues?: IndexFontVariationAxisValue[];
}

export interface IndexFontFile {
  filename?: string;
  version?: number;
  family?: string;
  styles?: IndexFontStyle[];
  variationAxes?: IndexFontVariationAxis[];
  useFontOpticalSize?: boolean;
}

export interface IndexFamilyRename {
  oldFamily: string;
  newFamily: string;
}

export interface IndexStyleRename {
  oldStyle: string;
  newStyle: string;
}

export interface IndexFamilyStylesRename {
  familyName: string;
  styleRenames: IndexStyleRename[];
}

export interface IndexRenames {
  family: IndexFamilyRename[];
  style: IndexFamilyStylesRename[];
}

export interface IndexEmojiSequence {
  codepoints: number[];
}

export interface IndexEmojis {
  revision: number;
  sizes: number[];
  sequences: IndexEmojiSequence[];
}

export interface FontIndex {
  schemaVersion?: number;
  files?: IndexFontFile[];
  renames?: IndexRenames;
  emojis?: IndexEmojis;
}

export interface SlideThemeData {
  themeID?: ThemeID;
  version?: string;
}

export interface NodeChatMessage {
  id?: GUID;
  type?: NodeChatMessageType;
  userId?: string;
  textContent?: string;
  sentAt?: number;
  toolCalls?: NodeChatToolCall[];
  toolResults?: NodeChatToolResult[];
  sentAt64?: bigint;
}

export interface NodeChatToolCall {
  toolCallId?: string;
  toolName?: string;
  argsJson?: string;
}

export interface NodeChatToolResult {
  toolCallId?: string;
  toolName?: string;
  resultJson?: string;
}

export interface NodeChatExchange {
  node?: GUID;
  messages?: NodeChatMessage[];
  isTyping?: boolean;
  fileUpdates?: FileUpdate[];
}

export interface NodeChatCompressionState {
  startIndex?: number;
  summary?: string;
}

export interface FileUpdate {
  name?: string;
  contents?: string;
}

export interface AIChatContentPart {
  type?: AIChatContentPartType;
  value?: AIChatContentPartAnyValue;
}

export interface AIChatContentPartAnyValue {
  textValue?: string;
  selectedNodeIds?: string[];
}

export interface AIChatMessage {
  createdAtMs?: number;
  role?: AIChatMessageRole;
  content?: AIChatContentPart[];
  clientId?: string;
  createdAtMs64?: bigint;
}

export interface AIChatThread {
  messages?: AIChatMessage[];
}

export interface CooperTemplateData {
  type?: CooperTemplateType;
}

export interface ImageImportMap {
  imports?: ImageImport[];
}

export interface ImageImport {
  name?: string;
  image?: Image;
}

export interface BezierHandles {
  p1x?: number;
  p1y?: number;
  p2x?: number;
  p2y?: number;
}

export interface Schema {
  MessageType: any;
  Axis: any;
  Access: any;
  NodePhase: any;
  WindingRule: any;
  NodeType: any;
  ShapeWithTextType: any;
  BlendMode: any;
  PaintType: any;
  ImageScaleMode: any;
  EffectType: any;
  TextCase: any;
  TextDecoration: any;
  TextDecorationStyle: any;
  LeadingTrim: any;
  NumberUnits: any;
  ConstraintType: any;
  StrokeAlign: any;
  StrokeCap: any;
  StrokeJoin: any;
  BooleanOperation: any;
  TextAlignHorizontal: any;
  TextAlignVertical: any;
  MouseCursor: any;
  VectorMirror: any;
  DashMode: any;
  ImageType: any;
  ExportConstraintType: any;
  LayoutGridType: any;
  LayoutGridPattern: any;
  TextAutoResize: any;
  TextTruncation: any;
  StyleSetType: any;
  StyleSetContentType: any;
  StackMode: any;
  StackAlign: any;
  StackCounterAlign: any;
  StackJustify: any;
  GridChildAlign: any;
  StackSize: any;
  StackPositioning: any;
  StackWrap: any;
  StackCounterAlignContent: any;
  ConnectionType: any;
  InteractionType: any;
  TransitionType: any;
  EasingType: any;
  ScrollDirection: any;
  ScrollContractedState: any;
  encodeGUID(message: GUID): Uint8Array;
  decodeGUID(buffer: Uint8Array): GUID;
  encodeColor(message: Color): Uint8Array;
  decodeColor(buffer: Uint8Array): Color;
  encodeVector(message: Vector): Uint8Array;
  decodeVector(buffer: Uint8Array): Vector;
  encodeRect(message: Rect): Uint8Array;
  decodeRect(buffer: Uint8Array): Rect;
  encodeColorStop(message: ColorStop): Uint8Array;
  decodeColorStop(buffer: Uint8Array): ColorStop;
  encodeColorStopVar(message: ColorStopVar): Uint8Array;
  decodeColorStopVar(buffer: Uint8Array): ColorStopVar;
  encodeMatrix(message: Matrix): Uint8Array;
  decodeMatrix(buffer: Uint8Array): Matrix;
  encodeParentIndex(message: ParentIndex): Uint8Array;
  decodeParentIndex(buffer: Uint8Array): ParentIndex;
  encodeNumber(message: Number): Uint8Array;
  decodeNumber(buffer: Uint8Array): Number;
  encodeFontName(message: FontName): Uint8Array;
  decodeFontName(buffer: Uint8Array): FontName;
  FontVariantNumericFigure: any;
  FontVariantNumericSpacing: any;
  FontVariantNumericFraction: any;
  FontVariantCaps: any;
  FontVariantPosition: any;
  FontStyle: any;
  SemanticWeight: any;
  SemanticItalic: any;
  CodeSnapshotState: any;
  CodeObjectType: any;
  LockMode: any;
  OpenTypeFeature: any;
  encodeExportConstraint(message: ExportConstraint): Uint8Array;
  decodeExportConstraint(buffer: Uint8Array): ExportConstraint;
  encodeGUIDMapping(message: GUIDMapping): Uint8Array;
  decodeGUIDMapping(buffer: Uint8Array): GUIDMapping;
  encodeBlob(message: Blob): Uint8Array;
  decodeBlob(buffer: Uint8Array): Blob;
  encodeImage(message: Image): Uint8Array;
  decodeImage(buffer: Uint8Array): Image;
  encodeVideo(message: Video): Uint8Array;
  decodeVideo(buffer: Uint8Array): Video;
  encodePasteSource(message: PasteSource): Uint8Array;
  decodePasteSource(buffer: Uint8Array): PasteSource;
  encodeFilterColorAdjust(message: FilterColorAdjust): Uint8Array;
  decodeFilterColorAdjust(buffer: Uint8Array): FilterColorAdjust;
  encodePaintFilterMessage(message: PaintFilterMessage): Uint8Array;
  decodePaintFilterMessage(buffer: Uint8Array): PaintFilterMessage;
  encodePaint(message: Paint): Uint8Array;
  decodePaint(buffer: Uint8Array): Paint;
  NoiseType: any;
  PatternTileType: any;
  PatternAlignment: any;
  encodeFontMetaData(message: FontMetaData): Uint8Array;
  decodeFontMetaData(buffer: Uint8Array): FontMetaData;
  encodeFontVariation(message: FontVariation): Uint8Array;
  decodeFontVariation(buffer: Uint8Array): FontVariation;
  encodeTextData(message: TextData): Uint8Array;
  decodeTextData(buffer: Uint8Array): TextData;
  encodeDerivedTextData(message: DerivedTextData): Uint8Array;
  decodeDerivedTextData(buffer: Uint8Array): DerivedTextData;
  encodeHyperlinkBox(message: HyperlinkBox): Uint8Array;
  decodeHyperlinkBox(buffer: Uint8Array): HyperlinkBox;
  encodeMentionBox(message: MentionBox): Uint8Array;
  decodeMentionBox(buffer: Uint8Array): MentionBox;
  encodeBaseline(message: Baseline): Uint8Array;
  decodeBaseline(buffer: Uint8Array): Baseline;
  encodeGlyph(message: Glyph): Uint8Array;
  decodeGlyph(buffer: Uint8Array): Glyph;
  encodeDecoration(message: Decoration): Uint8Array;
  decodeDecoration(buffer: Uint8Array): Decoration;
  encodeBlockquote(message: Blockquote): Uint8Array;
  decodeBlockquote(buffer: Uint8Array): Blockquote;
  encodeVectorData(message: VectorData): Uint8Array;
  decodeVectorData(buffer: Uint8Array): VectorData;
  encodeTextPathStart(message: TextPathStart): Uint8Array;
  decodeTextPathStart(buffer: Uint8Array): TextPathStart;
  encodeGUIDPath(message: GUIDPath): Uint8Array;
  decodeGUIDPath(buffer: Uint8Array): GUIDPath;
  encodeSymbolData(message: SymbolData): Uint8Array;
  decodeSymbolData(buffer: Uint8Array): SymbolData;
  encodeGUIDPathMapping(message: GUIDPathMapping): Uint8Array;
  decodeGUIDPathMapping(buffer: Uint8Array): GUIDPathMapping;
  encodeDerivedBreakpointData(message: DerivedBreakpointData): Uint8Array;
  decodeDerivedBreakpointData(buffer: Uint8Array): DerivedBreakpointData;
  encodeNodeGenerationData(message: NodeGenerationData): Uint8Array;
  decodeNodeGenerationData(buffer: Uint8Array): NodeGenerationData;
  encodeDerivedImmutableFrameData(message: DerivedImmutableFrameData): Uint8Array;
  decodeDerivedImmutableFrameData(buffer: Uint8Array): DerivedImmutableFrameData;
  encodeJsxData(message: JsxData): Uint8Array;
  decodeJsxData(buffer: Uint8Array): JsxData;
  encodeDerivedJsxData(message: DerivedJsxData): Uint8Array;
  decodeDerivedJsxData(buffer: Uint8Array): DerivedJsxData;
  encodeAssetIdMap(message: AssetIdMap): Uint8Array;
  decodeAssetIdMap(buffer: Uint8Array): AssetIdMap;
  encodeAssetIdEntry(message: AssetIdEntry): Uint8Array;
  decodeAssetIdEntry(buffer: Uint8Array): AssetIdEntry;
  encodeAssetRef(message: AssetRef): Uint8Array;
  decodeAssetRef(buffer: Uint8Array): AssetRef;
  encodeAssetId(message: AssetId): Uint8Array;
  decodeAssetId(buffer: Uint8Array): AssetId;
  encodeStateGroupId(message: StateGroupId): Uint8Array;
  decodeStateGroupId(buffer: Uint8Array): StateGroupId;
  encodeStyleId(message: StyleId): Uint8Array;
  decodeStyleId(buffer: Uint8Array): StyleId;
  encodeSymbolId(message: SymbolId): Uint8Array;
  decodeSymbolId(buffer: Uint8Array): SymbolId;
  encodeVariableID(message: VariableID): Uint8Array;
  decodeVariableID(buffer: Uint8Array): VariableID;
  encodeVariableOverrideId(message: VariableOverrideId): Uint8Array;
  decodeVariableOverrideId(buffer: Uint8Array): VariableOverrideId;
  encodeVariableSetID(message: VariableSetID): Uint8Array;
  decodeVariableSetID(buffer: Uint8Array): VariableSetID;
  encodeModuleId(message: ModuleId): Uint8Array;
  decodeModuleId(buffer: Uint8Array): ModuleId;
  encodeResponsiveSetId(message: ResponsiveSetId): Uint8Array;
  decodeResponsiveSetId(buffer: Uint8Array): ResponsiveSetId;
  encodeThemeID(message: ThemeID): Uint8Array;
  decodeThemeID(buffer: Uint8Array): ThemeID;
  encodeCodeLibraryId(message: CodeLibraryId): Uint8Array;
  decodeCodeLibraryId(buffer: Uint8Array): CodeLibraryId;
  encodeCodeFileId(message: CodeFileId): Uint8Array;
  decodeCodeFileId(buffer: Uint8Array): CodeFileId;
  encodeCodeComponentId(message: CodeComponentId): Uint8Array;
  decodeCodeComponentId(buffer: Uint8Array): CodeComponentId;
  encodeCanvasNodeId(message: CanvasNodeId): Uint8Array;
  decodeCanvasNodeId(buffer: Uint8Array): CanvasNodeId;
  encodeIndexRange(message: IndexRange): Uint8Array;
  decodeIndexRange(buffer: Uint8Array): IndexRange;
  encodeCollaborativeTextOpID(message: CollaborativeTextOpID): Uint8Array;
  decodeCollaborativeTextOpID(buffer: Uint8Array): CollaborativeTextOpID;
  CollaborativeTextOpType: any;
  encodeCollaborativeTextStrippedOpRunWithIDs(message: CollaborativeTextStrippedOpRunWithIDs): Uint8Array;
  decodeCollaborativeTextStrippedOpRunWithIDs(buffer: Uint8Array): CollaborativeTextStrippedOpRunWithIDs;
  encodeCollaborativeTextStrippedOpRunWithLoc(message: CollaborativeTextStrippedOpRunWithLoc): Uint8Array;
  decodeCollaborativeTextStrippedOpRunWithLoc(buffer: Uint8Array): CollaborativeTextStrippedOpRunWithLoc;
  encodeCollaborativeTextOpRun(message: CollaborativeTextOpRun): Uint8Array;
  decodeCollaborativeTextOpRun(buffer: Uint8Array): CollaborativeTextOpRun;
  encodeCollaborativePlainText(message: CollaborativePlainText): Uint8Array;
  decodeCollaborativePlainText(buffer: Uint8Array): CollaborativePlainText;
  encodeCollaborativeTextSelection(message: CollaborativeTextSelection): Uint8Array;
  decodeCollaborativeTextSelection(buffer: Uint8Array): CollaborativeTextSelection;
  encodeResponsiveTextStyleVariant(message: ResponsiveTextStyleVariant): Uint8Array;
  decodeResponsiveTextStyleVariant(buffer: Uint8Array): ResponsiveTextStyleVariant;
  FlappType: any;
  encodeSlideThemeProps(message: SlideThemeProps): Uint8Array;
  decodeSlideThemeProps(buffer: Uint8Array): SlideThemeProps;
  encodeSlideThemeMap(message: SlideThemeMap): Uint8Array;
  decodeSlideThemeMap(buffer: Uint8Array): SlideThemeMap;
  encodeSlideThemeMapEntry(message: SlideThemeMapEntry): Uint8Array;
  decodeSlideThemeMapEntry(buffer: Uint8Array): SlideThemeMapEntry;
  encodeSharedSymbolReference(message: SharedSymbolReference): Uint8Array;
  decodeSharedSymbolReference(buffer: Uint8Array): SharedSymbolReference;
  encodeSharedComponentMasterData(message: SharedComponentMasterData): Uint8Array;
  decodeSharedComponentMasterData(buffer: Uint8Array): SharedComponentMasterData;
  encodeInstanceOverrideStash(message: InstanceOverrideStash): Uint8Array;
  decodeInstanceOverrideStash(buffer: Uint8Array): InstanceOverrideStash;
  encodeInstanceOverrideStashV2(message: InstanceOverrideStashV2): Uint8Array;
  decodeInstanceOverrideStashV2(buffer: Uint8Array): InstanceOverrideStashV2;
  encodeImportedCodeFileEntry(message: ImportedCodeFileEntry): Uint8Array;
  decodeImportedCodeFileEntry(buffer: Uint8Array): ImportedCodeFileEntry;
  encodeImportedCodeFiles(message: ImportedCodeFiles): Uint8Array;
  decodeImportedCodeFiles(buffer: Uint8Array): ImportedCodeFiles;
  BlurOpType: any;
  RepeatType: any;
  UnitType: any;
  RepeatOrder: any;
  EffectAxis: any;
  encodeEffect(message: Effect): Uint8Array;
  decodeEffect(buffer: Uint8Array): Effect;
  TransformModifierType: any;
  encodeTransformModifier(message: TransformModifier): Uint8Array;
  decodeTransformModifier(buffer: Uint8Array): TransformModifier;
  encodeTransitionInfo(message: TransitionInfo): Uint8Array;
  decodeTransitionInfo(buffer: Uint8Array): TransitionInfo;
  PrototypeDeviceType: any;
  DeviceRotation: any;
  encodePrototypeDevice(message: PrototypeDevice): Uint8Array;
  decodePrototypeDevice(buffer: Uint8Array): PrototypeDevice;
  OverlayPositionType: any;
  OverlayBackgroundInteraction: any;
  OverlayBackgroundType: any;
  encodeOverlayBackgroundAppearance(message: OverlayBackgroundAppearance): Uint8Array;
  decodeOverlayBackgroundAppearance(buffer: Uint8Array): OverlayBackgroundAppearance;
  NavigationType: any;
  ExportColorProfile: any;
  encodeExportSettings(message: ExportSettings): Uint8Array;
  decodeExportSettings(buffer: Uint8Array): ExportSettings;
  ExportSVGIDMode: any;
  encodeLayoutGrid(message: LayoutGrid): Uint8Array;
  decodeLayoutGrid(buffer: Uint8Array): LayoutGrid;
  encodeGuide(message: Guide): Uint8Array;
  decodeGuide(buffer: Uint8Array): Guide;
  encodePath(message: Path): Uint8Array;
  decodePath(buffer: Uint8Array): Path;
  StyleType: any;
  BrushOrientation: any;
  BrushType: any;
  encodeDynamicStrokeSettings(message: DynamicStrokeSettings): Uint8Array;
  decodeDynamicStrokeSettings(buffer: Uint8Array): DynamicStrokeSettings;
  encodeScatterStrokeSettings(message: ScatterStrokeSettings): Uint8Array;
  decodeScatterStrokeSettings(buffer: Uint8Array): ScatterStrokeSettings;
  encodeStretchStrokeSettings(message: StretchStrokeSettings): Uint8Array;
  decodeStretchStrokeSettings(buffer: Uint8Array): StretchStrokeSettings;
  encodeVariableWidthPoint(message: VariableWidthPoint): Uint8Array;
  decodeVariableWidthPoint(buffer: Uint8Array): VariableWidthPoint;
  encodeSharedStyleReference(message: SharedStyleReference): Uint8Array;
  decodeSharedStyleReference(buffer: Uint8Array): SharedStyleReference;
  encodeSharedStyleMasterData(message: SharedStyleMasterData): Uint8Array;
  decodeSharedStyleMasterData(buffer: Uint8Array): SharedStyleMasterData;
  ScrollBehavior: any;
  encodeArcData(message: ArcData): Uint8Array;
  decodeArcData(buffer: Uint8Array): ArcData;
  encodeSymbolLink(message: SymbolLink): Uint8Array;
  decodeSymbolLink(buffer: Uint8Array): SymbolLink;
  encodePluginData(message: PluginData): Uint8Array;
  decodePluginData(buffer: Uint8Array): PluginData;
  encodePluginRelaunchData(message: PluginRelaunchData): Uint8Array;
  decodePluginRelaunchData(buffer: Uint8Array): PluginRelaunchData;
  encodeMultiplayerFieldVersion(message: MultiplayerFieldVersion): Uint8Array;
  decodeMultiplayerFieldVersion(buffer: Uint8Array): MultiplayerFieldVersion;
  ConnectorMagnet: any;
  encodeConnectorEndpoint(message: ConnectorEndpoint): Uint8Array;
  decodeConnectorEndpoint(buffer: Uint8Array): ConnectorEndpoint;
  encodeConnectorControlPoint(message: ConnectorControlPoint): Uint8Array;
  decodeConnectorControlPoint(buffer: Uint8Array): ConnectorControlPoint;
  ConnectorTextSection: any;
  ConnectorOffAxisOffset: any;
  encodeConnectorTextMidpoint(message: ConnectorTextMidpoint): Uint8Array;
  decodeConnectorTextMidpoint(buffer: Uint8Array): ConnectorTextMidpoint;
  ConnectorLineStyle: any;
  ConnectorType: any;
  AnnotationPropertyType: any;
  encodeAnnotationProperty(message: AnnotationProperty): Uint8Array;
  decodeAnnotationProperty(buffer: Uint8Array): AnnotationProperty;
  AnnotationCategoryPreset: any;
  AnnotationCategoryColor: any;
  encodeAnnotationCategoryCustom(message: AnnotationCategoryCustom): Uint8Array;
  decodeAnnotationCategoryCustom(buffer: Uint8Array): AnnotationCategoryCustom;
  encodeAnnotationCategory(message: AnnotationCategory): Uint8Array;
  decodeAnnotationCategory(buffer: Uint8Array): AnnotationCategory;
  encodeAnnotationCategories(message: AnnotationCategories): Uint8Array;
  decodeAnnotationCategories(buffer: Uint8Array): AnnotationCategories;
  encodeAnnotation(message: Annotation): Uint8Array;
  decodeAnnotation(buffer: Uint8Array): Annotation;
  AnnotationMeasurementNodeSide: any;
  encodeAnnotationMeasurement(message: AnnotationMeasurement): Uint8Array;
  decodeAnnotationMeasurement(buffer: Uint8Array): AnnotationMeasurement;
  encodeLibraryMoveInfo(message: LibraryMoveInfo): Uint8Array;
  decodeLibraryMoveInfo(buffer: Uint8Array): LibraryMoveInfo;
  encodeLibraryMoveHistoryItem(message: LibraryMoveHistoryItem): Uint8Array;
  decodeLibraryMoveHistoryItem(buffer: Uint8Array): LibraryMoveHistoryItem;
  encodeDeveloperRelatedLink(message: DeveloperRelatedLink): Uint8Array;
  decodeDeveloperRelatedLink(buffer: Uint8Array): DeveloperRelatedLink;
  encodeWidgetPointer(message: WidgetPointer): Uint8Array;
  decodeWidgetPointer(buffer: Uint8Array): WidgetPointer;
  encodeEditInfo(message: EditInfo): Uint8Array;
  decodeEditInfo(buffer: Uint8Array): EditInfo;
  EditorType: any;
  MaskType: any;
  ModuleType: any;
  SectionStatus: any;
  encodeSectionStatusInfo(message: SectionStatusInfo): Uint8Array;
  decodeSectionStatusInfo(buffer: Uint8Array): SectionStatusInfo;
  encodeBuzzApprovalRequestInfo(message: BuzzApprovalRequestInfo): Uint8Array;
  decodeBuzzApprovalRequestInfo(buffer: Uint8Array): BuzzApprovalRequestInfo;
  encodeBuzzApprovalRequests(message: BuzzApprovalRequests): Uint8Array;
  decodeBuzzApprovalRequests(buffer: Uint8Array): BuzzApprovalRequests;
  BuzzApprovalNodeStatus: any;
  encodeBuzzApprovalNodeStatusInfo(message: BuzzApprovalNodeStatusInfo): Uint8Array;
  decodeBuzzApprovalNodeStatusInfo(buffer: Uint8Array): BuzzApprovalNodeStatusInfo;
  encodeNodeChange(message: NodeChange): Uint8Array;
  decodeNodeChange(buffer: Uint8Array): NodeChange;
  encodeCodeSnapshot(message: CodeSnapshot): Uint8Array;
  decodeCodeSnapshot(buffer: Uint8Array): CodeSnapshot;
  encodeCodeBehaviorData(message: CodeBehaviorData): Uint8Array;
  decodeCodeBehaviorData(buffer: Uint8Array): CodeBehaviorData;
  encodeCodeExample(message: CodeExample): Uint8Array;
  decodeCodeExample(buffer: Uint8Array): CodeExample;
  encodeUsedMakeLibrary(message: UsedMakeLibrary): Uint8Array;
  decodeUsedMakeLibrary(buffer: Uint8Array): UsedMakeLibrary;
  encodeCookieBannerText(message: CookieBannerText): Uint8Array;
  decodeCookieBannerText(buffer: Uint8Array): CookieBannerText;
  encodeCookieBannerSettings(message: CookieBannerSettings): Uint8Array;
  decodeCookieBannerSettings(buffer: Uint8Array): CookieBannerSettings;
  CookieBannerComponentType: any;
  TriggerComponentType: any;
  CookieXAlignment: any;
  CookieYAlignment: any;
  encodeResponsiveSetSettings(message: ResponsiveSetSettings): Uint8Array;
  decodeResponsiveSetSettings(buffer: Uint8Array): ResponsiveSetSettings;
  ResponsiveScalingMode: any;
  encodeCMSSelector(message: CMSSelector): Uint8Array;
  decodeCMSSelector(buffer: Uint8Array): CMSSelector;
  encodeCMSFilterCritera(message: CMSFilterCritera): Uint8Array;
  decodeCMSFilterCritera(buffer: Uint8Array): CMSFilterCritera;
  CMSFilterCriteriaMatchType: any;
  encodeCMSSelectorFilter(message: CMSSelectorFilter): Uint8Array;
  decodeCMSSelectorFilter(buffer: Uint8Array): CMSSelectorFilter;
  CMSSelectorFilterOperator: any;
  encodeCMSSelectorSort(message: CMSSelectorSort): Uint8Array;
  decodeCMSSelectorSort(buffer: Uint8Array): CMSSelectorSort;
  CMSFieldOrderBy: any;
  encodeCMSConsumptionMap(message: CMSConsumptionMap): Uint8Array;
  decodeCMSConsumptionMap(buffer: Uint8Array): CMSConsumptionMap;
  encodeCMSConsumptionMapEntry(message: CMSConsumptionMapEntry): Uint8Array;
  decodeCMSConsumptionMapEntry(buffer: Uint8Array): CMSConsumptionMapEntry;
  CMSConsumptionField: any;
  encodeCMSRichTextStyleMap(message: CMSRichTextStyleMap): Uint8Array;
  decodeCMSRichTextStyleMap(buffer: Uint8Array): CMSRichTextStyleMap;
  encodeCMSRichTextStyleEntry(message: CMSRichTextStyleEntry): Uint8Array;
  decodeCMSRichTextStyleEntry(buffer: Uint8Array): CMSRichTextStyleEntry;
  CMSRichTextStyleClass: any;
  encodeCMSRichTextDescriptor(message: CMSRichTextDescriptor): Uint8Array;
  decodeCMSRichTextDescriptor(buffer: Uint8Array): CMSRichTextDescriptor;
  encodeInheritedVariablesData(message: InheritedVariablesData): Uint8Array;
  decodeInheritedVariablesData(buffer: Uint8Array): InheritedVariablesData;
  encodeInheritedVariableEntry(message: InheritedVariableEntry): Uint8Array;
  decodeInheritedVariableEntry(buffer: Uint8Array): InheritedVariableEntry;
  encodeHubFileAttribution(message: HubFileAttribution): Uint8Array;
  decodeHubFileAttribution(buffer: Uint8Array): HubFileAttribution;
  encodeManagedStringData(message: ManagedStringData): Uint8Array;
  decodeManagedStringData(buffer: Uint8Array): ManagedStringData;
  ManagedStringContentSchema: any;
  ManagedStringNodeType: any;
  encodeManagedStringNode(message: ManagedStringNode): Uint8Array;
  decodeManagedStringNode(buffer: Uint8Array): ManagedStringNode;
  encodeManagedStringTextNodeData(message: ManagedStringTextNodeData): Uint8Array;
  decodeManagedStringTextNodeData(buffer: Uint8Array): ManagedStringTextNodeData;
  encodeManagedStringConcatenateAstNodeData(message: ManagedStringConcatenateAstNodeData): Uint8Array;
  decodeManagedStringConcatenateAstNodeData(buffer: Uint8Array): ManagedStringConcatenateAstNodeData;
  ManagedStringPluralType: any;
  encodeManagedStringPluralAstNodeData(message: ManagedStringPluralAstNodeData): Uint8Array;
  decodeManagedStringPluralAstNodeData(buffer: Uint8Array): ManagedStringPluralAstNodeData;
  encodeManagedStringPluralTypeMapEntry(message: ManagedStringPluralTypeMapEntry): Uint8Array;
  decodeManagedStringPluralTypeMapEntry(buffer: Uint8Array): ManagedStringPluralTypeMapEntry;
  ManagedStringFormatType: any;
  encodeManagedStringPlaceholderAstNodeData(message: ManagedStringPlaceholderAstNodeData): Uint8Array;
  decodeManagedStringPlaceholderAstNodeData(buffer: Uint8Array): ManagedStringPlaceholderAstNodeData;
  encodeCooperRevertData(message: CooperRevertData): Uint8Array;
  decodeCooperRevertData(buffer: Uint8Array): CooperRevertData;
  encodeVideoPlayback(message: VideoPlayback): Uint8Array;
  decodeVideoPlayback(buffer: Uint8Array): VideoPlayback;
  MediaAction: any;
  encodeWidgetHoverStyle(message: WidgetHoverStyle): Uint8Array;
  decodeWidgetHoverStyle(buffer: Uint8Array): WidgetHoverStyle;
  encodeWidgetDerivedSubtreeCursor(message: WidgetDerivedSubtreeCursor): Uint8Array;
  decodeWidgetDerivedSubtreeCursor(buffer: Uint8Array): WidgetDerivedSubtreeCursor;
  encodeMultiplayerMap(message: MultiplayerMap): Uint8Array;
  decodeMultiplayerMap(buffer: Uint8Array): MultiplayerMap;
  encodeMultiplayerMapEntry(message: MultiplayerMapEntry): Uint8Array;
  decodeMultiplayerMapEntry(buffer: Uint8Array): MultiplayerMapEntry;
  encodeVariableDataMap(message: VariableDataMap): Uint8Array;
  decodeVariableDataMap(buffer: Uint8Array): VariableDataMap;
  encodeVariableDataMapEntry(message: VariableDataMapEntry): Uint8Array;
  decodeVariableDataMapEntry(buffer: Uint8Array): VariableDataMapEntry;
  VariableField: any;
  encodeVariableModeBySetMap(message: VariableModeBySetMap): Uint8Array;
  decodeVariableModeBySetMap(buffer: Uint8Array): VariableModeBySetMap;
  encodeVariableModeBySetMapEntry(message: VariableModeBySetMapEntry): Uint8Array;
  decodeVariableModeBySetMapEntry(buffer: Uint8Array): VariableModeBySetMapEntry;
  encodeCodeSyntaxMap(message: CodeSyntaxMap): Uint8Array;
  decodeCodeSyntaxMap(buffer: Uint8Array): CodeSyntaxMap;
  encodeCodeSyntaxMapEntry(message: CodeSyntaxMapEntry): Uint8Array;
  decodeCodeSyntaxMapEntry(buffer: Uint8Array): CodeSyntaxMapEntry;
  encodeTableRowColumnPositionMap(message: TableRowColumnPositionMap): Uint8Array;
  decodeTableRowColumnPositionMap(buffer: Uint8Array): TableRowColumnPositionMap;
  encodeTableRowColumnPositionMapEntry(message: TableRowColumnPositionMapEntry): Uint8Array;
  decodeTableRowColumnPositionMapEntry(buffer: Uint8Array): TableRowColumnPositionMapEntry;
  encodeGUIDPositionMap(message: GUIDPositionMap): Uint8Array;
  decodeGUIDPositionMap(buffer: Uint8Array): GUIDPositionMap;
  encodeGUIDPositionMapEntry(message: GUIDPositionMapEntry): Uint8Array;
  decodeGUIDPositionMapEntry(buffer: Uint8Array): GUIDPositionMapEntry;
  encodeGUIDGridTrackSizeMap(message: GUIDGridTrackSizeMap): Uint8Array;
  decodeGUIDGridTrackSizeMap(buffer: Uint8Array): GUIDGridTrackSizeMap;
  encodeGUIDGridTrackSizeMapEntry(message: GUIDGridTrackSizeMapEntry): Uint8Array;
  decodeGUIDGridTrackSizeMapEntry(buffer: Uint8Array): GUIDGridTrackSizeMapEntry;
  encodeObjectAnimationList(message: ObjectAnimationList): Uint8Array;
  decodeObjectAnimationList(buffer: Uint8Array): ObjectAnimationList;
  encodeObjectAnimationListItem(message: ObjectAnimationListItem): Uint8Array;
  decodeObjectAnimationListItem(buffer: Uint8Array): ObjectAnimationListItem;
  encodeGridTrackSize(message: GridTrackSize): Uint8Array;
  decodeGridTrackSize(buffer: Uint8Array): GridTrackSize;
  encodeGridTrackSizingFunction(message: GridTrackSizingFunction): Uint8Array;
  decodeGridTrackSizingFunction(buffer: Uint8Array): GridTrackSizingFunction;
  GridTrackSizingType: any;
  encodeTableRowColumnSizeMap(message: TableRowColumnSizeMap): Uint8Array;
  decodeTableRowColumnSizeMap(buffer: Uint8Array): TableRowColumnSizeMap;
  encodeTableRowColumnSizeMapEntry(message: TableRowColumnSizeMapEntry): Uint8Array;
  decodeTableRowColumnSizeMapEntry(buffer: Uint8Array): TableRowColumnSizeMapEntry;
  encodeAgendaPositionMap(message: AgendaPositionMap): Uint8Array;
  decodeAgendaPositionMap(buffer: Uint8Array): AgendaPositionMap;
  encodeAgendaPositionMapEntry(message: AgendaPositionMapEntry): Uint8Array;
  decodeAgendaPositionMapEntry(buffer: Uint8Array): AgendaPositionMapEntry;
  AgendaItemType: any;
  encodeAgendaMetadataMap(message: AgendaMetadataMap): Uint8Array;
  decodeAgendaMetadataMap(buffer: Uint8Array): AgendaMetadataMap;
  encodeAgendaMetadataMapEntry(message: AgendaMetadataMapEntry): Uint8Array;
  decodeAgendaMetadataMapEntry(buffer: Uint8Array): AgendaMetadataMapEntry;
  encodeAgendaMetadata(message: AgendaMetadata): Uint8Array;
  decodeAgendaMetadata(buffer: Uint8Array): AgendaMetadata;
  encodeAgendaTimerInfo(message: AgendaTimerInfo): Uint8Array;
  decodeAgendaTimerInfo(buffer: Uint8Array): AgendaTimerInfo;
  encodeAgendaVoteInfo(message: AgendaVoteInfo): Uint8Array;
  decodeAgendaVoteInfo(buffer: Uint8Array): AgendaVoteInfo;
  encodeAgendaMusicInfo(message: AgendaMusicInfo): Uint8Array;
  decodeAgendaMusicInfo(buffer: Uint8Array): AgendaMusicInfo;
  DiagramLayoutRuleType: any;
  encodeDiagramParentIndex(message: DiagramParentIndex): Uint8Array;
  decodeDiagramParentIndex(buffer: Uint8Array): DiagramParentIndex;
  DiagramLayoutPaused: any;
  encodeComponentPropRef(message: ComponentPropRef): Uint8Array;
  decodeComponentPropRef(buffer: Uint8Array): ComponentPropRef;
  ComponentPropNodeField: any;
  encodeComponentPropAssignment(message: ComponentPropAssignment): Uint8Array;
  decodeComponentPropAssignment(buffer: Uint8Array): ComponentPropAssignment;
  encodeComponentPropDef(message: ComponentPropDef): Uint8Array;
  decodeComponentPropDef(buffer: Uint8Array): ComponentPropDef;
  encodeComponentPropValue(message: ComponentPropValue): Uint8Array;
  decodeComponentPropValue(buffer: Uint8Array): ComponentPropValue;
  ComponentPropType: any;
  encodeComponentPropPreferredValues(message: ComponentPropPreferredValues): Uint8Array;
  decodeComponentPropPreferredValues(buffer: Uint8Array): ComponentPropPreferredValues;
  encodeParameterConfig(message: ParameterConfig): Uint8Array;
  decodeParameterConfig(buffer: Uint8Array): ParameterConfig;
  ParameterConfigControl: any;
  encodeInputConfig(message: InputConfig): Uint8Array;
  decodeInputConfig(buffer: Uint8Array): InputConfig;
  encodeSliderConfig(message: SliderConfig): Uint8Array;
  decodeSliderConfig(buffer: Uint8Array): SliderConfig;
  encodeSelectOption(message: SelectOption): Uint8Array;
  decodeSelectOption(buffer: Uint8Array): SelectOption;
  encodeSelectConfig(message: SelectConfig): Uint8Array;
  decodeSelectConfig(buffer: Uint8Array): SelectConfig;
  encodeNumberPropConfig(message: NumberPropConfig): Uint8Array;
  decodeNumberPropConfig(buffer: Uint8Array): NumberPropConfig;
  encodeInstanceSwapPreferredValue(message: InstanceSwapPreferredValue): Uint8Array;
  decodeInstanceSwapPreferredValue(buffer: Uint8Array): InstanceSwapPreferredValue;
  InstanceSwapPreferredValueType: any;
  WidgetEvent: any;
  WidgetInputBehavior: any;
  encodeWidgetMetadata(message: WidgetMetadata): Uint8Array;
  decodeWidgetMetadata(buffer: Uint8Array): WidgetMetadata;
  WidgetPropertyMenuItemType: any;
  encodeWidgetPropertyMenuSelectorOption(message: WidgetPropertyMenuSelectorOption): Uint8Array;
  decodeWidgetPropertyMenuSelectorOption(buffer: Uint8Array): WidgetPropertyMenuSelectorOption;
  WidgetInputTextNodeType: any;
  encodeWidgetPropertyMenuItem(message: WidgetPropertyMenuItem): Uint8Array;
  decodeWidgetPropertyMenuItem(buffer: Uint8Array): WidgetPropertyMenuItem;
  CodeBlockLanguage: any;
  CodeBlockTheme: any;
  InternalEnumForTest: any;
  encodeInternalDataForTest(message: InternalDataForTest): Uint8Array;
  decodeInternalDataForTest(buffer: Uint8Array): InternalDataForTest;
  encodeStateGroupPropertyValueOrder(message: StateGroupPropertyValueOrder): Uint8Array;
  decodeStateGroupPropertyValueOrder(buffer: Uint8Array): StateGroupPropertyValueOrder;
  encodeVariantPropSpec(message: VariantPropSpec): Uint8Array;
  decodeVariantPropSpec(buffer: Uint8Array): VariantPropSpec;
  encodeTextListData(message: TextListData): Uint8Array;
  decodeTextListData(buffer: Uint8Array): TextListData;
  BulletType: any;
  encodeTextLineData(message: TextLineData): Uint8Array;
  decodeTextLineData(buffer: Uint8Array): TextLineData;
  encodeDerivedTextLineData(message: DerivedTextLineData): Uint8Array;
  decodeDerivedTextLineData(buffer: Uint8Array): DerivedTextLineData;
  LineType: any;
  SourceDirectionality: any;
  Directionality: any;
  DirectionalityIntent: any;
  encodePrototypeInteraction(message: PrototypeInteraction): Uint8Array;
  decodePrototypeInteraction(buffer: Uint8Array): PrototypeInteraction;
  encodePrototypeEvent(message: PrototypeEvent): Uint8Array;
  decodePrototypeEvent(buffer: Uint8Array): PrototypeEvent;
  encodePrototypeVariableTarget(message: PrototypeVariableTarget): Uint8Array;
  decodePrototypeVariableTarget(buffer: Uint8Array): PrototypeVariableTarget;
  encodeConditionalActions(message: ConditionalActions): Uint8Array;
  decodeConditionalActions(buffer: Uint8Array): ConditionalActions;
  encodePrototypeAction(message: PrototypeAction): Uint8Array;
  decodePrototypeAction(buffer: Uint8Array): PrototypeAction;
  AnimationPhase: any;
  AnimationType: any;
  encodeAnimationState(message: AnimationState): Uint8Array;
  decodeAnimationState(buffer: Uint8Array): AnimationState;
  encodePrototypeStartingPoint(message: PrototypeStartingPoint): Uint8Array;
  decodePrototypeStartingPoint(buffer: Uint8Array): PrototypeStartingPoint;
  TriggerDevice: any;
  encodeKeyTrigger(message: KeyTrigger): Uint8Array;
  decodeKeyTrigger(buffer: Uint8Array): KeyTrigger;
  encodeHyperlink(message: Hyperlink): Uint8Array;
  decodeHyperlink(buffer: Uint8Array): Hyperlink;
  encodeCMSItemPageTarget(message: CMSItemPageTarget): Uint8Array;
  decodeCMSItemPageTarget(buffer: Uint8Array): CMSItemPageTarget;
  MentionSource: any;
  encodeMention(message: Mention): Uint8Array;
  decodeMention(buffer: Uint8Array): Mention;
  encodeEmbedData(message: EmbedData): Uint8Array;
  decodeEmbedData(buffer: Uint8Array): EmbedData;
  encodeStampData(message: StampData): Uint8Array;
  decodeStampData(buffer: Uint8Array): StampData;
  encodeLinkPreviewData(message: LinkPreviewData): Uint8Array;
  decodeLinkPreviewData(buffer: Uint8Array): LinkPreviewData;
  encodeViewport(message: Viewport): Uint8Array;
  decodeViewport(buffer: Uint8Array): Viewport;
  encodeMouse(message: Mouse): Uint8Array;
  decodeMouse(buffer: Uint8Array): Mouse;
  encodeClick(message: Click): Uint8Array;
  decodeClick(buffer: Uint8Array): Click;
  encodeScrollPosition(message: ScrollPosition): Uint8Array;
  decodeScrollPosition(buffer: Uint8Array): ScrollPosition;
  encodeTriggeredOverlay(message: TriggeredOverlay): Uint8Array;
  decodeTriggeredOverlay(buffer: Uint8Array): TriggeredOverlay;
  encodeTriggeredOverlayData(message: TriggeredOverlayData): Uint8Array;
  decodeTriggeredOverlayData(buffer: Uint8Array): TriggeredOverlayData;
  encodeTriggeredSetVariableActionData(message: TriggeredSetVariableActionData): Uint8Array;
  decodeTriggeredSetVariableActionData(buffer: Uint8Array): TriggeredSetVariableActionData;
  encodeTriggeredSetVariableModeActionData(message: TriggeredSetVariableModeActionData): Uint8Array;
  decodeTriggeredSetVariableModeActionData(buffer: Uint8Array): TriggeredSetVariableModeActionData;
  encodeVideoStateChangeData(message: VideoStateChangeData): Uint8Array;
  decodeVideoStateChangeData(buffer: Uint8Array): VideoStateChangeData;
  encodeEmbeddedPrototypeData(message: EmbeddedPrototypeData): Uint8Array;
  decodeEmbeddedPrototypeData(buffer: Uint8Array): EmbeddedPrototypeData;
  encodePresentedState(message: PresentedState): Uint8Array;
  decodePresentedState(buffer: Uint8Array): PresentedState;
  TransitionDirection: any;
  encodeTopLevelPlaybackChange(message: TopLevelPlaybackChange): Uint8Array;
  decodeTopLevelPlaybackChange(buffer: Uint8Array): TopLevelPlaybackChange;
  encodeInstanceStateChange(message: InstanceStateChange): Uint8Array;
  decodeInstanceStateChange(buffer: Uint8Array): InstanceStateChange;
  encodeTextCursor(message: TextCursor): Uint8Array;
  decodeTextCursor(buffer: Uint8Array): TextCursor;
  encodeTextSelection(message: TextSelection): Uint8Array;
  decodeTextSelection(buffer: Uint8Array): TextSelection;
  PlaybackChangePhase: any;
  encodePlaybackChangeKeyframe(message: PlaybackChangeKeyframe): Uint8Array;
  decodePlaybackChangeKeyframe(buffer: Uint8Array): PlaybackChangeKeyframe;
  encodeStateMapping(message: StateMapping): Uint8Array;
  decodeStateMapping(buffer: Uint8Array): StateMapping;
  encodeScrollMapping(message: ScrollMapping): Uint8Array;
  decodeScrollMapping(buffer: Uint8Array): ScrollMapping;
  encodePlaybackUpdate(message: PlaybackUpdate): Uint8Array;
  decodePlaybackUpdate(buffer: Uint8Array): PlaybackUpdate;
  encodeChatMessage(message: ChatMessage): Uint8Array;
  decodeChatMessage(buffer: Uint8Array): ChatMessage;
  encodeVoiceMetadata(message: VoiceMetadata): Uint8Array;
  decodeVoiceMetadata(buffer: Uint8Array): VoiceMetadata;
  encodeAprilFunCursor(message: AprilFunCursor): Uint8Array;
  decodeAprilFunCursor(buffer: Uint8Array): AprilFunCursor;
  encodeAprilFunFigPal(message: AprilFunFigPal): Uint8Array;
  decodeAprilFunFigPal(buffer: Uint8Array): AprilFunFigPal;
  Heartbeat: any;
  SitesViewState: any;
  DesignFullPageViewState: any;
  encodeUserChange(message: UserChange): Uint8Array;
  decodeUserChange(buffer: Uint8Array): UserChange;
  encodeInteractiveSlideElementChange(message: InteractiveSlideElementChange): Uint8Array;
  decodeInteractiveSlideElementChange(buffer: Uint8Array): InteractiveSlideElementChange;
  encodeNodeStatusChange(message: NodeStatusChange): Uint8Array;
  decodeNodeStatusChange(buffer: Uint8Array): NodeStatusChange;
  SceneGraphQueryBehavior: any;
  encodeSceneGraphQuery(message: SceneGraphQuery): Uint8Array;
  decodeSceneGraphQuery(buffer: Uint8Array): SceneGraphQuery;
  encodeNodeChangesMetadata(message: NodeChangesMetadata): Uint8Array;
  decodeNodeChangesMetadata(buffer: Uint8Array): NodeChangesMetadata;
  encodeCursorReaction(message: CursorReaction): Uint8Array;
  decodeCursorReaction(buffer: Uint8Array): CursorReaction;
  encodeTimerInfo(message: TimerInfo): Uint8Array;
  decodeTimerInfo(buffer: Uint8Array): TimerInfo;
  encodeMusicInfo(message: MusicInfo): Uint8Array;
  decodeMusicInfo(buffer: Uint8Array): MusicInfo;
  encodePresenterNomination(message: PresenterNomination): Uint8Array;
  decodePresenterNomination(buffer: Uint8Array): PresenterNomination;
  encodePresenterInfo(message: PresenterInfo): Uint8Array;
  decodePresenterInfo(buffer: Uint8Array): PresenterInfo;
  encodeClientBroadcast(message: ClientBroadcast): Uint8Array;
  decodeClientBroadcast(buffer: Uint8Array): ClientBroadcast;
  PasteAssetType: any;
  encodeMessage(message: Message): Uint8Array;
  decodeMessage(buffer: Uint8Array): Message;
  encodeEncodedOffsetsIndex(message: EncodedOffsetsIndex): Uint8Array;
  decodeEncodedOffsetsIndex(buffer: Uint8Array): EncodedOffsetsIndex;
  encodeGUIDAndEncodedOffset(message: GUIDAndEncodedOffset): Uint8Array;
  decodeGUIDAndEncodedOffset(buffer: Uint8Array): GUIDAndEncodedOffset;
  encodeDiffChunk(message: DiffChunk): Uint8Array;
  decodeDiffChunk(buffer: Uint8Array): DiffChunk;
  DiffType: any;
  encodeDiffPayload(message: DiffPayload): Uint8Array;
  decodeDiffPayload(buffer: Uint8Array): DiffPayload;
  RichMediaType: any;
  encodeRichMediaData(message: RichMediaData): Uint8Array;
  decodeRichMediaData(buffer: Uint8Array): RichMediaData;
  VariableDataType: any;
  VariableResolvedDataType: any;
  encodeVariableAnyValue(message: VariableAnyValue): Uint8Array;
  decodeVariableAnyValue(buffer: Uint8Array): VariableAnyValue;
  ExpressionFunction: any;
  encodeExpression(message: Expression): Uint8Array;
  decodeExpression(buffer: Uint8Array): Expression;
  encodeVariableMapValue(message: VariableMapValue): Uint8Array;
  decodeVariableMapValue(buffer: Uint8Array): VariableMapValue;
  encodeVariableMap(message: VariableMap): Uint8Array;
  decodeVariableMap(buffer: Uint8Array): VariableMap;
  encodeVariableFontStyle(message: VariableFontStyle): Uint8Array;
  decodeVariableFontStyle(buffer: Uint8Array): VariableFontStyle;
  encodeImageParameterValue(message: ImageParameterValue): Uint8Array;
  decodeImageParameterValue(buffer: Uint8Array): ImageParameterValue;
  encodeThumbnailInfo(message: ThumbnailInfo): Uint8Array;
  decodeThumbnailInfo(buffer: Uint8Array): ThumbnailInfo;
  encodeAiCanvasPrompt(message: AiCanvasPrompt): Uint8Array;
  decodeAiCanvasPrompt(buffer: Uint8Array): AiCanvasPrompt;
  encodeNodeFieldAlias(message: NodeFieldAlias): Uint8Array;
  decodeNodeFieldAlias(buffer: Uint8Array): NodeFieldAlias;
  NodeFieldAliasType: any;
  encodeCMSAlias(message: CMSAlias): Uint8Array;
  decodeCMSAlias(buffer: Uint8Array): CMSAlias;
  encodeJsRuntimeAlias(message: JsRuntimeAlias): Uint8Array;
  decodeJsRuntimeAlias(buffer: Uint8Array): JsRuntimeAlias;
  encodePropRefValue(message: PropRefValue): Uint8Array;
  decodePropRefValue(buffer: Uint8Array): PropRefValue;
  encodeManagedStringId(message: ManagedStringId): Uint8Array;
  decodeManagedStringId(buffer: Uint8Array): ManagedStringId;
  encodeManagedStringPlaceholderMapEntry(message: ManagedStringPlaceholderMapEntry): Uint8Array;
  decodeManagedStringPlaceholderMapEntry(buffer: Uint8Array): ManagedStringPlaceholderMapEntry;
  encodeSlotContentId(message: SlotContentId): Uint8Array;
  decodeSlotContentId(buffer: Uint8Array): SlotContentId;
  encodeManagedStringAlias(message: ManagedStringAlias): Uint8Array;
  decodeManagedStringAlias(buffer: Uint8Array): ManagedStringAlias;
  encodeKeyframeTrackId(message: KeyframeTrackId): Uint8Array;
  decodeKeyframeTrackId(buffer: Uint8Array): KeyframeTrackId;
  encodeAnimationPresetId(message: AnimationPresetId): Uint8Array;
  decodeAnimationPresetId(buffer: Uint8Array): AnimationPresetId;
  encodeTRSSTransform2D(message: TRSSTransform2D): Uint8Array;
  decodeTRSSTransform2D(buffer: Uint8Array): TRSSTransform2D;
  encodeVariableData(message: VariableData): Uint8Array;
  decodeVariableData(buffer: Uint8Array): VariableData;
  encodeVariableSetMode(message: VariableSetMode): Uint8Array;
  decodeVariableSetMode(buffer: Uint8Array): VariableSetMode;
  encodeVariableDataValues(message: VariableDataValues): Uint8Array;
  decodeVariableDataValues(buffer: Uint8Array): VariableDataValues;
  encodeVariableDataValuesEntry(message: VariableDataValuesEntry): Uint8Array;
  decodeVariableDataValuesEntry(buffer: Uint8Array): VariableDataValuesEntry;
  VariableScope: any;
  encodeKeyframeAnyValue(message: KeyframeAnyValue): Uint8Array;
  decodeKeyframeAnyValue(buffer: Uint8Array): KeyframeAnyValue;
  KeyframeValueType: any;
  encodeKeyframeValueData(message: KeyframeValueData): Uint8Array;
  decodeKeyframeValueData(buffer: Uint8Array): KeyframeValueData;
  KeyframeTrackParameterType: any;
  encodeManualKeyframeTrackParameter(message: ManualKeyframeTrackParameter): Uint8Array;
  decodeManualKeyframeTrackParameter(buffer: Uint8Array): ManualKeyframeTrackParameter;
  encodeAnimationPresetKeyframeTrackParameter(message: AnimationPresetKeyframeTrackParameter): Uint8Array;
  decodeAnimationPresetKeyframeTrackParameter(buffer: Uint8Array): AnimationPresetKeyframeTrackParameter;
  encodeKeyframeTrackAnyParameter(message: KeyframeTrackAnyParameter): Uint8Array;
  decodeKeyframeTrackAnyParameter(buffer: Uint8Array): KeyframeTrackAnyParameter;
  encodeKeyframeTrackParameter(message: KeyframeTrackParameter): Uint8Array;
  decodeKeyframeTrackParameter(buffer: Uint8Array): KeyframeTrackParameter;
  encodeKeyframeTrackParameterValue(message: KeyframeTrackParameterValue): Uint8Array;
  decodeKeyframeTrackParameterValue(buffer: Uint8Array): KeyframeTrackParameterValue;
  encodeAnimationPresets(message: AnimationPresets): Uint8Array;
  decodeAnimationPresets(buffer: Uint8Array): AnimationPresets;
  encodeAnimationPresetData(message: AnimationPresetData): Uint8Array;
  decodeAnimationPresetData(buffer: Uint8Array): AnimationPresetData;
  encodeSpringParams(message: SpringParams): Uint8Array;
  decodeSpringParams(buffer: Uint8Array): SpringParams;
  encodeTransitionEasingAnyValue(message: TransitionEasingAnyValue): Uint8Array;
  decodeTransitionEasingAnyValue(buffer: Uint8Array): TransitionEasingAnyValue;
  encodeEasingData(message: EasingData): Uint8Array;
  decodeEasingData(buffer: Uint8Array): EasingData;
  encodeTransitionOverride(message: TransitionOverride): Uint8Array;
  decodeTransitionOverride(buffer: Uint8Array): TransitionOverride;
  encodeTransitionOverrideData(message: TransitionOverrideData): Uint8Array;
  decodeTransitionOverrideData(buffer: Uint8Array): TransitionOverrideData;
  CodeSyntaxPlatform: any;
  encodeOptionalVector(message: OptionalVector): Uint8Array;
  decodeOptionalVector(buffer: Uint8Array): OptionalVector;
  HTMLTag: any;
  ARIARole: any;
  encodeMigrationStatus(message: MigrationStatus): Uint8Array;
  decodeMigrationStatus(buffer: Uint8Array): MigrationStatus;
  encodeNodeFieldMap(message: NodeFieldMap): Uint8Array;
  decodeNodeFieldMap(buffer: Uint8Array): NodeFieldMap;
  encodeNodeFieldMapEntry(message: NodeFieldMapEntry): Uint8Array;
  decodeNodeFieldMapEntry(buffer: Uint8Array): NodeFieldMapEntry;
  ColorProfile: any;
  DocumentColorProfile: any;
  ChildReadingDirection: any;
  encodeARIAAttributeAnyValue(message: ARIAAttributeAnyValue): Uint8Array;
  decodeARIAAttributeAnyValue(buffer: Uint8Array): ARIAAttributeAnyValue;
  ARIAAttributeDataType: any;
  encodeARIAAttributeData(message: ARIAAttributeData): Uint8Array;
  decodeARIAAttributeData(buffer: Uint8Array): ARIAAttributeData;
  encodeARIAAttributesMap(message: ARIAAttributesMap): Uint8Array;
  decodeARIAAttributesMap(buffer: Uint8Array): ARIAAttributesMap;
  encodeARIAAttributesMapEntry(message: ARIAAttributesMapEntry): Uint8Array;
  decodeARIAAttributesMapEntry(buffer: Uint8Array): ARIAAttributesMapEntry;
  encodeHandoffStatusMapEntry(message: HandoffStatusMapEntry): Uint8Array;
  decodeHandoffStatusMapEntry(buffer: Uint8Array): HandoffStatusMapEntry;
  encodeHandoffStatusMap(message: HandoffStatusMap): Uint8Array;
  decodeHandoffStatusMap(buffer: Uint8Array): HandoffStatusMap;
  encodeEditScopeInfo(message: EditScopeInfo): Uint8Array;
  decodeEditScopeInfo(buffer: Uint8Array): EditScopeInfo;
  encodeEditScopeSnapshot(message: EditScopeSnapshot): Uint8Array;
  decodeEditScopeSnapshot(buffer: Uint8Array): EditScopeSnapshot;
  encodeEditScopeStack(message: EditScopeStack): Uint8Array;
  decodeEditScopeStack(buffer: Uint8Array): EditScopeStack;
  encodeEditScope(message: EditScope): Uint8Array;
  decodeEditScope(buffer: Uint8Array): EditScope;
  EditScopeType: any;
  SectionPresetState: any;
  EmojiImageSet: any;
  SelectionRegionFocusType: any;
  encodeSectionPresetInfo(message: SectionPresetInfo): Uint8Array;
  decodeSectionPresetInfo(buffer: Uint8Array): SectionPresetInfo;
  encodeClipboardSelectionRegion(message: ClipboardSelectionRegion): Uint8Array;
  decodeClipboardSelectionRegion(buffer: Uint8Array): ClipboardSelectionRegion;
  FirstDraftKitType: any;
  encodeFirstDraftKit(message: FirstDraftKit): Uint8Array;
  decodeFirstDraftKit(buffer: Uint8Array): FirstDraftKit;
  encodeFirstDraftData(message: FirstDraftData): Uint8Array;
  decodeFirstDraftData(buffer: Uint8Array): FirstDraftData;
  FirstDraftKitElementType: any;
  encodeFirstDraftKitElementData(message: FirstDraftKitElementData): Uint8Array;
  decodeFirstDraftKitElementData(buffer: Uint8Array): FirstDraftKitElementData;
  PlatformShapeProperty: any;
  PlatformShapeBehaviorType: any;
  encodePlatformShapePropertyMapEntry(message: PlatformShapePropertyMapEntry): Uint8Array;
  decodePlatformShapePropertyMapEntry(buffer: Uint8Array): PlatformShapePropertyMapEntry;
  encodePlatformShapeDefinition(message: PlatformShapeDefinition): Uint8Array;
  decodePlatformShapeDefinition(buffer: Uint8Array): PlatformShapeDefinition;
  encodeNodeBehaviors(message: NodeBehaviors): Uint8Array;
  decodeNodeBehaviors(buffer: Uint8Array): NodeBehaviors;
  encodeBehaviorTransition(message: BehaviorTransition): Uint8Array;
  decodeBehaviorTransition(buffer: Uint8Array): BehaviorTransition;
  AppearBehaviorTrigger: any;
  RelativeDirection: any;
  encodeAppearBehavior(message: AppearBehavior): Uint8Array;
  decodeAppearBehavior(buffer: Uint8Array): AppearBehavior;
  encodeHoverBehavior(message: HoverBehavior): Uint8Array;
  decodeHoverBehavior(buffer: Uint8Array): HoverBehavior;
  encodePressBehavior(message: PressBehavior): Uint8Array;
  decodePressBehavior(buffer: Uint8Array): PressBehavior;
  encodeFocusBehavior(message: FocusBehavior): Uint8Array;
  decodeFocusBehavior(buffer: Uint8Array): FocusBehavior;
  encodeScrollParallaxBehavior(message: ScrollParallaxBehavior): Uint8Array;
  decodeScrollParallaxBehavior(buffer: Uint8Array): ScrollParallaxBehavior;
  ScrollTransformBehaviorTrigger: any;
  encodeScrollTransformBehavior(message: ScrollTransformBehavior): Uint8Array;
  decodeScrollTransformBehavior(buffer: Uint8Array): ScrollTransformBehavior;
  encodeCursorBehavior(message: CursorBehavior): Uint8Array;
  decodeCursorBehavior(buffer: Uint8Array): CursorBehavior;
  encodeMarqueeBehavior(message: MarqueeBehavior): Uint8Array;
  decodeMarqueeBehavior(buffer: Uint8Array): MarqueeBehavior;
  encodeCodeBehavior(message: CodeBehavior): Uint8Array;
  decodeCodeBehavior(buffer: Uint8Array): CodeBehavior;
  encodeClientRenderedMetadata(message: ClientRenderedMetadata): Uint8Array;
  decodeClientRenderedMetadata(buffer: Uint8Array): ClientRenderedMetadata;
  LinkBehaviorType: any;
  encodeLinkBehavior(message: LinkBehavior): Uint8Array;
  decodeLinkBehavior(buffer: Uint8Array): LinkBehavior;
  encodeVariableIdOrVariableOverrideId(message: VariableIdOrVariableOverrideId): Uint8Array;
  decodeVariableIdOrVariableOverrideId(buffer: Uint8Array): VariableIdOrVariableOverrideId;
  encodeIndexFontVariationAxis(message: IndexFontVariationAxis): Uint8Array;
  decodeIndexFontVariationAxis(buffer: Uint8Array): IndexFontVariationAxis;
  encodeIndexFontVariationAxisValue(message: IndexFontVariationAxisValue): Uint8Array;
  decodeIndexFontVariationAxisValue(buffer: Uint8Array): IndexFontVariationAxisValue;
  encodeIndexFontStyle(message: IndexFontStyle): Uint8Array;
  decodeIndexFontStyle(buffer: Uint8Array): IndexFontStyle;
  encodeIndexFontFile(message: IndexFontFile): Uint8Array;
  decodeIndexFontFile(buffer: Uint8Array): IndexFontFile;
  encodeIndexFamilyRename(message: IndexFamilyRename): Uint8Array;
  decodeIndexFamilyRename(buffer: Uint8Array): IndexFamilyRename;
  encodeIndexStyleRename(message: IndexStyleRename): Uint8Array;
  decodeIndexStyleRename(buffer: Uint8Array): IndexStyleRename;
  encodeIndexFamilyStylesRename(message: IndexFamilyStylesRename): Uint8Array;
  decodeIndexFamilyStylesRename(buffer: Uint8Array): IndexFamilyStylesRename;
  encodeIndexRenames(message: IndexRenames): Uint8Array;
  decodeIndexRenames(buffer: Uint8Array): IndexRenames;
  encodeIndexEmojiSequence(message: IndexEmojiSequence): Uint8Array;
  decodeIndexEmojiSequence(buffer: Uint8Array): IndexEmojiSequence;
  encodeIndexEmojis(message: IndexEmojis): Uint8Array;
  decodeIndexEmojis(buffer: Uint8Array): IndexEmojis;
  encodeFontIndex(message: FontIndex): Uint8Array;
  decodeFontIndex(buffer: Uint8Array): FontIndex;
  encodeSlideThemeData(message: SlideThemeData): Uint8Array;
  decodeSlideThemeData(buffer: Uint8Array): SlideThemeData;
  SlideNumber: any;
  NodeChatMessageType: any;
  encodeNodeChatMessage(message: NodeChatMessage): Uint8Array;
  decodeNodeChatMessage(buffer: Uint8Array): NodeChatMessage;
  encodeNodeChatToolCall(message: NodeChatToolCall): Uint8Array;
  decodeNodeChatToolCall(buffer: Uint8Array): NodeChatToolCall;
  encodeNodeChatToolResult(message: NodeChatToolResult): Uint8Array;
  decodeNodeChatToolResult(buffer: Uint8Array): NodeChatToolResult;
  encodeNodeChatExchange(message: NodeChatExchange): Uint8Array;
  decodeNodeChatExchange(buffer: Uint8Array): NodeChatExchange;
  encodeNodeChatCompressionState(message: NodeChatCompressionState): Uint8Array;
  decodeNodeChatCompressionState(buffer: Uint8Array): NodeChatCompressionState;
  encodeFileUpdate(message: FileUpdate): Uint8Array;
  decodeFileUpdate(buffer: Uint8Array): FileUpdate;
  encodeAIChatContentPart(message: AIChatContentPart): Uint8Array;
  decodeAIChatContentPart(buffer: Uint8Array): AIChatContentPart;
  AIChatContentPartType: any;
  encodeAIChatContentPartAnyValue(message: AIChatContentPartAnyValue): Uint8Array;
  decodeAIChatContentPartAnyValue(buffer: Uint8Array): AIChatContentPartAnyValue;
  AIChatMessageRole: any;
  encodeAIChatMessage(message: AIChatMessage): Uint8Array;
  decodeAIChatMessage(buffer: Uint8Array): AIChatMessage;
  encodeAIChatThread(message: AIChatThread): Uint8Array;
  decodeAIChatThread(buffer: Uint8Array): AIChatThread;
  CooperTemplateType: any;
  encodeCooperTemplateData(message: CooperTemplateData): Uint8Array;
  decodeCooperTemplateData(buffer: Uint8Array): CooperTemplateData;
  encodeImageImportMap(message: ImageImportMap): Uint8Array;
  decodeImageImportMap(buffer: Uint8Array): ImageImportMap;
  encodeImageImport(message: ImageImport): Uint8Array;
  decodeImageImport(buffer: Uint8Array): ImageImport;
  InterpolationType: any;
  encodeBezierHandles(message: BezierHandles): Uint8Array;
  decodeBezierHandles(buffer: Uint8Array): BezierHandles;
  KeyframeOperation: any;
  TimelinePositionType: any;
  PlaybackStyle: any;
}
