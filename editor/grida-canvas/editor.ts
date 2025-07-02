import produce from "immer";
import { Action, editor } from ".";
import reducer from "./reducers";
import grida from "@grida/schema";
import { dq } from "@/grida-canvas/query";
import cg from "@grida/cg";
import nid from "./reducers/tools/id";
import type { tokens } from "@grida/tokens";
import type { BitmapEditorBrush } from "@grida/bitmap";
import cmath from "@grida/cmath";
import assert from "assert";
import { domapi } from "./backends/dom";
import { animateTransformTo } from "./animation";
import { TCanvasEventTargetDragGestureState } from "./action";
import iosvg from "@grida/io-svg";
import { io } from "@grida/io";
import { EditorFollowPlugin } from "./plugins/follow";

function resolveNumberChangeValue(
  node: grida.program.nodes.UnknwonNode,
  key: keyof grida.program.nodes.UnknwonNode,
  change: editor.api.NumberChange
): number {
  switch (change.type) {
    case "set":
      return change.value;
    case "delta": {
      if (node[key] === null || node[key] === undefined) {
        throw new Error(`Node ${key} is not set`);
      }
      assert(typeof node[key] === "number", `Node ${key} is not a number`);
      return node[key] + change.value;
    }
    default:
      throw new Error(
        `Invalid number change type: ${(change as editor.api.NumberChange).type}`
      );
  }
}

