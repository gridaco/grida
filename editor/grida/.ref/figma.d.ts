/* plugin-typings are auto-generated. Do not update them directly. See plugin-docs/ for instructions. */
declare type ArgFreeEventType =
  | "selectionchange"
  | "currentpagechange"
  | "close"
  | "timerstart"
  | "timerstop"
  | "timerpause"
  | "timerresume"
  | "timeradjust"
  | "timerdone";
interface PluginAPI {
  readonly apiVersion: "1.0.0";
  readonly command: string;
  readonly editorType: "figma" | "figjam" | "dev";
  readonly fileKey: string | undefined;
  skipInvisibleInstanceChildren: boolean;
  readonly devResources?: DevResourcesAPI;
  closePlugin(message?: string): void;
  notify(message: string, options?: NotificationOptions): NotificationHandler;
  commitUndo(): void;
  triggerUndo(): void;
  saveVersionHistoryAsync(
    title: string,
    description?: string
  ): Promise<VersionHistoryResult>;
  openExternal(url: string): void;
  showUI(html: string, options?: ShowUIOptions): void;
  readonly ui: UIAPI;
  readonly util: UtilAPI;
  readonly constants: ConstantsAPI;
  readonly clientStorage: ClientStorageAPI;
  readonly parameters: ParametersAPI;
  getNodeByIdAsync(id: string): Promise<BaseNode | null>;
  getNodeById(id: string): BaseNode | null;
  getStyleByIdAsync(id: string): Promise<BaseStyle | null>;
  getStyleById(id: string): BaseStyle | null;
  readonly variables: VariablesAPI;
  readonly teamLibrary: TeamLibraryAPI;
  readonly root: DocumentNode;
  currentPage: PageNode;
  setCurrentPageAsync(page: PageNode): Promise<void>;
  on(type: ArgFreeEventType, callback: () => void): void;
  on(type: "run", callback: (event: RunEvent) => void): void;
  on(type: "drop", callback: (event: DropEvent) => boolean): void;
  on(
    type: "documentchange",
    callback: (event: DocumentChangeEvent) => void
  ): void;
  on(
    type: "textreview",
    callback: (
      event: TextReviewEvent
    ) => Promise<TextReviewRange[]> | TextReviewRange[]
  ): void;
  on(type: "stylechange", callback: (event: StyleChangeEvent) => void): void;
  once(type: ArgFreeEventType, callback: () => void): void;
  once(type: "run", callback: (event: RunEvent) => void): void;
  once(type: "drop", callback: (event: DropEvent) => boolean): void;
  once(
    type: "documentchange",
    callback: (event: DocumentChangeEvent) => void
  ): void;
  once(
    type: "textreview",
    callback: (
      event: TextReviewEvent
    ) => Promise<TextReviewRange[]> | TextReviewRange[]
  ): void;
  once(type: "stylechange", callback: (event: StyleChangeEvent) => void): void;
  off(type: ArgFreeEventType, callback: () => void): void;
  off(type: "run", callback: (event: RunEvent) => void): void;
  off(type: "drop", callback: (event: DropEvent) => boolean): void;
  off(
    type: "documentchange",
    callback: (event: DocumentChangeEvent) => void
  ): void;
  off(
    type: "textreview",
    callback: (
      event: TextReviewEvent
    ) => Promise<TextReviewRange[]> | TextReviewRange[]
  ): void;
  off(type: "stylechange", callback: (event: StyleChangeEvent) => void): void;
  readonly mixed: unique symbol;
  createRectangle(): RectangleNode;
  createLine(): LineNode;
  createEllipse(): EllipseNode;
  createPolygon(): PolygonNode;
  createStar(): StarNode;
  createVector(): VectorNode;
  createText(): TextNode;
  createFrame(): FrameNode;
  createComponent(): ComponentNode;
  createComponentFromNode(node: SceneNode): ComponentNode;
  createPage(): PageNode;
  createSlice(): SliceNode;
  createSticky(): StickyNode;
  createConnector(): ConnectorNode;
  createShapeWithText(): ShapeWithTextNode;
  createCodeBlock(): CodeBlockNode;
  createSection(): SectionNode;
  createTable(numRows?: number, numColumns?: number): TableNode;
  createNodeFromJSXAsync(jsx: any): Promise<SceneNode>;
  createBooleanOperation(): BooleanOperationNode;
  createPaintStyle(): PaintStyle;
  createTextStyle(): TextStyle;
  createEffectStyle(): EffectStyle;
  createGridStyle(): GridStyle;
  getLocalPaintStylesAsync(): Promise<PaintStyle[]>;
  getLocalPaintStyles(): PaintStyle[];
  getLocalTextStylesAsync(): Promise<TextStyle[]>;
  getLocalTextStyles(): TextStyle[];
  getLocalEffectStylesAsync(): Promise<EffectStyle[]>;
  getLocalEffectStyles(): EffectStyle[];
  getLocalGridStylesAsync(): Promise<GridStyle[]>;
  getLocalGridStyles(): GridStyle[];
  getSelectionColors(): null | {
    paints: Paint[];
    styles: PaintStyle[];
  };
  moveLocalPaintStyleAfter(
    targetNode: PaintStyle,
    reference: PaintStyle | null
  ): void;
  moveLocalTextStyleAfter(
    targetNode: TextStyle,
    reference: TextStyle | null
  ): void;
  moveLocalEffectStyleAfter(
    targetNode: EffectStyle,
    reference: EffectStyle | null
  ): void;
  moveLocalGridStyleAfter(
    targetNode: GridStyle,
    reference: GridStyle | null
  ): void;
  moveLocalPaintFolderAfter(
    targetFolder: string,
    reference: string | null
  ): void;
  moveLocalTextFolderAfter(
    targetFolder: string,
    reference: string | null
  ): void;
  moveLocalEffectFolderAfter(
    targetFolder: string,
    reference: string | null
  ): void;
  moveLocalGridFolderAfter(
    targetFolder: string,
    reference: string | null
  ): void;
  importComponentByKeyAsync(key: string): Promise<ComponentNode>;
  importComponentSetByKeyAsync(key: string): Promise<ComponentSetNode>;
  importStyleByKeyAsync(key: string): Promise<BaseStyle>;
  listAvailableFontsAsync(): Promise<Font[]>;
  loadFontAsync(fontName: FontName): Promise<void>;
  readonly hasMissingFont: boolean;
  createNodeFromSvg(svg: string): FrameNode;
  createImage(data: Uint8Array): Image;
  createImageAsync(src: string): Promise<Image>;
  getImageByHash(hash: string): Image | null;
  createVideoAsync(data: Uint8Array): Promise<Video>;
  createLinkPreviewAsync(url: string): Promise<EmbedNode | LinkUnfurlNode>;
  createGif(hash: string): MediaNode;
  combineAsVariants(
    nodes: ReadonlyArray<ComponentNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number
  ): ComponentSetNode;
  group(
    nodes: ReadonlyArray<BaseNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number
  ): GroupNode;
  flatten(
    nodes: ReadonlyArray<BaseNode>,
    parent?: BaseNode & ChildrenMixin,
    index?: number
  ): VectorNode;
  union(
    nodes: ReadonlyArray<BaseNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number
  ): BooleanOperationNode;
  subtract(
    nodes: ReadonlyArray<BaseNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number
  ): BooleanOperationNode;
  intersect(
    nodes: ReadonlyArray<BaseNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number
  ): BooleanOperationNode;
  exclude(
    nodes: ReadonlyArray<BaseNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number
  ): BooleanOperationNode;
  ungroup(node: SceneNode & ChildrenMixin): Array<SceneNode>;
  base64Encode(data: Uint8Array): string;
  base64Decode(data: string): Uint8Array;
  getFileThumbnailNodeAsync(): Promise<
    FrameNode | ComponentNode | ComponentSetNode | SectionNode | null
  >;
  getFileThumbnailNode():
    | FrameNode
    | ComponentNode
    | ComponentSetNode
    | SectionNode
    | null;
  setFileThumbnailNodeAsync(
    node: FrameNode | ComponentNode | ComponentSetNode | SectionNode | null
  ): Promise<void>;
  loadAllPagesAsync(): Promise<void>;
}
interface VersionHistoryResult {
  id: string;
}
interface VariablesAPI {
  getVariableByIdAsync(id: string): Promise<Variable | null>;
  getVariableById(id: string): Variable | null;
  getVariableCollectionByIdAsync(
    id: string
  ): Promise<VariableCollection | null>;
  getVariableCollectionById(id: string): VariableCollection | null;
  getLocalVariablesAsync(type?: VariableResolvedDataType): Promise<Variable[]>;
  getLocalVariables(type?: VariableResolvedDataType): Variable[];
  getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>;
  getLocalVariableCollections(): VariableCollection[];
  createVariable(
    name: string,
    collectionId: string,
    resolvedType: VariableResolvedDataType
  ): Variable;
  createVariable(
    name: string,
    collection: VariableCollection,
    resolvedType: VariableResolvedDataType
  ): Variable;
  createVariableCollection(name: string): VariableCollection;
  createVariableAlias(variable: Variable): VariableAlias;
  createVariableAliasByIdAsync(variableId: string): Promise<VariableAlias>;
  setBoundVariableForPaint(
    paint: SolidPaint,
    field: VariableBindablePaintField,
    variable: Variable | null
  ): SolidPaint;
  setBoundVariableForEffect(
    effect: Effect,
    field: VariableBindableEffectField,
    variable: Variable | null
  ): Effect;
  setBoundVariableForLayoutGrid(
    layoutGrid: LayoutGrid,
    field: VariableBindableLayoutGridField,
    variable: Variable | null
  ): LayoutGrid;
  importVariableByKeyAsync(key: string): Promise<Variable>;
}
interface LibraryVariableCollection {
  name: string;
  key: string;
  libraryName: string;
}
interface LibraryVariable {
  name: string;
  key: string;
  resolvedType: VariableResolvedDataType;
}
interface TeamLibraryAPI {
  getAvailableLibraryVariableCollectionsAsync(): Promise<
    LibraryVariableCollection[]
  >;
  getVariablesInLibraryCollectionAsync(
    libraryCollectionKey: string
  ): Promise<LibraryVariable[]>;
}