export class Editor
  implements
    editor.api.IDocumentEditorActions,
    editor.api.ISchemaActions,
    editor.api.INodeChangeActions,
    editor.api.IBrushToolActions,
    editor.api.IPixelGridActions,
    editor.api.IRulerActions,
    editor.api.IGuide2DActions,
    editor.api.ICameraActions,
    editor.api.IEventTargetActions,
    editor.api.IFollowPluginActions
{
  private readonly __pointer_move_throttle_ms: number = 30;
  private listeners: Set<(editor: this, action?: Action) => void>;
  private mstate: editor.state.IEditorState;

  readonly viewport: domapi.DOMViewportApi;
  readonly geometry: dq.GeometryQuery;
  get state(): Readonly<editor.state.IEditorState> {
    return this.mstate;
  }

  constructor(
    viewport_id: string,
    initialState: editor.state.IEditorStateInit,
    instanceConfig: {
      pointer_move_throttle_ms: number;
      onCreate?: (editor: Editor) => void;
    } = { pointer_move_throttle_ms: 30 }
  ) {
    this.mstate = editor.state.init(initialState);
    this.listeners = new Set();
    this.viewport = new domapi.DOMViewportApi(viewport_id);
    this.geometry = new domapi.DOMGeometryQuery(() => this.mstate.transform);
    //
    this.__pointer_move_throttle_ms = instanceConfig.pointer_move_throttle_ms;
    instanceConfig.onCreate?.(this);
  }

  private _locked: boolean = false;

  /**
   * @internal Transaction ID - does not clear on reset.
   */
  private _tid: number = 0;
  public get tid(): number {
    return this._tid;
  }

  /**
   * If the editor is locked, no actions will be dispatched. (unless forced)
   */
  get locked() {
    return this._locked;
  }

  set locked(value: boolean) {
    this._locked = value;
  }

  get debug() {
    return this.mstate.debug;
  }

  set debug(value: boolean) {
    this.reduce((state) => {
      state.debug = value;
      return state;
    });
  }

  public toggleDebug() {
    this.debug = !this.debug;
    return this.debug;
  }

  public reset(
    state: editor.state.IEditorState,
    key: string | undefined = undefined,
    force: boolean = false
  ): number {
    this.dispatch(
      {
        type: "__internal/reset",
        key,
        state,
      },
      force
    );
    return this._tid;
  }

  public archive(): Blob {
    const documentData = {
      version: "0.0.1-beta.1+20250303",
      document: this.getSnapshot().document,
    } satisfies io.JSONDocumentFileModel;

    const blob = new Blob([io.archive.pack(documentData)], {
      type: "application/zip",
    });

    return blob;
  }

  private __createNodeId(): editor.NodeID {
    // TODO: use a instance-wise generator
    return nid();
  }

  public insert(
    payload:
      | {
          id?: string;
          prototype: grida.program.nodes.NodePrototype;
        }
      | {
          document: grida.program.document.IPackedSceneDocument;
        }
  ) {
    this.dispatch({
      type: "insert",
      ...payload,
    });
  }

  public __get_node_siblings(node_id: string): string[] {
    return dq.getSiblings(this.mstate.document_ctx, node_id);
  }

  public __sync_cursors(
    cursors: editor.state.IEditorMultiplayerCursorState["cursors"]
  ) {
    this.reduce((state) => {
      state.cursors = cursors;
      return state;
    });
  }

  public reduce(
    reducer: (
      state: editor.state.IEditorState
    ) => Readonly<editor.state.IEditorState>
  ) {
    this.mstate = produce(this.mstate, reducer);
    this._tid++;
    this.listeners.forEach((l) => l?.(this));
  }

  public dispatch(action: Action, force: boolean = false) {
    if (this._locked && !force) return;
    this.mstate = reducer(this.mstate, action);
    this._tid++;
    this.listeners.forEach((l) => l(this, action));
  }

  public subscribe(fn: (editor: this, action?: Action) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public subscribeWithSelector<T>(
    selector: (state: editor.state.IEditorState) => T,
    listener: (editor: this, selected: T, previous: T, action?: Action) => void,
    isEqual: (a: T, b: T) => boolean = Object.is
  ): () => void {
    let previous = selector(this.mstate);

    const wrapped = (_: this, action?: Action) => {
      const next = selector(this.mstate);
      if (!isEqual(previous, next)) {
        const prev = previous;
        // previous is assigned before invoking the listener, preventing recursive dispatch loops
        // [1]
        previous = next;
        // [2]
        listener(this, next, prev, action);
      }
    };

    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }

  public getSnapshot(): Readonly<editor.state.IEditorState> {
    return this.mstate;
  }

  public getJson(): unknown {
    return JSON.parse(JSON.stringify(this.mstate));
  }

  public getDocumentJson(): unknown {
    return JSON.parse(JSON.stringify(this.mstate.document));
  }

  // #region IDocumentEditorActions implementation
  public loadScene(scene_id: string) {
    this.dispatch({
      type: "load",
      scene: scene_id,
    });
  }

  public createScene(scene?: grida.program.document.SceneInit) {
    this.dispatch({
      type: "scenes/new",
      scene: scene,
    });
  }

  public deleteScene(scene_id: string) {
    this.dispatch({
      type: "scenes/delete",
      scene: scene_id,
    });
  }

  public duplicateScene(scene_id: string) {
    this.dispatch({
      type: "scenes/duplicate",
      scene: scene_id,
    });
  }

  public renameScene(scene_id: string, name: string) {
    this.dispatch({
      type: "scenes/change/name",
      scene: scene_id,
      name,
    });
  }

  public changeSceneBackground(
    scene_id: string,
    backgroundColor: grida.program.document.ISceneBackground["backgroundColor"]
  ) {
    this.dispatch({
      type: "scenes/change/background-color",
      scene: scene_id,
      backgroundColor,
    });
  }

  async createImage(
    src: string
  ): Promise<Readonly<grida.program.document.ImageRef>> {
    const res = await fetch(src);
    const blob = await res.blob();
    const bytes = await blob.arrayBuffer();
    const type = blob.type;

    const { width, height } = await new Promise<{
      width: number;
      height: number;
    }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = src;
    });

    const ref: grida.program.document.ImageRef = {
      url: src,
      width,
      height,
      bytes: bytes.byteLength,
      type: type as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
    };

    this.reduce((state) => {
      state.document.images[src] = ref;
      return state;
    });

    return ref;
  }

  setTool(tool: editor.state.ToolMode) {
    this.dispatch({
      type: "surface/tool",
      tool: tool,
    });
  }

  /**
   * Try to enter content edit mode - only works when the selected node is a text or vector node
   *
   * when triggered on such invalid context, it should be a no-op
   */
  tryEnterContentEditMode() {
    this.dispatch({
      type: "surface/content-edit-mode/try-enter",
    });
  }

  tryExitContentEditMode() {
    this.dispatch({
      type: "surface/content-edit-mode/try-exit",
    });
  }

  tryToggleContentEditMode() {
    if (this.mstate.content_edit_mode) {
      this.tryExitContentEditMode();
    } else {
      this.tryEnterContentEditMode();
    }
  }

  public select(...selectors: grida.program.document.Selector[]) {
    const { document_ctx, selection } = this.mstate;
    const ids = Array.from(
      new Set(
        selectors.flatMap((selector) =>
          dq.querySelector(document_ctx, selection, selector)
        )
      )
    );

    if (ids.length === 0) {
      // if no ids found, keep the current selection
      // e.g. this can happen whe `>` (select children) is used but no children found
      return false;
    } else {
      this.dispatch({
        type: "select",
        selection: ids,
      });
    }

    return ids;
  }

  public blur() {
    this.dispatch({
      type: "blur",
    });
  }

  public undo() {
    this.dispatch({
      type: "undo",
    });
  }

  public redo() {
    this.dispatch({
      type: "redo",
    });
  }

  public cut(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "cut",
      target,
    });
  }

  public copy(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "copy",
      target,
    });
  }

  public paste() {
    this.dispatch({
      type: "paste",
    });
  }

  public duplicate(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "duplicate",
      target,
    });
  }

  public setClipboardColor(color: cg.RGBA8888) {
    this.dispatch({
      type: "clip/color",
      color,
    });
  }

  public selectVertex(node_id: editor.NodeID, vertex: number) {
    this.dispatch({
      type: "select-vertex",
      target: {
        node_id,
        vertex,
      },
    });
  }

  public deleteVertex(node_id: editor.NodeID, vertex: number) {
    this.dispatch({
      type: "delete-vertex",
      target: {
        node_id,
        vertex,
      },
    });
  }

  public getNodeSnapshotById(
    node_id: editor.NodeID
  ): Readonly<grida.program.nodes.Node> {
    return dq.__getNodeById(this.mstate, node_id);
  }

  public getNodeById<T extends grida.program.nodes.Node>(
    node_id: editor.NodeID
  ): NodeProxy<T> {
    return new NodeProxy(this, node_id);
  }

  public getNodeDepth(node_id: editor.NodeID): number {
    return dq.getDepth(this.mstate.document_ctx, node_id);
  }

  public getNodeAbsoluteRotation(node_id: editor.NodeID): number {
    const parent_ids = dq.getAncestors(this.state.document_ctx, node_id);

    let rotation = 0;
    // Calculate the absolute rotation
    try {
      for (const parent_id of parent_ids) {
        const parent_node = this.getNodeSnapshotById(parent_id);
        assert(parent_node, `parent node not found: ${parent_id}`);
        if ("rotation" in parent_node) {
          rotation += parent_node.rotation ?? 0;
        }
      }

      // finally, add the node's own rotation
      const node = this.getNodeSnapshotById(node_id);
      assert(node, `node not found: ${node_id}`);
      if ("rotation" in node) {
        rotation += node.rotation ?? 0;
      }
    } catch (e) {
      reportError(e);
    }

    return rotation;
  }

  public insertNode(prototype: grida.program.nodes.NodePrototype) {
    const id = this.__createNodeId();
    this.dispatch({
      type: "insert",
      id,
      prototype,
    });
    return id;
  }

  public deleteNode(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "delete",
      target,
    });
  }

  public async createNodeFromSvg(
    svg: string
  ): Promise<NodeProxy<grida.program.nodes.ContainerNode>> {
    const id = this.__createNodeId();
    const optimized = iosvg.v0.optimize(svg).data;
    let result = await iosvg.v0.convert(optimized, {
      name: "svg",
      currentColor: { r: 0, g: 0, b: 0, a: 1 },
    });
    if (result) {
      result = result as grida.program.nodes.i.IPositioning &
        grida.program.nodes.i.IFixedDimension;

      this.insert({
        id: id,
        prototype: result,
      });

      return this.getNodeById<grida.program.nodes.ContainerNode>(id);
    } else {
      throw new Error("Failed to convert SVG");
    }
  }

  public createImageNode(
    image: grida.program.document.ImageRef
  ): NodeProxy<grida.program.nodes.ImageNode> {
    const id = this.__createNodeId();
    this.dispatch({
      type: "insert",
      id: id,
      prototype: {
        type: "image",
        _$id: id,
        src: image.url,
        width: image.width,
        height: image.height,
      },
    });

    return this.getNodeById(id);
  }

  public createTextNode(): NodeProxy<grida.program.nodes.TextNode> {
    const id = this.__createNodeId();
    this.dispatch({
      type: "insert",
      id: id,
      prototype: {
        type: "text",
        _$id: id,
        text: "",
        width: "auto",
        height: "auto",
      },
    });

    return this.getNodeById(id);
  }

  public createRectangleNode(): NodeProxy<grida.program.nodes.RectangleNode> {
    const id = this.__createNodeId();
    this.dispatch({
      type: "insert",
      id: id,
      prototype: {
        type: "rectangle",
        _$id: id,
        width: 100,
        height: 100,
        fill: {
          type: "solid",
          color: { r: 0, g: 0, b: 0, a: 1 },
        },
      },
    });

    return this.getNodeById(id);
  }

  public nudgeResize(
    target: "selection" | editor.NodeID = "selection",
    axis: "x" | "y",
    delta: number = 1
  ) {
    this.dispatch({
      type: "nudge-resize",
      delta,
      axis,
      target,
    });
  }

  public align(
    target: "selection" | editor.NodeID,
    alignment: {
      horizontal?: "none" | "min" | "max" | "center";
      vertical?: "none" | "min" | "max" | "center";
    }
  ) {
    this.dispatch({
      type: "align",
      target,
      alignment,
    });
  }

  public order(
    target: "selection" | editor.NodeID,
    order: "back" | "front" | number
  ) {
    this.dispatch({
      type: "order",
      target,
      order,
    });
  }

  public mv(source: editor.NodeID[], target: editor.NodeID, index?: number) {
    this.dispatch({
      type: "mv",
      source,
      target,
      index,
    });
  }

  public distributeEvenly(
    target: "selection" | editor.NodeID[],
    axis: "x" | "y"
  ) {
    this.dispatch({
      type: "distribute-evenly",
      target,
      axis,
    });
  }

  public autoLayout(target: "selection" | editor.NodeID[]) {
    this.dispatch({
      type: "autolayout",
      target,
    });
  }

  public contain(target: "selection" | editor.NodeID[]) {
    this.dispatch({
      type: "contain",
      target,
    });
  }

  public configureSurfaceRaycastTargeting(
    config: Partial<editor.state.HitTestingConfig>
  ) {
    this.dispatch({
      type: "config/surface/raycast-targeting",
      config,
    });
  }

  public configureMeasurement(measurement: "on" | "off") {
    this.dispatch({
      type: "config/surface/measurement",
      measurement,
    });
  }

  public configureTranslateWithCloneModifier(
    translate_with_clone: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/translate-with-clone",
      translate_with_clone,
    });
  }

  public configureTranslateWithAxisLockModifier(
    tarnslate_with_axis_lock: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/translate-with-axis-lock",
      tarnslate_with_axis_lock,
    });
  }

  public configureTransformWithCenterOriginModifier(
    transform_with_center_origin: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/transform-with-center-origin",
      transform_with_center_origin,
    });
  }

  public configureTransformWithPreserveAspectRatioModifier(
    transform_with_preserve_aspect_ratio: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/transform-with-preserve-aspect-ratio",
      transform_with_preserve_aspect_ratio,
    });
  }

  public configureRotateWithQuantizeModifier(
    rotate_with_quantize: number | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/rotate-with-quantize",
      rotate_with_quantize,
    });
  }

  public toggleActive(target: "selection" | editor.NodeID = "selection") {
    const target_ids =
      target === "selection" ? this.mstate.selection : [target];

    for (const node_id of target_ids) {
      this.toggleNodeActive(node_id);
    }
  }

  public toggleLocked(target: "selection" | editor.NodeID = "selection") {
    const target_ids =
      target === "selection" ? this.mstate.selection : [target];
    for (const node_id of target_ids) {
      this.toggleNodeLocked(node_id);
    }
  }

  public toggleBold(target: "selection" | editor.NodeID = "selection") {
    const target_ids =
      target === "selection" ? this.mstate.selection : [target];
    target_ids.forEach((node_id) => {
      this.dispatch({
        type: "node/toggle/bold",
        node_id,
      });
    });
  }

  public setOpacity(
    target: "selection" | editor.NodeID = "selection",
    opacity: number
  ) {
    const target_ids =
      target === "selection" ? this.mstate.selection : [target];
    for (const node_id of target_ids) {
      this.changeNodeOpacity(node_id, { type: "set", value: opacity });
    }
  }

  // #endregion IDocumentEditorActions implementation

  // #region ISchemaActions implementation
  public schemaDefineProperty(
    key?: string,
    definition?: grida.program.schema.PropertyDefinition
  ) {
    this.dispatch({
      type: "document/properties/define",
      key,
      definition,
    });
  }

  public schemaRenameProperty(key: string, newName: string) {
    this.dispatch({
      type: "document/properties/rename",
      key,
      newKey: newName,
    });
  }

  public schemaUpdateProperty(
    key: string,
    definition: grida.program.schema.PropertyDefinition
  ) {
    this.dispatch({
      type: "document/properties/update",
      key,
      definition,
    });
  }

  public schemaPutProperty(key: string, value: any) {
    this.dispatch({
      type: "document/properties/put",
      key,
      definition: value,
    });
  }

  public schemaDeleteProperty(key: string) {
    this.dispatch({
      type: "document/properties/delete",
      key,
    });
  }
  // #endregion ISchemaActions implementation

  // #region INodeChangeActions

  toggleNodeActive(node_id: string) {
    const next = !this.getNodeSnapshotById(node_id).active;
    this.changeNodeActive(node_id, next);
    return next;
  }
  toggleNodeLocked(node_id: string) {
    const next = !this.getNodeSnapshotById(node_id).locked;
    this.changeNodeLocked(node_id, next);
    return next;
  }
  toggleNodeBold(node_id: string) {
    this.dispatch({
      type: "node/toggle/bold",
      node_id: node_id,
    });
  }
  changeNodeProps(
    node_id: string,
    key: string,
    value?: tokens.StringValueExpression
  ) {
    this.dispatch({
      type: "node/change/props",
      node_id: node_id,
      props: {
        [key]: value,
      },
    });
  }
  changeNodeComponent(node_id: string, component_id: string) {
    this.dispatch({
      type: "node/change/component",
      node_id: node_id,
      component_id: component_id,
    });
  }
  changeNodeText(node_id: string, text: tokens.StringValueExpression | null) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      text,
    });
  }
  changeNodeName(node_id: string, name: string) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      name: name ?? "",
    });
  }
  changeNodeUserData(node_id: string, userdata: unknown) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      userdata: userdata as any,
    });
  }
  changeNodeActive(node_id: string, active: boolean) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      active: active,
    });
  }
  changeNodeLocked(node_id: string, locked: boolean) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      locked: locked,
    });
  }
  changeNodePositioning(
    node_id: string,
    positioning: Partial<grida.program.nodes.i.IPositioning>
  ) {
    this.dispatch({
      type: "node/change/positioning",
      node_id: node_id,
      ...positioning,
    });
  }
  changeNodePositioningMode(
    node_id: string,
    position: grida.program.nodes.i.IPositioning["position"]
  ) {
    this.dispatch({
      type: "node/change/positioning-mode",
      node_id: node_id,
      position,
    });
  }
  changeNodeSrc(node_id: string, src?: tokens.StringValueExpression) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      src,
    });
  }
  changeNodeHref(
    node_id: string,
    href?: grida.program.nodes.i.IHrefable["href"]
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      href,
    });
  }
  changeNodeTarget(
    node_id: string,
    target?: grida.program.nodes.i.IHrefable["target"]
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      target,
    });
  }
  changeNodeOpacity(node_id: string, opacity: editor.api.NumberChange) {
    requestAnimationFrame(() => {
      try {
        const value = resolveNumberChangeValue(
          this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
          "opacity",
          opacity
        );

        this.dispatch({
          type: "node/change/*",
          node_id: node_id,
          opacity: value,
        });
      } catch (e) {
        reportError(e);
        return;
      }
    });
  }
  changeNodeRotation(node_id: string, rotation: editor.api.NumberChange) {
    requestAnimationFrame(() => {
      try {
        const value = resolveNumberChangeValue(
          this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
          "rotation",
          rotation
        );

        this.dispatch({
          type: "node/change/*",
          node_id: node_id,
          rotation: value,
        });
      } catch (e) {
        reportError(e);
        return;
      }
    });
  }
  changeNodeSize(
    node_id: string,
    axis: "width" | "height",
    value: grida.program.css.LengthPercentage | "auto"
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        [axis]: value,
      });
    });
  }
  changeNodeFill(
    node_id: string,
    fill: grida.program.nodes.i.props.SolidPaintToken | cg.PaintWithoutID | null
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        fill: fill as cg.Paint,
      });
    });
  }
  changeNodeStroke(
    node_id: string,
    stroke:
      | grida.program.nodes.i.props.SolidPaintToken
      | cg.PaintWithoutID
      | null
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        stroke: stroke as cg.Paint,
      });
    });
  }
  changeNodeStrokeWidth(node_id: string, strokeWidth: editor.api.NumberChange) {
    try {
      const value = resolveNumberChangeValue(
        this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
        "strokeWidth",
        strokeWidth
      );

      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        strokeWidth: value,
      });
    } catch (e) {
      reportError(e);
      return;
    }
  }
  changeNodeStrokeCap(node_id: string, strokeCap: cg.StrokeCap) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      strokeCap,
    });
  }
  changeNodeFit(node_id: string, fit: cg.BoxFit) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fit,
    });
  }
  changeNodeCornerRadius(
    node_id: string,
    cornerRadius: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        cornerRadius,
      });
    });
  }
  // text style
  changeTextNodeFontFamily(node_id: string, fontFamily: string | undefined) {
    this.dispatch({
      type: "node/change/fontFamily",
      node_id: node_id,
      fontFamily,
    });
  }
  changeTextNodeFontWeight(node_id: string, fontWeight: cg.NFontWeight) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fontWeight,
    });
  }
  changeTextNodeFontSize(node_id: string, fontSize: editor.api.NumberChange) {
    try {
      const value = resolveNumberChangeValue(
        this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
        "fontSize",
        fontSize
      );

      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        fontSize: value,
      });
    } catch (e) {
      reportError(e);
      return;
    }
  }
  changeTextNodeTextAlign(node_id: string, textAlign: cg.TextAlign) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      textAlign,
    });
  }
  changeTextNodeTextAlignVertical(
    node_id: string,
    textAlignVertical: cg.TextAlignVertical
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      textAlignVertical,
    });
  }

  changeTextNodeLineHeight(
    node_id: string,
    lineHeight: editor.api.NumberChange
  ) {
    try {
      const value = resolveNumberChangeValue(
        this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
        "lineHeight",
        lineHeight
      );
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        lineHeight: value,
      });
    } catch (e) {
      reportError(e);
      return;
    }
  }

  changeTextNodeLetterSpacing(
    node_id: string,
    letterSpacing: editor.api.TChange<
      grida.program.nodes.TextNode["letterSpacing"]
    >
  ) {
    try {
      let value: number | undefined;
      if (letterSpacing.value === undefined) {
        value = undefined;
      } else {
        value = resolveNumberChangeValue(
          this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
          "letterSpacing",
          letterSpacing as editor.api.NumberChange
        );
      }

      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        letterSpacing: value,
      });
    } catch (e) {
      reportError(e);
      return;
    }
  }

  changeTextNodeMaxlength(node_id: string, maxLength: number | undefined) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      maxLength,
    });
  }

  //
  changeNodeBorder(
    node_id: string,
    border: grida.program.css.Border | undefined
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        border: border,
      });
    });
  }
  //
  changeContainerNodePadding(
    node_id: string,
    padding: grida.program.nodes.i.IPadding["padding"]
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        padding,
      });
    });
  }

  changeNodeBoxShadow(node_id: string, boxShadow?: cg.BoxShadow) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        boxShadow,
      });
    });
  }

  changeContainerNodeLayout(
    node_id: string,
    layout: grida.program.nodes.i.IFlexContainer["layout"]
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      layout,
    });
  }

  changeFlexContainerNodeDirection(node_id: string, direction: cg.Axis) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      direction,
    });
  }

  changeFlexContainerNodeMainAxisAlignment(
    node_id: string,
    mainAxisAlignment: cg.MainAxisAlignment
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      mainAxisAlignment,
    });
  }

  changeFlexContainerNodeCrossAxisAlignment(
    node_id: string,
    crossAxisAlignment: cg.CrossAxisAlignment
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      crossAxisAlignment,
    });
  }
  changeFlexContainerNodeGap(
    node_id: string,
    gap: number | { mainAxisGap: number; crossAxisGap: number }
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        mainAxisGap: typeof gap === "number" ? gap : gap.mainAxisGap,
        crossAxisGap: typeof gap === "number" ? gap : gap.crossAxisGap,
      });
    });
  }
  //
  changeNodeMouseCursor(node_id: string, cursor: cg.SystemMouseCursor) {
    this.dispatch({
      type: "node/change/*",
      node_id,
      cursor,
    });
  }
  changeNodeStyle(
    node_id: string,
    key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
    value: any
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/style",
        node_id: node_id,
        style: {
          [key]: value,
        },
      });
    });
  }
  // #endregion INodeChangeActions

  // #region IBrushToolActions implementation
  changeBrush(brush: BitmapEditorBrush) {
    this.dispatch({
      type: "surface/brush",
      brush,
    });
  }
  changeBrushSize(size: editor.api.NumberChange) {
    this.dispatch({
      type: "surface/brush/size",
      size,
    });
  }
  changeBrushOpacity(opacity: editor.api.NumberChange) {
    this.dispatch({
      type: "surface/brush/opacity",
      opacity,
    });
  }
  // #endregion IBrushToolActions implementation

  // #region IPixelGridActions implementation
  configurePixelGrid(state: "on" | "off") {
    this.dispatch({
      type: "surface/pixel-grid",
      state,
    });
  }
  togglePixelGrid(): "on" | "off" {
    const { pixelgrid } = this.state;
    const next = pixelgrid === "on" ? "off" : "on";
    this.configurePixelGrid(next);
    return next;
  }
  // #endregion IPixelGridActions implementation

  // #region IRulerActions implementation
  configureRuler(state: "on" | "off") {
    this.dispatch({
      type: "surface/ruler",
      state,
    });
  }
  toggleRuler(): "on" | "off" {
    const { ruler } = this.state;
    const next = ruler === "on" ? "off" : "on";
    this.configureRuler(next);
    return next;
  }
  // #endregion IRulerActions implementation

  // #region IGuide2DActions implementation

  /**
   * TODO: use id instead of idx
   */
  deleteGuide(idx: number) {
    this.dispatch({
      type: "surface/guide/delete",
      idx,
    });
  }
  // #endregion IGuide2DActions implementation

  // #region ICameraActions implementation
  transform(transform: cmath.Transform, sync: boolean = true) {
    this.dispatch({
      type: "transform",
      transform,
      sync,
    });
  }

  zoom(delta: number, origin: cmath.Vector2) {
    const { transform } = this.state;
    const _scale = transform[0][0];
    // the origin point of the zooming point in x, y (surface space)
    const [ox, oy] = origin;

    // Apply proportional zooming
    const scale = _scale + _scale * delta;

    const newscale = cmath.clamp(
      scale,
      editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MIN,
      editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MAX
    );
    const [tx, ty] = cmath.transform.getTranslate(transform);

    // calculate the offset that should be applied with scale with css transform.
    const [newx, newy] = [
      ox - (ox - tx) * (newscale / _scale),
      oy - (oy - ty) * (newscale / _scale),
    ];

    const next: cmath.Transform = [
      [newscale, transform[0][1], newx],
      [transform[1][0], newscale, newy],
    ];

    this.transform(next, true);
  }

  pan(delta: [dx: number, dy: number]) {
    this.transform(
      cmath.transform.translate(this.state.transform, delta),
      true
    );
  }

  scale(
    factor: number | cmath.Vector2,
    origin: cmath.Vector2 | "center" = "center"
  ) {
    const { transform } = this.state;
    const [fx, fy] = typeof factor === "number" ? [factor, factor] : factor;
    const _scale = transform[0][0];
    let ox, oy: number;
    if (origin === "center") {
      // Canvas size (you need to know or pass this)
      const { width, height } = this.viewport.size;

      // Calculate the absolute transform origin
      ox = width / 2;
      oy = height / 2;
    } else {
      [ox, oy] = origin;
    }

    const sx = cmath.clamp(
      fx,
      editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MIN,
      editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MAX
    );

    const sy = cmath.clamp(
      fy,
      editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MIN,
      editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MAX
    );

    const [tx, ty] = cmath.transform.getTranslate(transform);

    // calculate the offset that should be applied with scale with css transform.
    const [newx, newy] = [
      ox - (ox - tx) * (sx / _scale),
      oy - (oy - ty) * (sy / _scale),
    ];

    const next: cmath.Transform = [
      [sx, transform[0][1], newx],
      [transform[1][0], sy, newy],
    ];

    this.transform(next);
  }

  /**
   * Transform to fit
   */
  fit(
    selector: grida.program.document.Selector,
    options: {
      margin?: number | [number, number, number, number];
      animate?: boolean;
    } = {
      margin: 64,
      animate: false,
    }
  ) {
    const { document_ctx, selection, transform } = this.state;
    const ids = dq.querySelector(document_ctx, selection, selector);

    const rects = ids
      .map((id) => this.geometry.getNodeAbsoluteBoundingRect(id))
      .filter((r) => r) as cmath.Rectangle[];

    if (rects.length === 0) {
      return;
    }

    const area = cmath.rect.union(rects);

    const { width, height } = this.viewport.size;
    const view = { x: 0, y: 0, width, height };

    const next_transform = cmath.ext.viewport.transformToFit(
      view,
      area,
      options.margin
    );

    if (options.animate) {
      animateTransformTo(transform, next_transform, (t) => {
        this.transform(t);
      });
    } else {
      this.transform(next_transform);
    }
  }

  zoomIn() {
    const { transform } = this.state;
    const prevscale = transform[0][0];
    const nextscale = cmath.quantize(prevscale * 2, 0.01);

    this.scale(nextscale);
  }

  zoomOut() {
    const { transform } = this.state;
    const prevscale = transform[0][0];
    const nextscale = cmath.quantize(prevscale / 2, 0.01);

    this.scale(nextscale);
  }
  // #endregion ICameraActions implementation

  // #region IEventTargetActions implementation

  pointerDown(event: PointerEvent) {
    const ids = domapi.getNodeIdsFromPoint([event.clientX, event.clientY]);

    this.dispatch({
      type: "event-target/event/on-pointer-down",
      node_ids_from_point: ids,
      shiftKey: event.shiftKey,
    });
  }

  pointerUp(event: PointerEvent) {
    this.dispatch({
      type: "event-target/event/on-pointer-up",
    });
  }

  private __canvas_space_position = (
    pointer_event: PointerEvent | MouseEvent
  ) => {
    const { clientX, clientY } = pointer_event;

    const [x, y] = this.viewport.offset;
    const position = {
      x: clientX - x,
      y: clientY - y,
    };

    return position;
  };

  private _throttled_pointer_move_with_raycast = editor.throttle(
    (event: PointerEvent, position: { x: number; y: number }) => {
      // this is throttled - as it is expensive
      const ids = domapi.getNodeIdsFromPoint([event.clientX, event.clientY]);

      this.dispatch({
        type: "event-target/event/on-pointer-move-raycast",
        node_ids_from_point: ids,
        position,
        shiftKey: event.shiftKey,
      });
    },
    this.__pointer_move_throttle_ms
  );

  pointerMove(event: PointerEvent) {
    const position = this.__canvas_space_position(event);

    this.dispatch({
      type: "event-target/event/on-pointer-move",
      position_canvas: position,
      position_client: { x: event.clientX, y: event.clientY },
    });

    this._throttled_pointer_move_with_raycast(event, position);
  }

  click(event: MouseEvent) {
    const ids = domapi.getNodeIdsFromPoint([event.clientX, event.clientY]);

    this.dispatch({
      type: "event-target/event/on-click",
      node_ids_from_point: ids,
      shiftKey: event.shiftKey,
    });
  }

  doubleClick(event: MouseEvent) {
    this.dispatch({
      type: "event-target/event/on-double-click",
    });
  }

  dragStart(event: PointerEvent) {
    this.dispatch({
      type: "event-target/event/on-drag-start",
      shiftKey: event.shiftKey,
    });
  }

  dragEnd(event: PointerEvent) {
    const { transform, marquee } = this.state;
    if (marquee) {
      // test area in canvas space
      const area = cmath.rect.fromPoints([marquee.a, marquee.b]);

      const contained = this.geometry.getNodeIdsFromEnvelope(area);

      this.dispatch({
        type: "event-target/event/on-drag-end",
        node_ids_from_area: contained,
        shiftKey: event.shiftKey,
      });

      return;
    }
    this.dispatch({
      type: "event-target/event/on-drag-end",
      shiftKey: event.shiftKey,
    });
  }

  drag(event: TCanvasEventTargetDragGestureState) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "event-target/event/on-drag",
        event,
      });
    });
  }

  //

  public hoverNode(node_id: string, event: "enter" | "leave") {
    this.dispatch({
      type: "hover",
      target: node_id,
      event,
    });
  }

  public hoverEnterNode(node_id: string) {
    this.hoverNode(node_id, "enter");
  }

  public hoverLeaveNode(node_id: string) {
    this.hoverNode(node_id, "leave");
  }

  public hoverVertex(
    node_id: string,
    vertex: number,
    event: "enter" | "leave"
  ) {
    this.dispatch({
      type: "hover-vertex",
      event: event,
      target: {
        node_id,
        vertex,
      },
    });
  }

  startGuideGesture(axis: cmath.Axis, idx: number | -1) {
    this.dispatch({
      type: "surface/gesture/start",
      gesture: {
        idx: idx,
        type: "guide",
        axis,
      },
    });
  }

  startScaleGesture(
    selection: string | string[],
    direction: cmath.CardinalDirection
  ) {
    this.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "scale",
        selection: Array.isArray(selection) ? selection : [selection],
        direction,
      },
    });
  }

  startSortGesture(selection: string | string[], node_id: string) {
    this.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "sort",
        selection: Array.isArray(selection) ? selection : [selection],
        node_id,
      },
    });
  }

  startGapGesture(selection: string | string[], axis: "x" | "y") {
    this.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "gap",
        selection: selection,
        axis,
      },
    });
  }

  // #region drag resize handle
  startCornerRadiusGesture(selection: string) {
    this.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "corner-radius",
        node_id: selection,
      },
    });
  }
  // #endregion drag resize handle

  startRotateGesture(selection: string) {
    this.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "rotate",
        selection,
      },
    });
  }

  startTranslateVertexGesture(node_id: string, vertex: number) {
    this.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "translate-vertex",
        vertex,
        node_id,
      },
    });
  }

  startCurveGesture(node_id: string, segment: number, control: "ta" | "tb") {
    this.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "curve",
        node_id,
        control,
        segment,
      },
    });
  }

  // #endregion IEventTargetActions implementation

  readonly __pligin_follow: EditorFollowPlugin = new EditorFollowPlugin(this);
  // #region IFollowPluginActions implementation
  follow(cursor_id: string): void {
    this.__pligin_follow.follow(cursor_id);
  }

  unfollow(): void {
    this.__pligin_follow.unfollow();
  }
  // #endregion IFollowPluginActions implementation
}

export class NodeProxy<T extends grida.program.nodes.Node> {
  constructor(
    private readonly editor: Editor,
    private readonly node_id: string
  ) {}

  get $() {
    // @ts-expect-error - this is a workaround to allow the proxy to be used as a node
    return new Proxy(this, {
      get: (target, prop: string) => {
        return (target.editor.getNodeSnapshotById(target.node_id) as T)[
          prop as keyof T
        ];
      },
      set: (target, prop: string, value) => {
        try {
          target.editor.dispatch({
            type: "node/change/*",
            node_id: target.node_id,
            [prop]: value,
          });
          return true;
        } catch (e) {
          return false; // unknown prop
        }
      },
    }) as T;
  }
}