interface ClientStorageAPI {
  getAsync(key: string): Promise<any | undefined>;
  setAsync(key: string, value: any): Promise<void>;
  deleteAsync(key: string): Promise<void>;
  keysAsync(): Promise<string[]>;
}
interface NotificationOptions {
  timeout?: number;
  error?: boolean;
  onDequeue?: (reason: NotifyDequeueReason) => void;
  button?: {
    text: string;
    action: () => boolean | void;
  };
}
declare type NotifyDequeueReason =
  | "timeout"
  | "dismiss"
  | "action_button_click";
interface NotificationHandler {
  cancel: () => void;
}
interface ShowUIOptions {
  visible?: boolean;
  title?: string;
  width?: number;
  height?: number;
  position?: {
    x: number;
    y: number;
  };
  themeColors?: boolean;
}
interface UIPostMessageOptions {
  origin?: string;
}
interface OnMessageProperties {
  origin: string;
}
declare type MessageEventHandler = (
  pluginMessage: any,
  props: OnMessageProperties
) => void;
interface UIAPI {
  show(): void;
  hide(): void;
  resize(width: number, height: number): void;
  reposition(x: number, y: number): void;
  close(): void;
  postMessage(pluginMessage: any, options?: UIPostMessageOptions): void;
  onmessage: MessageEventHandler | undefined;
  on(type: "message", callback: MessageEventHandler): void;
  once(type: "message", callback: MessageEventHandler): void;
  off(type: "message", callback: MessageEventHandler): void;
}
interface UtilAPI {
  rgb(color: string | RGB | RGBA): RGB;
  rgba(color: string | RGB | RGBA): RGBA;
  solidPaint(
    color: string | RGB | RGBA,
    overrides?: Partial<SolidPaint>
  ): SolidPaint;
}
interface ColorPalette {
  [key: string]: string;
}
interface ColorPalettes {
  figJamBase: ColorPalette;
  figJamBaseLight: ColorPalette;
}
interface ConstantsAPI {
  colors: ColorPalettes;
}
declare type CodegenEvent = {
  node: SceneNode;
  language: string;
};

interface CodegenAPI {}
interface DevResource {}
interface DevResourceWithNodeId extends DevResource {
  nodeId: string;
}
declare type LinkPreviewEvent = {
  link: DevResource;
};
declare type PlainTextElement = {
  type: "PLAIN_TEXT";
  text: string;
};
declare type LinkPreviewResult =
  | {
      type: "AUTH_REQUIRED";
    }
  | PlainTextElement
  | null;
declare type AuthEvent = {
  links: DevResource[];
};
declare type DevResourceOpenEvent = {
  devResource: DevResourceWithNodeId;
};
declare type AuthResult = {
  type: "AUTH_SUCCESS";
} | null;
interface DevResourcesAPI {
  on(
    type: "linkpreview",
    callback: (
      event: LinkPreviewEvent
    ) => Promise<LinkPreviewResult> | LinkPreviewResult
  ): void;
  on(
    type: "auth",
    callback: (event: AuthEvent) => Promise<AuthResult> | AuthResult
  ): void;
  on(type: "open", callback: (event: DevResourceOpenEvent) => void): void;
  once(
    type: "linkpreview",
    callback: (
      event: LinkPreviewEvent
    ) => Promise<LinkPreviewResult> | LinkPreviewResult
  ): void;
  once(
    type: "auth",
    callback: (event: AuthEvent) => Promise<AuthResult> | AuthResult
  ): void;
  once(type: "open", callback: (event: DevResourceOpenEvent) => void): void;
  off(
    type: "linkpreview",
    callback: (
      event: LinkPreviewEvent
    ) => Promise<LinkPreviewResult> | LinkPreviewResult
  ): void;
  off(
    type: "auth",
    callback: (event: AuthEvent) => Promise<AuthResult> | AuthResult
  ): void;
  off(type: "open", callback: (event: DevResourceOpenEvent) => void): void;
}
interface ParameterValues {
  [key: string]: any;
}
interface SuggestionResults {
  setSuggestions(
    suggestions: Array<
      | string
      | {
          name: string;
          data?: any;
          icon?: string | Uint8Array;
          iconUrl?: string;
        }
    >
  ): void;
  setError(message: string): void;
  setLoadingMessage(message: string): void;
}
declare type ParameterInputEvent<ParametersType = ParameterValues> = {
  query: string;
  key: string;
  parameters: Partial<ParametersType>;
  result: SuggestionResults;
};
interface ParametersAPI {
  on(type: "input", callback: (event: ParameterInputEvent) => void): void;
  once(type: "input", callback: (event: ParameterInputEvent) => void): void;
  off(type: "input", callback: (event: ParameterInputEvent) => void): void;
}
interface RunParametersEvent<ParametersType = ParameterValues | undefined> {
  command: string;
  parameters: ParametersType;
}
interface OpenDevResourcesEvent {
  command: "open-dev-resource";
  parameters?: undefined;
  link: {
    url: string;
    name: string;
  };
}
declare type RunEvent = RunParametersEvent | OpenDevResourcesEvent;
interface DropEvent {
  node: BaseNode | SceneNode;
  x: number;
  y: number;
  absoluteX: number;
  absoluteY: number;
  items: DropItem[];
  files: DropFile[];
  dropMetadata?: any;
}
interface DropItem {
  type: string;
  data: string;
}
interface DropFile {
  name: string;
  type: string;
  getBytesAsync(): Promise<Uint8Array>;
  getTextAsync(): Promise<string>;
}
interface DocumentChangeEvent {
  documentChanges: DocumentChange[];
}
interface StyleChangeEvent {
  styleChanges: StyleChange[];
}
declare type StyleChange =
  | StyleCreateChange
  | StyleDeleteChange
  | StylePropertyChange;
interface BaseDocumentChange {
  id: string;
  origin: "LOCAL" | "REMOTE";
}
interface BaseNodeChange extends BaseDocumentChange {
  node: SceneNode | RemovedNode;
}
interface RemovedNode {
  readonly removed: true;
  readonly type: NodeType;
  readonly id: string;
}
interface CreateChange extends BaseNodeChange {
  type: "CREATE";
}
interface DeleteChange extends BaseNodeChange {
  type: "DELETE";
}
interface PropertyChange extends BaseNodeChange {
  type: "PROPERTY_CHANGE";
  properties: NodeChangeProperty[];
}
interface BaseStyleChange extends BaseDocumentChange {
  style: BaseStyle | null;
}
interface StyleCreateChange extends BaseStyleChange {
  type: "STYLE_CREATE";
}
interface StyleDeleteChange extends BaseStyleChange {
  type: "STYLE_DELETE";
  style: null;
}
interface StylePropertyChange extends BaseStyleChange {
  type: "STYLE_PROPERTY_CHANGE";
  properties: StyleChangeProperty[];
}
declare type DocumentChange =
  | CreateChange
  | DeleteChange
  | PropertyChange
  | StyleCreateChange
  | StyleDeleteChange
  | StylePropertyChange;
declare type NodeChangeProperty =
  | "pointCount"
  | "name"
  | "width"
  | "height"
  | "minWidth"
  | "maxWidth"
  | "minHeight"
  | "maxHeight"
  | "parent"
  | "pluginData"
  | "constraints"
  | "locked"
  | "visible"
  | "opacity"
  | "blendMode"
  | "layoutGrids"
  | "guides"
  | "characters"
  | "openTypeFeatures"
  | "styledTextSegments"
  | "vectorNetwork"
  | "effects"
  | "exportSettings"
  | "arcData"
  | "autoRename"
  | "fontName"
  | "innerRadius"
  | "fontSize"
  | "lineHeight"
  | "leadingTrim"
  | "paragraphIndent"
  | "paragraphSpacing"
  | "listSpacing"
  | "hangingPunctuation"
  | "hangingList"
  | "letterSpacing"
  | "textAlignHorizontal"
  | "textAlignVertical"
  | "textCase"
  | "textDecoration"
  | "textAutoResize"
  | "textTruncation"
  | "maxLines"
  | "fills"
  | "topLeftRadius"
  | "topRightRadius"
  | "bottomLeftRadius"
  | "bottomRightRadius"
  | "constrainProportions"
  | "strokes"
  | "strokeWeight"
  | "strokeAlign"
  | "strokeCap"
  | "strokeJoin"
  | "strokeMiterLimit"
  | "booleanOperation"
  | "overflowDirection"
  | "dashPattern"
  | "backgrounds"
  | "handleMirroring"
  | "cornerRadius"
  | "cornerSmoothing"
  | "relativeTransform"
  | "x"
  | "y"
  | "rotation"
  | "isMask"
  | "maskType"
  | "clipsContent"
  | "type"
  | "overlayPositionType"
  | "overlayBackgroundInteraction"
  | "overlayBackground"
  | "prototypeStartNode"
  | "prototypeBackgrounds"
  | "expanded"
  | "fillStyleId"
  | "strokeStyleId"
  | "backgroundStyleId"
  | "textStyleId"
  | "effectStyleId"
  | "gridStyleId"
  | "description"
  | "layoutMode"
  | "layoutWrap"
  | "paddingLeft"
  | "paddingTop"
  | "paddingRight"
  | "paddingBottom"
  | "itemSpacing"
  | "counterAxisSpacing"
  | "layoutAlign"
  | "counterAxisSizingMode"
  | "primaryAxisSizingMode"
  | "primaryAxisAlignItems"
  | "counterAxisAlignItems"
  | "counterAxisAlignContent"
  | "layoutGrow"
  | "layoutPositioning"
  | "itemReverseZIndex"
  | "hyperlink"
  | "mediaData"
  | "stokeTopWeight"
  | "strokeBottomWeight"
  | "strokeLeftWeight"
  | "strokeRightWeight"
  | "reactions"
  | "flowStartingPoints"
  | "shapeType"
  | "connectorStart"
  | "connectorEnd"
  | "connectorLineType"
  | "connectorStartStrokeCap"
  | "connectorEndStrokeCap"
  | "codeLanguage"
  | "widgetSyncedState"
  | "componentPropertyDefinitions"
  | "componentPropertyReferences"
  | "componentProperties"
  | "embedData"
  | "linkUnfurlData"
  | "text"
  | "authorVisible"
  | "authorName"
  | "code"
  | "textBackground";
interface NodeChangeEvent {
  nodeChanges: NodeChange[];
}
declare type NodeChange = CreateChange | DeleteChange | PropertyChange;
declare type StyleChangeProperty =
  | "name"
  | "pluginData"
  | "type"
  | "description"
  | "remote"
  | "documentationLinks"
  | "fontSize"
  | "textDecoration"
  | "letterSpacing"
  | "lineHeight"
  | "leadingTrim"
  | "paragraphIndent"
  | "paragraphSpacing"
  | "listSpacing"
  | "hangingPunctuation"
  | "hangingList"
  | "textCase"
  | "paint"
  | "effects"
  | "layoutGrids";
declare type TextReviewEvent = {
  text: string;
};
declare type TextReviewRange = {
  start: number;
  end: number;
  suggestions: string[];
  color?: "RED" | "GREEN" | "BLUE";
};
declare type Transform = [[number, number, number], [number, number, number]];
interface Vector {
  readonly x: number;
  readonly y: number;
}
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}
interface RGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}
interface FontName {
  readonly family: string;
  readonly style: string;
}
declare type TextCase =
  | "ORIGINAL"
  | "UPPER"
  | "LOWER"
  | "TITLE"
  | "SMALL_CAPS"
  | "SMALL_CAPS_FORCED";
declare type TextDecoration = "NONE" | "UNDERLINE" | "STRIKETHROUGH";
declare type OpenTypeFeature =
  | "PCAP"
  | "C2PC"
  | "CASE"
  | "CPSP"
  | "TITL"
  | "UNIC"
  | "ZERO"
  | "SINF"
  | "ORDN"
  | "AFRC"
  | "DNOM"
  | "NUMR"
  | "LIGA"
  | "CLIG"
  | "DLIG"
  | "HLIG"
  | "RLIG"
  | "AALT"
  | "CALT"
  | "RCLT"
  | "SALT"
  | "RVRN"
  | "VERT"
  | "SWSH"
  | "CSWH"
  | "NALT"
  | "CCMP"
  | "STCH"
  | "HIST"
  | "SIZE"
  | "ORNM"
  | "ITAL"
  | "RAND"
  | "DTLS"
  | "FLAC"
  | "MGRK"
  | "SSTY"
  | "KERN"
  | "FWID"
  | "HWID"
  | "HALT"
  | "TWID"
  | "QWID"
  | "PWID"
  | "JUST"
  | "LFBD"
  | "OPBD"
  | "RTBD"
  | "PALT"
  | "PKNA"
  | "LTRA"
  | "LTRM"
  | "RTLA"
  | "RTLM"
  | "ABRV"
  | "ABVM"
  | "ABVS"
  | "VALT"
  | "VHAL"
  | "BLWF"
  | "BLWM"
  | "BLWS"
  | "AKHN"
  | "CJCT"
  | "CFAR"
  | "CPCT"
  | "CURS"
  | "DIST"
  | "EXPT"
  | "FALT"
  | "FINA"
  | "FIN2"
  | "FIN3"
  | "HALF"
  | "HALN"
  | "HKNA"
  | "HNGL"
  | "HOJO"
  | "INIT"
  | "ISOL"
  | "JP78"
  | "JP83"
  | "JP90"
  | "JP04"
  | "LJMO"
  | "LOCL"
  | "MARK"
  | "MEDI"
  | "MED2"
  | "MKMK"
  | "NLCK"
  | "NUKT"
  | "PREF"
  | "PRES"
  | "VPAL"
  | "PSTF"
  | "PSTS"
  | "RKRF"
  | "RPHF"
  | "RUBY"
  | "SMPL"
  | "TJMO"
  | "TNAM"
  | "TRAD"
  | "VATU"
  | "VJMO"
  | "VKNA"
  | "VKRN"
  | "VRTR"
  | "VRT2"
  | "SS01"
  | "SS02"
  | "SS03"
  | "SS04"
  | "SS05"
  | "SS06"
  | "SS07"
  | "SS08"
  | "SS09"
  | "SS10"
  | "SS11"
  | "SS12"
  | "SS13"
  | "SS14"
  | "SS15"
  | "SS16"
  | "SS17"
  | "SS18"
  | "SS19"
  | "SS20"
  | "CV01"
  | "CV02"
  | "CV03"
  | "CV04"
  | "CV05"
  | "CV06"
  | "CV07"
  | "CV08"
  | "CV09"
  | "CV10"
  | "CV11"
  | "CV12"
  | "CV13"
  | "CV14"
  | "CV15"
  | "CV16"
  | "CV17"
  | "CV18"
  | "CV19"
  | "CV20"
  | "CV21"
  | "CV22"
  | "CV23"
  | "CV24"
  | "CV25"
  | "CV26"
  | "CV27"
  | "CV28"
  | "CV29"
  | "CV30"
  | "CV31"
  | "CV32"
  | "CV33"
  | "CV34"
  | "CV35"
  | "CV36"
  | "CV37"
  | "CV38"
  | "CV39"
  | "CV40"
  | "CV41"
  | "CV42"
  | "CV43"
  | "CV44"
  | "CV45"
  | "CV46"
  | "CV47"
  | "CV48"
  | "CV49"
  | "CV50"
  | "CV51"
  | "CV52"
  | "CV53"
  | "CV54"
  | "CV55"
  | "CV56"
  | "CV57"
  | "CV58"
  | "CV59"
  | "CV60"
  | "CV61"
  | "CV62"
  | "CV63"
  | "CV64"
  | "CV65"
  | "CV66"
  | "CV67"
  | "CV68"
  | "CV69"
  | "CV70"
  | "CV71"
  | "CV72"
  | "CV73"
  | "CV74"
  | "CV75"
  | "CV76"
  | "CV77"
  | "CV78"
  | "CV79"
  | "CV80"
  | "CV81"
  | "CV82"
  | "CV83"
  | "CV84"
  | "CV85"
  | "CV86"
  | "CV87"
  | "CV88"
  | "CV89"
  | "CV90"
  | "CV91"
  | "CV92"
  | "CV93"
  | "CV94"
  | "CV95"
  | "CV96"
  | "CV97"
  | "CV98"
  | "CV99";
interface ArcData {
  readonly startingAngle: number;
  readonly endingAngle: number;
  readonly innerRadius: number;
}
interface DropShadowEffect {
  readonly type: "DROP_SHADOW";
  readonly color: RGBA;
  readonly offset: Vector;
  readonly radius: number;
  readonly spread?: number;
  readonly visible: boolean;
  readonly blendMode: BlendMode;
  readonly showShadowBehindNode?: boolean;
  readonly boundVariables?: {
    [field in VariableBindableEffectField]?: VariableAlias;
  };
}
interface InnerShadowEffect {
  readonly type: "INNER_SHADOW";
  readonly color: RGBA;
  readonly offset: Vector;
  readonly radius: number;
  readonly spread?: number;
  readonly visible: boolean;
  readonly blendMode: BlendMode;
  readonly boundVariables?: {
    [field in VariableBindableEffectField]?: VariableAlias;
  };
}
interface BlurEffect {
  readonly type: "LAYER_BLUR" | "BACKGROUND_BLUR";
  readonly radius: number;
  readonly visible: boolean;
  readonly boundVariables?: {
    ["radius"]?: VariableAlias;
  };
}
declare type Effect = DropShadowEffect | InnerShadowEffect | BlurEffect;
declare type ConstraintType = "MIN" | "CENTER" | "MAX" | "STRETCH" | "SCALE";
interface Constraints {
  readonly horizontal: ConstraintType;
  readonly vertical: ConstraintType;
}
interface ColorStop {
  readonly position: number;
  readonly color: RGBA;
  readonly boundVariables?: {
    [field in VariableBindableColorStopField]?: VariableAlias;
  };
}
interface ImageFilters {
  readonly exposure?: number;
  readonly contrast?: number;
  readonly saturation?: number;
  readonly temperature?: number;
  readonly tint?: number;
  readonly highlights?: number;
  readonly shadows?: number;
}
interface SolidPaint {
  readonly type: "SOLID";
  readonly color: RGB;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly blendMode?: BlendMode;
  readonly boundVariables?: {
    [field in VariableBindablePaintField]?: VariableAlias;
  };
}
interface GradientPaint {
  readonly type:
    | "GRADIENT_LINEAR"
    | "GRADIENT_RADIAL"
    | "GRADIENT_ANGULAR"
    | "GRADIENT_DIAMOND";
  readonly gradientTransform: Transform;
  readonly gradientStops: ReadonlyArray<ColorStop>;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly blendMode?: BlendMode;
}
interface ImagePaint {
  readonly type: "IMAGE";
  readonly scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
  readonly imageHash: string | null;
  readonly imageTransform?: Transform;
  readonly scalingFactor?: number;
  readonly rotation?: number;
  readonly filters?: ImageFilters;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly blendMode?: BlendMode;
}
interface VideoPaint {
  readonly type: "VIDEO";
  readonly scaleMode: "FILL" | "FIT" | "CROP" | "TILE";
  readonly videoHash: string | null;
  readonly videoTransform?: Transform;
  readonly scalingFactor?: number;
  readonly rotation?: number;
  readonly filters?: ImageFilters;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly blendMode?: BlendMode;
}
declare type Paint = SolidPaint | GradientPaint | ImagePaint | VideoPaint;
interface Guide {
  readonly axis: "X" | "Y";
  readonly offset: number;
}
interface RowsColsLayoutGrid {
  readonly pattern: "ROWS" | "COLUMNS";
  readonly alignment: "MIN" | "MAX" | "STRETCH" | "CENTER";
  readonly gutterSize: number;
  readonly count: number;
  readonly sectionSize?: number;
  readonly offset?: number;
  readonly visible?: boolean;
  readonly color?: RGBA;
  readonly boundVariables?: {
    [field in VariableBindableLayoutGridField]?: VariableAlias;
  };
}
interface GridLayoutGrid {
  readonly pattern: "GRID";
  readonly sectionSize: number;
  readonly visible?: boolean;
  readonly color?: RGBA;
  readonly boundVariables?: {
    ["sectionSize"]?: VariableAlias;
  };
}
declare type LayoutGrid = RowsColsLayoutGrid | GridLayoutGrid;
interface ExportSettingsConstraints {
  readonly type: "SCALE" | "WIDTH" | "HEIGHT";
  readonly value: number;
}
interface ExportSettingsImage {
  readonly format: "JPG" | "PNG";
  readonly contentsOnly?: boolean;
  readonly useAbsoluteBounds?: boolean;
  readonly suffix?: string;
  readonly constraint?: ExportSettingsConstraints;
  readonly colorProfile?: "DOCUMENT" | "SRGB" | "DISPLAY_P3_V4";
}
interface ExportSettingsSVGBase {
  readonly contentsOnly?: boolean;
  readonly useAbsoluteBounds?: boolean;
  readonly suffix?: string;
  readonly svgOutlineText?: boolean;
  readonly svgIdAttribute?: boolean;
  readonly svgSimplifyStroke?: boolean;
  readonly colorProfile?: "DOCUMENT" | "SRGB" | "DISPLAY_P3_V4";
}
interface ExportSettingsSVG extends ExportSettingsSVGBase {
  readonly format: "SVG";
}
interface ExportSettingsSVGString extends ExportSettingsSVGBase {
  readonly format: "SVG_STRING";
}
interface ExportSettingsPDF {
  readonly format: "PDF";
  readonly contentsOnly?: boolean;
  readonly useAbsoluteBounds?: boolean;
  readonly suffix?: string;
  readonly colorProfile?: "DOCUMENT" | "SRGB" | "DISPLAY_P3_V4";
}
interface ExportSettingsREST {
  readonly format: "JSON_REST_V1";
}
declare type ExportSettings =
  | ExportSettingsImage
  | ExportSettingsSVG
  | ExportSettingsPDF;
declare type WindingRule = "NONZERO" | "EVENODD";
interface VectorVertex {
  readonly x: number;
  readonly y: number;
  readonly strokeCap?: StrokeCap;
  readonly strokeJoin?: StrokeJoin;
  readonly cornerRadius?: number;
  readonly handleMirroring?: HandleMirroring;
}
interface VectorSegment {
  readonly start: number;
  readonly end: number;
  readonly tangentStart?: Vector;
  readonly tangentEnd?: Vector;
}
interface VectorRegion {
  readonly windingRule: WindingRule;
  readonly loops: ReadonlyArray<ReadonlyArray<number>>;
  readonly fills?: ReadonlyArray<Paint>;
  readonly fillStyleId?: string;
}
interface VectorNetwork {
  readonly vertices: ReadonlyArray<VectorVertex>;
  readonly segments: ReadonlyArray<VectorSegment>;
  readonly regions?: ReadonlyArray<VectorRegion>;
}
interface VectorPath {
  readonly windingRule: WindingRule | "NONE";
  readonly data: string;
}
declare type VectorPaths = ReadonlyArray<VectorPath>;
interface LetterSpacing {
  readonly value: number;
  readonly unit: "PIXELS" | "PERCENT";
}
declare type LineHeight =
  | {
      readonly value: number;
      readonly unit: "PIXELS" | "PERCENT";
    }
  | {
      readonly unit: "AUTO";
    };
declare type LeadingTrim = "CAP_HEIGHT" | "NONE";
declare type HyperlinkTarget = {
  type: "URL" | "NODE";
  value: string;
};
declare type TextListOptions = {
  type: "ORDERED" | "UNORDERED" | "NONE";
};
declare type BlendMode =
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
declare type MaskType = "ALPHA" | "VECTOR" | "LUMINANCE";
interface Font {
  fontName: FontName;
}
declare type TextStyleOverrideType = {
  type: "SEMANTIC_ITALIC" | "SEMANTIC_WEIGHT" | "HYPERLINK" | "TEXT_DECORATION";
};
interface StyledTextSegment {
  characters: string;
  start: number;
  end: number;
  fontSize: number;
  fontName: FontName;
  fontWeight: number;
  textDecoration: TextDecoration;
  textCase: TextCase;
  lineHeight: LineHeight;
  letterSpacing: LetterSpacing;
  fills: Paint[];
  textStyleId: string;
  fillStyleId: string;
  listOptions: TextListOptions;
  indentation: number;
  hyperlink: HyperlinkTarget | null;
  openTypeFeatures: {
    readonly [feature in OpenTypeFeature]: boolean;
  };
  boundVariables?: {
    [field in Exclude<
      VariableBindableTextField,
      "paragraphSpacing" | "paragraphIndent"
    >]?: VariableAlias;
  };
  textStyleOverrides: TextStyleOverrideType[];
}
declare type Reaction = {
  action?: Action;
  actions?: Action[];
  trigger: Trigger | null;
};
declare type VariableDataType =
  | "BOOLEAN"
  | "FLOAT"
  | "STRING"
  | "VARIABLE_ALIAS"
  | "COLOR"
  | "EXPRESSION";
declare type ExpressionFunction =
  | "ADDITION"
  | "SUBTRACTION"
  | "MULTIPLICATION"
  | "DIVISION"
  | "EQUALS"
  | "NOT_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "AND"
  | "OR"
  | "VAR_MODE_LOOKUP"
  | "NEGATE"
  | "NOT";
interface Expression {
  expressionFunction: ExpressionFunction;
  expressionArguments: VariableData[];
}
declare type VariableValueWithExpression = VariableValue | Expression;
interface VariableData {
  type?: VariableDataType;
  resolvedType?: VariableResolvedDataType;
  value?: VariableValueWithExpression;
}
declare type ConditionalBlock = {
  condition?: VariableData;
  actions: Action[];
};
declare type DevStatus = {
  type: "READY_FOR_DEV" | "COMPLETED";
  description?: string;
} | null;
declare type Action =
  | {
      readonly type: "BACK" | "CLOSE";
    }
  | {
      readonly type: "URL";
      url: string;
      openInNewTab?: boolean;
    }
  | {
      readonly type: "UPDATE_MEDIA_RUNTIME";
      readonly destinationId: string | null;
      readonly mediaAction:
        | "PLAY"
        | "PAUSE"
        | "TOGGLE_PLAY_PAUSE"
        | "MUTE"
        | "UNMUTE"
        | "TOGGLE_MUTE_UNMUTE";
    }
  | {
      readonly type: "UPDATE_MEDIA_RUNTIME";
      readonly destinationId?: string | null;
      readonly mediaAction: "SKIP_FORWARD" | "SKIP_BACKWARD";
      readonly amountToSkip: number;
    }
  | {
      readonly type: "UPDATE_MEDIA_RUNTIME";
      readonly destinationId?: string | null;
      readonly mediaAction: "SKIP_TO";
      readonly newTimestamp: number;
    }
  | {
      readonly type: "SET_VARIABLE";
      readonly variableId: string | null;
      readonly variableValue?: VariableData;
    }
  | {
      readonly type: "SET_VARIABLE_MODE";
      readonly variableCollectionId: string | null;
      readonly variableModeId: string | null;
    }
  | {
      readonly type: "CONDITIONAL";
      readonly conditionalBlocks: ConditionalBlock[];
    }
  | {
      readonly type: "NODE";
      readonly destinationId: string | null;
      readonly navigation: Navigation;
      readonly transition: Transition | null;
      readonly preserveScrollPosition?: boolean;
      readonly overlayRelativePosition?: Vector;
      readonly resetVideoPosition?: boolean;
      readonly resetScrollPosition?: boolean;
      readonly resetInteractiveComponents?: boolean;
    };
interface SimpleTransition {
  readonly type: "DISSOLVE" | "SMART_ANIMATE" | "SCROLL_ANIMATE";
  readonly easing: Easing;
  readonly duration: number;
}
interface DirectionalTransition {
  readonly type: "MOVE_IN" | "MOVE_OUT" | "PUSH" | "SLIDE_IN" | "SLIDE_OUT";
  readonly direction: "LEFT" | "RIGHT" | "TOP" | "BOTTOM";
  readonly matchLayers: boolean;
  readonly easing: Easing;
  readonly duration: number;
}
declare type Transition = SimpleTransition | DirectionalTransition;
declare type Trigger =
  | {
      readonly type: "ON_CLICK" | "ON_HOVER" | "ON_PRESS" | "ON_DRAG";
    }
  | {
      readonly type: "AFTER_TIMEOUT";
      readonly timeout: number;
    }
  | {
      readonly type: "MOUSE_UP" | "MOUSE_DOWN";
      readonly delay: number;
    }
  | {
      readonly type: "MOUSE_ENTER" | "MOUSE_LEAVE";
      readonly delay: number;
      readonly deprecatedVersion: boolean;
    }
  | {
      readonly type: "ON_KEY_DOWN";
      readonly device:
        | "KEYBOARD"
        | "XBOX_ONE"
        | "PS4"
        | "SWITCH_PRO"
        | "UNKNOWN_CONTROLLER";
      readonly keyCodes: ReadonlyArray<number>;
    }
  | {
      readonly type: "ON_MEDIA_HIT";
      readonly mediaHitTime: number;
    }
  | {
      readonly type: "ON_MEDIA_END";
    };
declare type Navigation =
  | "NAVIGATE"
  | "SWAP"
  | "OVERLAY"
  | "SCROLL_TO"
  | "CHANGE_TO";
interface Easing {
  readonly type:
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
  readonly easingFunctionCubicBezier?: EasingFunctionBezier;
  readonly easingFunctionSpring?: EasingFunctionSpring;
}
interface EasingFunctionBezier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface EasingFunctionSpring {
  mass: number;
  stiffness: number;
  damping: number;
  initialVelocity: number;
}
declare type OverflowDirection = "NONE" | "HORIZONTAL" | "VERTICAL" | "BOTH";
declare type OverlayPositionType =
  | "CENTER"
  | "TOP_LEFT"
  | "TOP_CENTER"
  | "TOP_RIGHT"
  | "BOTTOM_LEFT"
  | "BOTTOM_CENTER"
  | "BOTTOM_RIGHT"
  | "MANUAL";
declare type OverlayBackground =
  | {
      readonly type: "NONE";
    }
  | {
      readonly type: "SOLID_COLOR";
      readonly color: RGBA;
    };
declare type OverlayBackgroundInteraction = "NONE" | "CLOSE_ON_CLICK_OUTSIDE";
declare type PublishStatus = "UNPUBLISHED" | "CURRENT" | "CHANGED";
interface ConnectorEndpointPosition {
  position: {
    x: number;
    y: number;
  };
}
interface ConnectorEndpointPositionAndEndpointNodeId {
  position: {
    x: number;
    y: number;
  };
  endpointNodeId: string;
}
interface ConnectorEndpointEndpointNodeIdAndMagnet {
  endpointNodeId: string;
  magnet: "NONE" | "AUTO" | "TOP" | "LEFT" | "BOTTOM" | "RIGHT" | "CENTER";
}
declare type ConnectorEndpoint =
  | ConnectorEndpointPosition
  | ConnectorEndpointEndpointNodeIdAndMagnet
  | ConnectorEndpointPositionAndEndpointNodeId;
declare type ConnectorStrokeCap =
  | "NONE"
  | "ARROW_EQUILATERAL"
  | "ARROW_LINES"
  | "TRIANGLE_FILLED"
  | "DIAMOND_FILLED"
  | "CIRCLE_FILLED";
interface BaseNodeMixin extends PluginDataMixin, DevResourcesMixin {
  readonly id: string;
  readonly parent: (BaseNode & ChildrenMixin) | null;
  name: string;
  readonly removed: boolean;
  toString(): string;
  remove(): void;
  setRelaunchData(data: { [command: string]: string }): void;
  getRelaunchData(): {
    [command: string]: string;
  };
  readonly isAsset: boolean;
  getCSSAsync(): Promise<{
    [key: string]: string;
  }>;
}
interface PluginDataMixin {
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
  getPluginDataKeys(): string[];
  getSharedPluginData(namespace: string, key: string): string;
  setSharedPluginData(namespace: string, key: string, value: string): void;
  getSharedPluginDataKeys(namespace: string): string[];
}
interface DevResourcesMixin {
  getDevResourcesAsync(options?: {
    includeChildren?: boolean;
  }): Promise<DevResourceWithNodeId[]>;
  addDevResourceAsync(url: string, name?: string): Promise<void>;
  editDevResourceAsync(
    currentUrl: string,
    newValue: {
      name?: string;
      url?: string;
    }
  ): Promise<void>;
  deleteDevResourceAsync(url: string): Promise<void>;
  setDevResourcePreviewAsync(
    url: string,
    preview: PlainTextElement
  ): Promise<void>;
}
interface DevStatusMixin {
  devStatus: DevStatus;
}
interface SceneNodeMixin extends ExplicitVariableModesMixin {
  visible: boolean;
  locked: boolean;
  readonly stuckNodes: SceneNode[];
  readonly attachedConnectors: ConnectorNode[];
  componentPropertyReferences:
    | {
        [nodeProperty in "visible" | "characters" | "mainComponent"]?: string;
      }
    | null;
  readonly boundVariables?: {
    readonly [field in VariableBindableNodeField]?: VariableAlias;
  } & {
    readonly [field in VariableBindableTextField]?: VariableAlias[];
  } & {
    readonly fills?: VariableAlias[];
    readonly strokes?: VariableAlias[];
    readonly effects?: VariableAlias[];
    readonly layoutGrids?: VariableAlias[];
    readonly componentProperties?: {
      readonly [propertyName: string]: VariableAlias;
    };
    readonly textRangeFills?: VariableAlias[];
  };
  setBoundVariable(
    field: VariableBindableNodeField | VariableBindableTextField,
    variableId: string | null
  ): void;
  setBoundVariable(
    field: VariableBindableNodeField | VariableBindableTextField,
    variable: Variable | null
  ): void;
  readonly inferredVariables?: {
    readonly [field in VariableBindableNodeField]?: VariableAlias[];
  } & {
    readonly fills?: VariableAlias[][];
    readonly strokes?: VariableAlias[][];
  };
  resolvedVariableModes: {
    [collectionId: string]: string;
  };
}
declare type VariableBindableNodeField =
  | "height"
  | "width"
  | "characters"
  | "itemSpacing"
  | "paddingLeft"
  | "paddingRight"
  | "paddingTop"
  | "paddingBottom"
  | "visible"
  | "topLeftRadius"
  | "topRightRadius"
  | "bottomLeftRadius"
  | "bottomRightRadius"
  | "minWidth"
  | "maxWidth"
  | "minHeight"
  | "maxHeight"
  | "counterAxisSpacing"
  | "strokeWeight"
  | "strokeTopWeight"
  | "strokeRightWeight"
  | "strokeBottomWeight"
  | "strokeLeftWeight"
  | "opacity";
declare type VariableBindableTextField =
  | "fontFamily"
  | "fontSize"
  | "fontStyle"
  | "fontWeight"
  | "letterSpacing"
  | "lineHeight"
  | "paragraphSpacing"
  | "paragraphIndent";
declare type VariableBindablePaintField = "color";
declare type VariableBindablePaintStyleField = "paints";
declare type VariableBindableColorStopField = "color";
declare type VariableBindableEffectField =
  | "color"
  | "radius"
  | "spread"
  | "offsetX"
  | "offsetY";
declare type VariableBindableEffectStyleField = "effects";
declare type VariableBindableLayoutGridField =
  | "sectionSize"
  | "count"
  | "offset"
  | "gutterSize";
declare type VariableBindableGridStyleField = "layoutGrids";
declare type VariableBindableComponentPropertyField = "value";
interface StickableMixin {
  stuckTo: SceneNode | null;
}
interface ChildrenMixin {
  readonly children: ReadonlyArray<SceneNode>;
  appendChild(child: SceneNode): void;
  insertChild(index: number, child: SceneNode): void;
  findChildren(callback?: (node: SceneNode) => boolean): SceneNode[];
  findChild(callback: (node: SceneNode) => boolean): SceneNode | null;
  findAll(callback?: (node: SceneNode) => boolean): SceneNode[];
  findOne(callback: (node: SceneNode) => boolean): SceneNode | null;
  findAllWithCriteria<T extends NodeType[]>(
    criteria: FindAllCriteria<T>
  ): Array<
    {
      type: T[number];
    } & SceneNode
  >;
  findWidgetNodesByWidgetId(widgetId: string): Array<WidgetNode>;
}
interface ConstraintMixin {
  constraints: Constraints;
}
interface DimensionAndPositionMixin {
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  relativeTransform: Transform;
  readonly absoluteTransform: Transform;
  readonly absoluteBoundingBox: Rect | null;
}
interface LayoutMixin
  extends DimensionAndPositionMixin,
    AutoLayoutChildrenMixin {
  readonly absoluteRenderBounds: Rect | null;
  constrainProportions: boolean;
  rotation: number;
  layoutSizingHorizontal: "FIXED" | "HUG" | "FILL";
  layoutSizingVertical: "FIXED" | "HUG" | "FILL";
  resize(width: number, height: number): void;
  resizeWithoutConstraints(width: number, height: number): void;
  rescale(scale: number): void;
}
interface BlendMixin extends MinimalBlendMixin {
  isMask: boolean;
  maskType: MaskType;
  effects: ReadonlyArray<Effect>;
  effectStyleId: string;
  setEffectStyleIdAsync(styleId: string): Promise<void>;
}
interface ContainerMixin {
  expanded: boolean;
}
interface DeprecatedBackgroundMixin {
  backgrounds: ReadonlyArray<Paint>;
  backgroundStyleId: string;
}
declare type StrokeCap =
  | "NONE"
  | "ROUND"
  | "SQUARE"
  | "ARROW_LINES"
  | "ARROW_EQUILATERAL";
declare type StrokeJoin = "MITER" | "BEVEL" | "ROUND";
declare type HandleMirroring = "NONE" | "ANGLE" | "ANGLE_AND_LENGTH";
interface AutoLayoutMixin {
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
  layoutWrap: "NO_WRAP" | "WRAP";
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
  horizontalPadding: number;
  verticalPadding: number;
  primaryAxisSizingMode: "FIXED" | "AUTO";
  counterAxisSizingMode: "FIXED" | "AUTO";
  primaryAxisAlignItems: "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
  counterAxisAlignItems: "MIN" | "MAX" | "CENTER" | "BASELINE";
  counterAxisAlignContent: "AUTO" | "SPACE_BETWEEN";
  itemSpacing: number;
  counterAxisSpacing: number | null;
  itemReverseZIndex: boolean;
  strokesIncludedInLayout: boolean;
}
interface AutoLayoutChildrenMixin {
  layoutAlign: "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT";
  layoutGrow: number;
  layoutPositioning: "AUTO" | "ABSOLUTE";
}
interface InferredAutoLayoutResult
  extends AutoLayoutChildrenMixin,
    AutoLayoutMixin {}
declare type DetachedInfo =
  | {
      type: "local";
      componentId: string;
    }
  | {
      type: "library";
      componentKey: string;
    };
interface MinimalStrokesMixin {
  strokes: ReadonlyArray<Paint>;
  strokeStyleId: string;
  setStrokeStyleIdAsync(styleId: string): Promise<void>;
  strokeWeight: number | PluginAPI["mixed"];
  strokeJoin: StrokeJoin | PluginAPI["mixed"];
  strokeAlign: "CENTER" | "INSIDE" | "OUTSIDE";
  dashPattern: ReadonlyArray<number>;
  readonly strokeGeometry: VectorPaths;
}
interface IndividualStrokesMixin {
  strokeTopWeight: number;
  strokeBottomWeight: number;
  strokeLeftWeight: number;
  strokeRightWeight: number;
}
interface MinimalFillsMixin {
  fills: ReadonlyArray<Paint> | PluginAPI["mixed"];
  fillStyleId: string | PluginAPI["mixed"];
  setFillStyleIdAsync(styleId: string): Promise<void>;
}
interface GeometryMixin extends MinimalStrokesMixin, MinimalFillsMixin {
  strokeCap: StrokeCap | PluginAPI["mixed"];
  strokeMiterLimit: number;
  outlineStroke(): VectorNode | null;
  readonly fillGeometry: VectorPaths;
}
interface CornerMixin {
  cornerRadius: number | PluginAPI["mixed"];
  cornerSmoothing: number;
}
interface RectangleCornerMixin {
  topLeftRadius: number;
  topRightRadius: number;
  bottomLeftRadius: number;
  bottomRightRadius: number;
}
interface ExportMixin {
  exportSettings: ReadonlyArray<ExportSettings>;
  exportAsync(settings?: ExportSettings): Promise<Uint8Array>;
  exportAsync(settings: ExportSettingsSVGString): Promise<string>;
  exportAsync(settings: ExportSettingsREST): Promise<Object>;
}
interface FramePrototypingMixin {
  overflowDirection: OverflowDirection;
  numberOfFixedChildren: number;
  readonly overlayPositionType: OverlayPositionType;
  readonly overlayBackground: OverlayBackground;
  readonly overlayBackgroundInteraction: OverlayBackgroundInteraction;
}
interface VectorLikeMixin {
  vectorNetwork: VectorNetwork;
  setVectorNetworkAsync(vectorNetwork: VectorNetwork): Promise<void>;
  vectorPaths: VectorPaths;
  handleMirroring: HandleMirroring | PluginAPI["mixed"];
}
interface ReactionMixin {
  reactions: ReadonlyArray<Reaction>;
  setReactionsAsync(reactions: Array<Reaction>): Promise<void>;
}
interface DocumentationLink {
  readonly uri: string;
}
interface PublishableMixin {
  description: string;
  documentationLinks: ReadonlyArray<DocumentationLink>;
  readonly remote: boolean;
  readonly key: string;
  getPublishStatusAsync(): Promise<PublishStatus>;
}
interface DefaultShapeMixin
  extends BaseNodeMixin,
    SceneNodeMixin,
    ReactionMixin,
    BlendMixin,
    GeometryMixin,
    LayoutMixin,
    ExportMixin {}
interface BaseFrameMixin
  extends BaseNodeMixin,
    SceneNodeMixin,
    ChildrenMixin,
    ContainerMixin,
    DeprecatedBackgroundMixin,
    GeometryMixin,
    CornerMixin,
    RectangleCornerMixin,
    BlendMixin,
    ConstraintMixin,
    LayoutMixin,
    ExportMixin,
    IndividualStrokesMixin,
    AutoLayoutMixin,
    AnnotationsMixin,
    DevStatusMixin {
  readonly detachedInfo: DetachedInfo | null;
  layoutGrids: ReadonlyArray<LayoutGrid>;
  gridStyleId: string;
  setGridStyleIdAsync(styleId: string): Promise<void>;
  clipsContent: boolean;
  guides: ReadonlyArray<Guide>;
  inferredAutoLayout: InferredAutoLayoutResult | null;
}
interface DefaultFrameMixin
  extends BaseFrameMixin,
    FramePrototypingMixin,
    ReactionMixin {}
interface OpaqueNodeMixin
  extends BaseNodeMixin,
    SceneNodeMixin,
    ExportMixin,
    DimensionAndPositionMixin {}
interface MinimalBlendMixin {
  opacity: number;
  blendMode: BlendMode;
}
interface Annotation {
  readonly label?: string;
  readonly properties?: ReadonlyArray<AnnotationProperty>;
}
interface AnnotationProperty {
  readonly type: AnnotationPropertyType;
}
declare type AnnotationPropertyType =
  | "width"
  | "height"
  | "maxWidth"
  | "minWidth"
  | "maxHeight"
  | "minHeight"
  | "fills"
  | "strokes"
  | "effects"
  | "strokeWeight"
  | "cornerRadius"
  | "textStyleId"
  | "textAlignHorizontal"
  | "fontFamily"
  | "fontStyle"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "itemSpacing"
  | "padding"
  | "layoutMode"
  | "alignItems"
  | "opacity"
  | "mainComponent";
interface AnnotationsMixin {
  annotations: ReadonlyArray<Annotation>;
}
interface Measurement {
  id: string;
  start: {
    node: SceneNode;
    side: MeasurementSide;
  };
  end: {
    node: SceneNode;
    side: MeasurementSide;
  };
  offset: MeasurementOffset;
}
declare type MeasurementSide = "TOP" | "RIGHT" | "BOTTOM" | "LEFT";
declare type MeasurementOffset =
  | {
      type: "INNER";
      relative: number;
    }
  | {
      type: "OUTER";
      fixed: number;
    };
interface MeasurementsMixin {
  getMeasurements(): Measurement[];
  getMeasurementsForNode(node: SceneNode): Measurement[];
  addMeasurement(
    start: {
      node: SceneNode;
      side: MeasurementSide;
    },
    end: {
      node: SceneNode;
      side: MeasurementSide;
    },
    options?: {
      offset?: MeasurementOffset;
    }
  ): Measurement;
  editMeasurement(
    id: string,
    newValue: {
      offset: MeasurementOffset;
    }
  ): Measurement;
  deleteMeasurement(id: string): void;
}
interface VariantMixin {
  readonly variantProperties: {
    [property: string]: string;
  } | null;
}
interface ComponentPropertiesMixin {
  readonly componentPropertyDefinitions: ComponentPropertyDefinitions;
  addComponentProperty(
    propertyName: string,
    type: ComponentPropertyType,
    defaultValue: string | boolean,
    options?: ComponentPropertyOptions
  ): string;
  editComponentProperty(
    propertyName: string,
    newValue: {
      name?: string;
      defaultValue?: string | boolean;
      preferredValues?: InstanceSwapPreferredValue[];
    }
  ): string;
  deleteComponentProperty(propertyName: string): void;
}
interface NonResizableTextMixin {
  readonly hasMissingFont: boolean;
  paragraphIndent: number;
  paragraphSpacing: number;
  listSpacing: number;
  hangingPunctuation: boolean;
  hangingList: boolean;
  fontSize: number | PluginAPI["mixed"];
  fontName: FontName | PluginAPI["mixed"];
  readonly fontWeight: number | PluginAPI["mixed"];
  textCase: TextCase | PluginAPI["mixed"];
  readonly openTypeFeatures:
    | {
        readonly [feature in OpenTypeFeature]: boolean;
      }
    | PluginAPI["mixed"];
  textDecoration: TextDecoration | PluginAPI["mixed"];
  letterSpacing: LetterSpacing | PluginAPI["mixed"];
  lineHeight: LineHeight | PluginAPI["mixed"];
  leadingTrim: LeadingTrim | PluginAPI["mixed"];
  hyperlink: HyperlinkTarget | null | PluginAPI["mixed"];
  characters: string;
  insertCharacters(
    start: number,
    characters: string,
    useStyle?: "BEFORE" | "AFTER"
  ): void;
  deleteCharacters(start: number, end: number): void;
  getRangeFontSize(start: number, end: number): number | PluginAPI["mixed"];
  setRangeFontSize(start: number, end: number, value: number): void;
  getRangeFontName(start: number, end: number): FontName | PluginAPI["mixed"];
  setRangeFontName(start: number, end: number, value: FontName): void;
  getRangeFontWeight(start: number, end: number): number | PluginAPI["mixed"];
  getRangeAllFontNames(start: number, end: number): FontName[];
  getRangeTextCase(start: number, end: number): TextCase | PluginAPI["mixed"];
  setRangeTextCase(start: number, end: number, value: TextCase): void;
  getRangeOpenTypeFeatures(
    start: number,
    end: number
  ):
    | {
        readonly [feature in OpenTypeFeature]: boolean;
      }
    | PluginAPI["mixed"];
  getRangeTextDecoration(
    start: number,
    end: number
  ): TextDecoration | PluginAPI["mixed"];
  setRangeTextDecoration(
    start: number,
    end: number,
    value: TextDecoration
  ): void;
  getRangeLetterSpacing(
    start: number,
    end: number
  ): LetterSpacing | PluginAPI["mixed"];
  setRangeLetterSpacing(start: number, end: number, value: LetterSpacing): void;
  getRangeLineHeight(
    start: number,
    end: number
  ): LineHeight | PluginAPI["mixed"];
  setRangeLineHeight(start: number, end: number, value: LineHeight): void;
  getRangeHyperlink(
    start: number,
    end: number
  ): HyperlinkTarget | null | PluginAPI["mixed"];
  setRangeHyperlink(
    start: number,
    end: number,
    value: HyperlinkTarget | null
  ): void;
  getRangeFills(start: number, end: number): Paint[] | PluginAPI["mixed"];
  setRangeFills(start: number, end: number, value: Paint[]): void;
  getRangeTextStyleId(start: number, end: number): string | PluginAPI["mixed"];
  setRangeTextStyleIdAsync(
    start: number,
    end: number,
    styleId: string
  ): Promise<void>;
  setRangeTextStyleId(start: number, end: number, value: string): void;
  getRangeFillStyleId(start: number, end: number): string | PluginAPI["mixed"];
  setRangeFillStyleIdAsync(
    start: number,
    end: number,
    styleId: string
  ): Promise<void>;
  setRangeFillStyleId(start: number, end: number, value: string): void;
  getRangeListOptions(
    start: number,
    end: number
  ): TextListOptions | PluginAPI["mixed"];
  setRangeListOptions(start: number, end: number, value: TextListOptions): void;
  getRangeIndentation(start: number, end: number): number | PluginAPI["mixed"];
  setRangeIndentation(start: number, end: number, value: number): void;
  getRangeBoundVariable(
    start: number,
    end: number,
    field: Exclude<
      VariableBindableTextField,
      "paragraphSpacing" | "paragraphIndent"
    >
  ): number | PluginAPI["mixed"];
  setRangeBoundVariable(
    start: number,
    end: number,
    field: Exclude<
      VariableBindableTextField,
      "paragraphSpacing" | "paragraphIndent"
    >,
    variable: Variable | null
  ): void;
  getStyledTextSegments<
    StyledTextSegmentFields extends (keyof Omit<
      StyledTextSegment,
      "characters" | "start" | "end"
    >)[],
  >(
    fields: StyledTextSegmentFields,
    start?: number,
    end?: number
  ): Array<
    Pick<
      StyledTextSegment,
      StyledTextSegmentFields[number] | "characters" | "start" | "end"
    >
  >;
}
interface TextSublayerNode extends NonResizableTextMixin, MinimalFillsMixin {}
interface DocumentNode extends BaseNodeMixin {
  readonly type: "DOCUMENT";
  readonly children: ReadonlyArray<PageNode>;
  readonly documentColorProfile: "LEGACY" | "SRGB" | "DISPLAY_P3";
  appendChild(child: PageNode): void;
  insertChild(index: number, child: PageNode): void;
  findChildren(callback?: (node: PageNode) => boolean): Array<PageNode>;
  findChild(callback: (node: PageNode) => boolean): PageNode | null;
  findAll(
    callback?: (node: PageNode | SceneNode) => boolean
  ): Array<PageNode | SceneNode>;
  findOne(
    callback: (node: PageNode | SceneNode) => boolean
  ): PageNode | SceneNode | null;
  findAllWithCriteria<T extends NodeType[]>(
    criteria: FindAllCriteria<T>
  ): Array<
    {
      type: T[number];
    } & (PageNode | SceneNode)
  >;
  findWidgetNodesByWidgetId(widgetId: string): Array<WidgetNode>;
}
interface ExplicitVariableModesMixin {
  explicitVariableModes: {
    [collectionId: string]: string;
  };
  clearExplicitVariableModeForCollection(collectionId: string): void;
  clearExplicitVariableModeForCollection(collection: VariableCollection): void;
  setExplicitVariableModeForCollection(
    collectionId: string,
    modeId: string
  ): void;
  setExplicitVariableModeForCollection(
    collection: VariableCollection,
    modeId: string
  ): void;
}
interface PageNode
  extends BaseNodeMixin,
    ChildrenMixin,
    ExportMixin,
    ExplicitVariableModesMixin,
    MeasurementsMixin {
  readonly type: "PAGE";
  clone(): PageNode;
  guides: ReadonlyArray<Guide>;
  selection: ReadonlyArray<SceneNode>;
  selectedTextRange: {
    node: TextNode;
    start: number;
    end: number;
  } | null;
  flowStartingPoints: ReadonlyArray<{
    nodeId: string;
    name: string;
  }>;
  backgrounds: ReadonlyArray<Paint>;
  prototypeBackgrounds: ReadonlyArray<Paint>;
  readonly prototypeStartNode:
    | FrameNode
    | GroupNode
    | ComponentNode
    | InstanceNode
    | null;
  loadAsync(): Promise<void>;
  on(type: "nodechange", callback: (event: NodeChangeEvent) => void): void;
  once(type: "nodechange", callback: (event: NodeChangeEvent) => void): void;
  off(type: "nodechange", callback: (event: NodeChangeEvent) => void): void;
}
interface FrameNode extends DefaultFrameMixin {
  readonly type: "FRAME";
  clone(): FrameNode;
}
interface GroupNode
  extends BaseNodeMixin,
    SceneNodeMixin,
    ReactionMixin,
    ChildrenMixin,
    ContainerMixin,
    DeprecatedBackgroundMixin,
    BlendMixin,
    LayoutMixin,
    ExportMixin {
  readonly type: "GROUP";
  clone(): GroupNode;
}
interface SliceNode
  extends BaseNodeMixin,
    SceneNodeMixin,
    LayoutMixin,
    ExportMixin {
  readonly type: "SLICE";
  clone(): SliceNode;
}
interface RectangleNode
  extends DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    RectangleCornerMixin,
    IndividualStrokesMixin,
    AnnotationsMixin {
  readonly type: "RECTANGLE";
  clone(): RectangleNode;
}
interface LineNode
  extends DefaultShapeMixin,
    ConstraintMixin,
    AnnotationsMixin {
  readonly type: "LINE";
  clone(): LineNode;
}
interface EllipseNode
  extends DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    AnnotationsMixin {
  readonly type: "ELLIPSE";
  clone(): EllipseNode;
  arcData: ArcData;
}
interface PolygonNode
  extends DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    AnnotationsMixin {
  readonly type: "POLYGON";
  clone(): PolygonNode;
  pointCount: number;
}
interface StarNode
  extends DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    AnnotationsMixin {
  readonly type: "STAR";
  clone(): StarNode;
  pointCount: number;
  innerRadius: number;
}
interface VectorNode
  extends DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    VectorLikeMixin,
    AnnotationsMixin {
  readonly type: "VECTOR";
  clone(): VectorNode;
}
interface TextNode
  extends DefaultShapeMixin,
    ConstraintMixin,
    NonResizableTextMixin,
    AnnotationsMixin {
  readonly type: "TEXT";
  clone(): TextNode;
  textAlignHorizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textAlignVertical: "TOP" | "CENTER" | "BOTTOM";
  textAutoResize: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE";
  textTruncation: "DISABLED" | "ENDING";
  maxLines: number | null;
  autoRename: boolean;
  textStyleId: string | PluginAPI["mixed"];
  setTextStyleIdAsync(styleId: string): Promise<void>;
}
declare type ComponentPropertyType =
  | "BOOLEAN"
  | "TEXT"
  | "INSTANCE_SWAP"
  | "VARIANT";
declare type InstanceSwapPreferredValue = {
  type: "COMPONENT" | "COMPONENT_SET";
  key: string;
};
declare type ComponentPropertyOptions = {
  preferredValues?: InstanceSwapPreferredValue[];
};
declare type ComponentPropertyDefinitions = {
  [propertyName: string]: {
    type: ComponentPropertyType;
    defaultValue: string | boolean;
    preferredValues?: InstanceSwapPreferredValue[];
    variantOptions?: string[];
  };
};
interface ComponentSetNode
  extends BaseFrameMixin,
    PublishableMixin,
    ComponentPropertiesMixin {
  readonly type: "COMPONENT_SET";
  clone(): ComponentSetNode;
  readonly defaultVariant: ComponentNode;
  readonly variantGroupProperties: {
    [property: string]: {
      values: string[];
    };
  };
}
interface ComponentNode
  extends DefaultFrameMixin,
    PublishableMixin,
    VariantMixin,
    ComponentPropertiesMixin {
  readonly type: "COMPONENT";
  clone(): ComponentNode;
  createInstance(): InstanceNode;
  getInstancesAsync(): Promise<InstanceNode[]>;
  readonly instances: InstanceNode[];
}
declare type ComponentProperties = {
  [propertyName: string]: {
    type: ComponentPropertyType;
    value: string | boolean;
    preferredValues?: InstanceSwapPreferredValue[];
    readonly boundVariables?: {
      [field in VariableBindableComponentPropertyField]?: VariableAlias;
    };
  };
};
interface InstanceNode extends DefaultFrameMixin, VariantMixin {
  readonly type: "INSTANCE";
  clone(): InstanceNode;
  getMainComponentAsync(): Promise<ComponentNode | null>;
  mainComponent: ComponentNode | null;
  swapComponent(componentNode: ComponentNode): void;
  setProperties(properties: {
    [propertyName: string]: string | boolean | VariableAlias;
  }): void;
  readonly componentProperties: ComponentProperties;
  detachInstance(): FrameNode;
  scaleFactor: number;
  readonly exposedInstances: InstanceNode[];
  isExposedInstance: boolean;
  readonly overrides: {
    id: string;
    overriddenFields: NodeChangeProperty[];
  }[];
  resetOverrides(): void;
}
interface BooleanOperationNode
  extends DefaultShapeMixin,
    ChildrenMixin,
    CornerMixin,
    ContainerMixin {
  readonly type: "BOOLEAN_OPERATION";
  clone(): BooleanOperationNode;
  booleanOperation: "UNION" | "INTERSECT" | "SUBTRACT" | "EXCLUDE";
}
interface StickyNode
  extends OpaqueNodeMixin,
    MinimalFillsMixin,
    MinimalBlendMixin {
  readonly type: "STICKY";
  readonly text: TextSublayerNode;
  authorVisible: boolean;
  authorName: string;
  isWideWidth: boolean;
  clone(): StickyNode;
}
interface StampNode extends DefaultShapeMixin, ConstraintMixin, StickableMixin {
  readonly type: "STAMP";
  clone(): StampNode;
}
interface TableNode
  extends OpaqueNodeMixin,
    MinimalFillsMixin,
    MinimalBlendMixin {
  readonly type: "TABLE";
  clone(): TableNode;
  readonly numRows: number;
  readonly numColumns: number;
  cellAt(rowIndex: number, columnIndex: number): TableCellNode;
  insertRow(rowIndex: number): void;
  insertColumn(columnIndex: number): void;
  removeRow(rowIndex: number): void;
  removeColumn(columnIndex: number): void;
  moveRow(fromIndex: number, toIndex: number): void;
  moveColumn(fromIndex: number, toIndex: number): void;
  resizeRow(rowIndex: number, height: number): void;
  resizeColumn(columnIndex: number, width: number): void;
}
interface TableCellNode extends MinimalFillsMixin {
  readonly type: "TABLE_CELL";
  readonly text: TextSublayerNode;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly toString: string;
  readonly parent: TableNode;
  readonly height: number;
  readonly width: number;
}
interface HighlightNode
  extends DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    VectorLikeMixin,
    StickableMixin {
  readonly type: "HIGHLIGHT";
  clone(): HighlightNode;
}
interface WashiTapeNode extends DefaultShapeMixin, StickableMixin {
  readonly type: "WASHI_TAPE";
  clone(): WashiTapeNode;
}
interface ShapeWithTextNode
  extends OpaqueNodeMixin,
    MinimalFillsMixin,
    MinimalBlendMixin,
    MinimalStrokesMixin {
  readonly type: "SHAPE_WITH_TEXT";
  shapeType:
    | "SQUARE"
    | "ELLIPSE"
    | "ROUNDED_RECTANGLE"
    | "DIAMOND"
    | "TRIANGLE_UP"
    | "TRIANGLE_DOWN"
    | "PARALLELOGRAM_RIGHT"
    | "PARALLELOGRAM_LEFT"
    | "ENG_DATABASE"
    | "ENG_QUEUE"
    | "ENG_FILE"
    | "ENG_FOLDER"
    | "TRAPEZOID"
    | "PREDEFINED_PROCESS"
    | "SHIELD"
    | "DOCUMENT_SINGLE"
    | "DOCUMENT_MULTIPLE"
    | "MANUAL_INPUT"
    | "HEXAGON"
    | "CHEVRON"
    | "PENTAGON"
    | "OCTAGON"
    | "STAR"
    | "PLUS"
    | "ARROW_LEFT"
    | "ARROW_RIGHT"
    | "SUMMING_JUNCTION"
    | "OR"
    | "SPEECH_BUBBLE"
    | "INTERNAL_STORAGE";
  readonly text: TextSublayerNode;
  readonly cornerRadius?: number;
  rotation: number;
  resize(width: number, height: number): void;
  rescale(scale: number): void;
  clone(): ShapeWithTextNode;
}
interface CodeBlockNode extends OpaqueNodeMixin, MinimalBlendMixin {
  readonly type: "CODE_BLOCK";
  code: string;
  codeLanguage:
    | "TYPESCRIPT"
    | "CPP"
    | "RUBY"
    | "CSS"
    | "JAVASCRIPT"
    | "HTML"
    | "JSON"
    | "GRAPHQL"
    | "PYTHON"
    | "GO"
    | "SQL"
    | "SWIFT"
    | "KOTLIN"
    | "RUST"
    | "BASH"
    | "PLAINTEXT"
    | "DART";
  clone(): CodeBlockNode;
}
interface LabelSublayerNode {
  fills: Paint[] | PluginAPI["mixed"];
}
interface ConnectorNode
  extends OpaqueNodeMixin,
    MinimalBlendMixin,
    MinimalStrokesMixin {
  readonly type: "CONNECTOR";
  readonly text: TextSublayerNode;
  readonly textBackground: LabelSublayerNode;
  readonly cornerRadius?: number;
  connectorLineType: "ELBOWED" | "STRAIGHT";
  connectorStart: ConnectorEndpoint;
  connectorEnd: ConnectorEndpoint;
  connectorStartStrokeCap: ConnectorStrokeCap;
  connectorEndStrokeCap: ConnectorStrokeCap;
  rotation: number;
  clone(): ConnectorNode;
}
declare type VariableResolvedDataType =
  | "BOOLEAN"
  | "COLOR"
  | "FLOAT"
  | "STRING";
interface VariableAlias {
  type: "VARIABLE_ALIAS";
  id: string;
}
declare type VariableValue =
  | boolean
  | string
  | number
  | RGB
  | RGBA
  | VariableAlias;
declare type VariableScope =
  | "ALL_SCOPES"
  | "TEXT_CONTENT"
  | "CORNER_RADIUS"
  | "WIDTH_HEIGHT"
  | "GAP"
  | "ALL_FILLS"
  | "FRAME_FILL"
  | "SHAPE_FILL"
  | "TEXT_FILL"
  | "STROKE_COLOR"
  | "STROKE_FLOAT"
  | "EFFECT_FLOAT"
  | "EFFECT_COLOR"
  | "OPACITY"
  | "FONT_FAMILY"
  | "FONT_STYLE"
  | "FONT_WEIGHT"
  | "FONT_SIZE"
  | "LINE_HEIGHT"
  | "LETTER_SPACING"
  | "PARAGRAPH_SPACING"
  | "PARAGRAPH_INDENT";
declare type CodeSyntaxPlatform = "WEB" | "ANDROID" | "iOS";
interface Variable extends PluginDataMixin {
  readonly id: string;
  name: string;
  description: string;
  hiddenFromPublishing: boolean;
  getPublishStatusAsync(): Promise<PublishStatus>;
  readonly remote: boolean;
  readonly variableCollectionId: string;
  readonly key: string;
  readonly resolvedType: VariableResolvedDataType;
  resolveForConsumer(consumer: SceneNode): {
    value: VariableValue;
    resolvedType: VariableResolvedDataType;
  };
  setValueForMode(modeId: string, newValue: VariableValue): void;
  readonly valuesByMode: {
    [modeId: string]: VariableValue;
  };
  remove(): void;
  scopes: Array<VariableScope>;
  readonly codeSyntax: {
    [platform in CodeSyntaxPlatform]?: string;
  };
  setVariableCodeSyntax(platform: CodeSyntaxPlatform, value: string): void;
  removeVariableCodeSyntax(platform: CodeSyntaxPlatform): void;
}
interface VariableCollection extends PluginDataMixin {
  readonly id: string;
  name: string;
  hiddenFromPublishing: boolean;
  getPublishStatusAsync(): Promise<PublishStatus>;
  readonly remote: boolean;
  readonly modes: Array<{
    modeId: string;
    name: string;
  }>;
  readonly variableIds: string[];
  readonly defaultModeId: string;
  readonly key: string;
  remove(): void;
  removeMode(modeId: string): void;
  addMode(name: string): string;
  renameMode(modeId: string, newName: string): void;
}
interface WidgetNode extends OpaqueNodeMixin, StickableMixin {
  readonly type: "WIDGET";
  readonly widgetId: string;
  readonly widgetSyncedState: {
    [key: string]: any;
  };
  clone(): WidgetNode;
  cloneWidget(
    syncedStateOverrides: {
      [name: string]: any;
    },
    syncedMapOverrides?: {
      [mapName: string]: {
        [key: string]: any;
      };
    }
  ): WidgetNode;
  setWidgetSyncedState(
    syncedState: {
      [name: string]: any;
    },
    syncedMap?: {
      [mapName: string]: {
        [key: string]: any;
      };
    }
  ): void;
}
interface EmbedData {
  srcUrl: string;
  canonicalUrl: string | null;
  title: string | null;
  description: string | null;
  provider: string | null;
}
interface EmbedNode extends OpaqueNodeMixin {
  readonly type: "EMBED";
  readonly embedData: EmbedData;
  clone(): EmbedNode;
}
interface LinkUnfurlData {
  url: string;
  title: string | null;
  description: string | null;
  provider: string | null;
}
interface LinkUnfurlNode extends OpaqueNodeMixin {
  readonly type: "LINK_UNFURL";
  readonly linkUnfurlData: LinkUnfurlData;
  clone(): LinkUnfurlNode;
}
interface MediaData {
  hash: string;
}
interface MediaNode extends OpaqueNodeMixin {
  readonly type: "MEDIA";
  readonly mediaData: MediaData;
  resize(width: number, height: number): void;
  resizeWithoutConstraints(width: number, height: number): void;
  clone(): MediaNode;
}
interface SectionNode
  extends ChildrenMixin,
    MinimalFillsMixin,
    OpaqueNodeMixin,
    DevStatusMixin {
  readonly type: "SECTION";
  sectionContentsHidden: boolean;
  clone(): SectionNode;
  resizeWithoutConstraints(width: number, height: number): void;
}
declare type BaseNode = DocumentNode | PageNode | SceneNode;
declare type SceneNode =
  | SliceNode
  | FrameNode
  | GroupNode
  | ComponentSetNode
  | ComponentNode
  | InstanceNode
  | BooleanOperationNode
  | VectorNode
  | StarNode
  | LineNode
  | EllipseNode
  | PolygonNode
  | RectangleNode
  | TextNode
  | StickyNode
  | ConnectorNode
  | ShapeWithTextNode
  | CodeBlockNode
  | StampNode
  | WidgetNode
  | EmbedNode
  | LinkUnfurlNode
  | MediaNode
  | SectionNode
  | HighlightNode
  | WashiTapeNode
  | TableNode;
declare type NodeType = BaseNode["type"];
declare type StyleType = "PAINT" | "TEXT" | "EFFECT" | "GRID";
declare type InheritedStyleField =
  | "fillStyleId"
  | "strokeStyleId"
  | "backgroundStyleId"
  | "textStyleId"
  | "effectStyleId"
  | "gridStyleId"
  | "strokeStyleId";
interface StyleConsumers {
  node: SceneNode;
  fields: InheritedStyleField[];
}
interface BaseStyleMixin extends PublishableMixin, PluginDataMixin {
  readonly id: string;
  readonly type: StyleType;
  getStyleConsumersAsync(): Promise<StyleConsumers[]>;
  readonly consumers: StyleConsumers[];
  name: string;
  remove(): void;
}
interface PaintStyle extends BaseStyleMixin {
  type: "PAINT";
  paints: ReadonlyArray<Paint>;
  readonly boundVariables?: {
    readonly [field in VariableBindablePaintStyleField]?: VariableAlias[];
  };
}
interface TextStyle extends BaseStyleMixin {
  type: "TEXT";
  fontSize: number;
  textDecoration: TextDecoration;
  fontName: FontName;
  letterSpacing: LetterSpacing;
  lineHeight: LineHeight;
  leadingTrim: LeadingTrim;
  paragraphIndent: number;
  paragraphSpacing: number;
  listSpacing: number;
  hangingPunctuation: boolean;
  hangingList: boolean;
  textCase: TextCase;
  boundVariables?: {
    [field in VariableBindableTextField]?: VariableAlias;
  };
  setBoundVariable(
    field: VariableBindableTextField,
    variable: Variable | null
  ): void;
}
interface EffectStyle extends BaseStyleMixin {
  type: "EFFECT";
  effects: ReadonlyArray<Effect>;
  readonly boundVariables?: {
    readonly [field in VariableBindableEffectStyleField]?: VariableAlias[];
  };
}
interface GridStyle extends BaseStyleMixin {
  type: "GRID";
  layoutGrids: ReadonlyArray<LayoutGrid>;
  readonly boundVariables?: {
    readonly [field in VariableBindableGridStyleField]?: VariableAlias[];
  };
}
declare type BaseStyle = PaintStyle | TextStyle | EffectStyle | GridStyle;
interface Image {
  readonly hash: string;
  getBytesAsync(): Promise<Uint8Array>;
  getSizeAsync(): Promise<{
    width: number;
    height: number;
  }>;
}
interface Video {
  readonly hash: string;
}

interface FindAllCriteria<T extends NodeType[]> {
  types?: T;
  pluginData?: {
    keys?: string[];
  };
  sharedPluginData?: {
    namespace: string;
    keys?: string[];
  };
}
