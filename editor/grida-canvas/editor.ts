import { produce, applyPatches, produceWithPatches } from "immer";
import { editor, type Action } from ".";
import reducer, { type ReducerContext } from "./reducers";
import type { tokens } from "@grida/tokens";
import type { BitmapEditorBrush } from "@grida/bitmap";
import type { TCanvasEventTargetDragGestureState } from "./action";
import { animateTransformTo } from "./animation";
import { EditorFollowPlugin } from "./plugins/follow";
import { DocumentFontManager } from "./font-manager";
import { DocumentHistoryManager } from "./history-manager";
import init, { svgtypes, type Scene } from "@grida/canvas-wasm";
import locateFile from "./backends/wasm-locate-file";
import {
  NoopDefaultExportInterfaceProvider,
  CanvasWasmGeometryQueryInterfaceProvider,
  CanvasWasmVectorInterfaceProvider,
  CanvasWasmFontManagerAgentInterfaceProvider,
  CanvasWasmFontParserInterfaceProvider,
  CanvasWasmDefaultExportInterfaceProvider,
  CanvasWasmSVGInterfaceProvider,
  CanvasWasmMarkdownInterfaceProvider,
} from "./backends";
import { domapi } from "./backends/dom";
import { dq } from "@/grida-canvas/query";
import {
  resolveInsertTargetParent,
  resolvePasteTargetParents,
} from "@/grida-canvas/utils/insertion-targeting";
import { io } from "@grida/io";
import * as googlefonts from "@grida/fonts/google";
import grida from "@grida/schema";
import tree from "@grida/tree";
import vn from "@grida/vn";
import cg from "@grida/cg";
import iosvg from "@grida/io-svg";
import cmath from "@grida/cmath";
import kolor from "@grida/color";
import assert from "assert";
import { describeDocumentTree } from "./utils/cmd-tree";

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

type WithEditorInstance<T> = T | ((editor: Editor) => T);

function isWithEditorFunction<T>(
  value: WithEditorInstance<T>
): value is (editor: Editor) => T {
  return typeof value === "function";
}

function resolveWithEditorInstance<T>(
  instance: Editor,
  value: WithEditorInstance<T>
): T {
  return isWithEditorFunction(value) ? value(instance) : value;
}

export class Camera implements editor.api.ICameraActions {
  constructor(
    readonly editor: Editor,
    readonly viewport: domapi.DOMViewportApi
  ) {
    //
  }

  get transform() {
    return this.editor.state.transform;
  }

  set transform(transform: cmath.Transform) {
    this.editor.doc.dispatch({
      type: "transform",
      transform,
      sync: true,
    });
  }

  // #region ICameraActions implementation
  transformWithSync(transform: cmath.Transform, sync: boolean = true) {
    this.editor.doc.dispatch({
      type: "transform",
      transform,
      sync,
    });
  }

  zoom(delta: number, origin: cmath.Vector2) {
    const _scale = this.transform[0][0];
    // the origin point of the zooming point in x, y (surface space)
    const [ox, oy] = origin;

    // Apply proportional zooming
    const scale = _scale + _scale * delta;

    const newscale = cmath.clamp(
      scale,
      editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MIN,
      editor.config.DEFAULT_CANVAS_TRANSFORM_SCALE_MAX
    );
    const [tx, ty] = cmath.transform.getTranslate(this.transform);

    // calculate the offset that should be applied with scale with css transform.
    const [newx, newy] = [
      ox - (ox - tx) * (newscale / _scale),
      oy - (oy - ty) * (newscale / _scale),
    ];

    const next: cmath.Transform = [
      [newscale, this.transform[0][1], newx],
      [this.transform[1][0], newscale, newy],
    ];

    this.transform = next;
  }

  pan(delta: [dx: number, dy: number]) {
    this.transform = cmath.transform.translate(
      this.editor.state.transform,
      delta
    );
  }

  scale(
    factor: number | cmath.Vector2,
    origin: cmath.Vector2 | "center" = "center"
  ) {
    const { transform } = this.editor.state;
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

    this.transform = next;
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
    const { document_ctx, selection, transform } = this.editor.state;
    const ids = dq.querySelector(document_ctx, selection, selector);

    const rects = ids
      .map((id) => this.editor.geometryProvider.getNodeAbsoluteBoundingRect(id))
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
        this.transform = t;
      });
    } else {
      this.transform = next_transform;
    }
  }

  zoomIn() {
    const { transform } = this.editor.state;
    const prevscale = transform[0][0];
    const nextscale = cmath.quantize(prevscale * 2, 0.01);

    this.scale(nextscale);
  }

  zoomOut() {
    const prevscale = this.transform[0][0];
    const nextscale = cmath.quantize(prevscale / 2, 0.01);

    this.scale(nextscale);
  }
  // #endregion ICameraActions implementation

  /**
   * Convert a point in client (window) to viewport relative (offset applied) point.
   * @param pointer_event
   * @returns viewport relative point
   */
  public pointerEventToViewportPoint = (
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

  /**
   * Convert a point in client (window) space to canvas space.
   * @param point
   * @returns canvas space point
   *
   * @example
   * ```ts
   * const canvasPoint = editor.clientPointToCanvasPoint([event.clientX, event.clientY]);
   * ```
   */
  public clientPointToCanvasPoint(point: cmath.Vector2): cmath.Vector2 {
    const [clientX, clientY] = point;
    const [offsetX, offsetY] = this.viewport.offset;

    // Convert from client coordinates to viewport coordinates
    const viewportX = clientX - offsetX;
    const viewportY = clientY - offsetY;

    // Apply inverse transform to convert from viewport space to canvas space
    const inverseTransform = cmath.transform.invert(this.transform);
    const canvasPoint = cmath.vector2.transform(
      [viewportX, viewportY],
      inverseTransform
    );

    return canvasPoint;
  }

  /**
   * Convert a point in canvas space to client (window) space.
   * @param point
   * @returns client space point
   *
   * @example
   * ```ts
   * const clientPoint = editor.canvasPointToClientPoint([500, 500]);
   * ```
   */
  public canvasPointToClientPoint(point: cmath.Vector2): cmath.Vector2 {
    // Apply transform to convert from canvas space to viewport space
    const viewportPoint = cmath.vector2.transform(point, this.transform);

    // Convert from viewport coordinates to client coordinates
    const [offsetX, offsetY] = this.viewport.offset;
    const clientX = viewportPoint[0] + offsetX;
    const clientY = viewportPoint[1] + offsetY;

    return [clientX, clientY];
  }
}

class EditorDocumentStore
  implements
    editor.api.IDocumentStoreActions,
    editor.api.IDocumentNodeChangeActions,
    editor.api.IDocumentBrushToolActions,
    editor.api.IDocumentSchemaActions_Experimental
{
  private readonly listeners: Set<editor.api.SubscriptionCallbackFn<this>> =
    new Set();

  private mstate: editor.state.IEditorState;
  get state(): Readonly<editor.state.IEditorState> {
    return this.mstate;
  }

  private readonly historyManager = new DocumentHistoryManager();
  get historySnapshot() {
    return this.historyManager.snapshot;
  }

  /**
   * If the editor is locked, no actions will be dispatched. (unless forced)
   */
  private _locked: boolean = false;

  /**
   * If the editor is locked, no actions will be dispatched. (unless forced)
   */
  get locked() {
    return this._locked;
  }

  set locked(value: boolean) {
    this._locked = value;
  }

  /**
   * @deprecated this is event target dependency - will be removed
   */
  get viewportSize() {
    return this.getViewportSize();
  }

  constructor(
    private readonly idgen: grida.id.INodeIdGenerator<string>,
    initialState: editor.state.IEditorStateInit,
    private readonly backend: editor.EditorContentRenderingBackend,
    private readonly geometry: editor.api.IDocumentGeometryQuery,
    private readonly vector: editor.api.IDocumentVectorInterfaceActions,
    private readonly svg: editor.api.IDocumentSVGInterfaceActions,
    /**
     * @deprecated this is event target dependency - will be removed
     */
    private readonly getViewportSize: () => { width: number; height: number },
    private readonly logger?: (...args: any[]) => void
  ) {
    this.mstate = editor.state.init(initialState);
  }

  // TODO: implement this
  // /**
  //  * only peek is allowed for external use
  //  */
  // public peekNextNodeId() {}

  /**
   * @internal Transaction ID - does not clear on reset.
   */
  private _tid: number = 0;
  public get tid(): number {
    return this._tid;
  }

  get transform() {
    return this.mstate.transform;
  }

  public undo() {
    if (this._locked) return;

    const [nextState, patches] = this.historyManager.undo(this.mstate);
    if (nextState === this.mstate) {
      return;
    }

    this.mstate = nextState;
    this._tid++;
    this.emit(undefined, patches);
  }

  public redo() {
    if (this._locked) return;

    const [nextState, patches] = this.historyManager.redo(this.mstate);
    if (nextState === this.mstate) {
      return;
    }

    this.mstate = nextState;
    this._tid++;
    this.emit(undefined, patches);
  }

  private emit(action: Action | undefined, patches: editor.history.Patch[]) {
    this.listeners.forEach((l) => l(this, action, patches));
  }

  public applyDocumentPatches(patches: editor.history.Patch[]) {
    if (!patches.length) {
      return;
    }

    const shouldRecomputeDocumentCtx = patches.some(
      (patch) => patch.path[0] === "document"
    );

    this.apply((draft) => {
      applyPatches(draft, patches);

      if (shouldRecomputeDocumentCtx) {
        draft.document_ctx = new tree.graph.Graph(draft.document).lut;
      }
    });
  }

  /**
   * apply changes without incrementing the transaction id
   *
   * - use when applying changes from remote
   *
   * this won't
   * - increment the transaction id
   * - write history
   *
   * this will
   * - emit the patches applied
   */
  private apply(reducer: (draft: editor.state.IEditorState) => void) {
    const [state, patches] = produceWithPatches(this.mstate, reducer);
    this.mstate = state;
    this.emit(undefined, patches);
  }

  /**
   * @deprecated use dispatch instead
   * this will be removed, and only consumed by surface api. (which in the future, it will have its own physical state)
   */
  public reduce(reducer: (draft: editor.state.IEditorState) => void) {
    this.mstate = produce(this.mstate, reducer);
    this._tid++;
    this.emit(undefined, []);
  }

  public dispatch(action: Action | Action[], force: boolean = false) {
    if (this._locked && !force) return;

    const context: ReducerContext = {
      geometry: this.geometry,
      vector: this.vector,
      viewport: this.viewportSize,
      backend: this.backend,
      // TODO: LEGACY_PAINT_MODEL
      paint_constraints: {
        fill: this.backend === "dom" ? "fill" : "fill_paints",
        stroke: this.backend === "dom" ? "stroke" : "stroke_paints",
      },
      idgen: this.idgen,
      logger: this.log.bind(this),
    };

    const actions = Array.isArray(action) ? action : [action];

    if (actions.length === 0) {
      return;
    }

    let lastAction: Action;
    let allPatches: editor.history.Patch[] = [];

    for (const action of actions) {
      const [nextState, patches, inversePatches] = reducer(
        this.mstate,
        action,
        context
      );
      this.mstate = nextState;
      this.historyManager.record({
        actionType: action.type,
        patches,
        inversePatches,
      });
      lastAction = action;
      allPatches = allPatches.concat(patches);
    }

    this._tid++;

    this.emit(lastAction!, allPatches);
  }

  /**
   * subscribe to the document state changes
   * @returns unsubscribe function
   */
  public subscribe(fn: editor.api.SubscriptionCallbackFn<this>) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public subscribeWithSelector<T>(
    selector: (state: editor.state.IEditorState) => T,
    fn: editor.api.SubscriptionWithSelectorCallbackFn<T, this>,
    isEqual: (a: T, b: T) => boolean = Object.is
  ): () => void {
    let previous = selector(this.mstate);

    const wrapped = (
      _: this,
      action?: Action,
      patches?: editor.history.Patch[]
    ) => {
      const next = selector(this.mstate);
      if (!isEqual(previous, next)) {
        const prev = previous;
        // previous is assigned before invoking the listener, preventing recursive dispatch loops
        // [1]
        previous = next;
        // [2]
        fn(this, next, prev, action, patches);
      }
    };

    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }

  // #region IDocumentEditorActions implementation
  /**
   * Reset the entire document state
   *
   * This is a special operation that bypasses the reducer and directly replaces
   * the entire state. Unlike `dispatch()`, it does not generate patches.
   *
   * **Characteristics:**
   * - Completely replaces the state (no Immer produce)
   * - Preserves editor-level runtime properties: camera transform and webfontlist
   *   (Google Fonts registry). Document-level properties (document, fontfaces, etc.) are replaced.
   * - Clears undo/redo history
   * - Resets transaction ID to 0
   * - Emits a "document/reset" action so subscribers can detect the reset
   *
   * **Use cases:**
   * - Loading a document from a file
   * - Importing content from external sources
   * - Resetting to a completely new state
   *
   * @param state - The new complete editor state to set
   * @param key - Optional unique identifier for this reset operation.
   *              If not provided, a timestamp is auto-generated.
   * @param force - If true, bypass the locked check. Use with caution.
   *
   * @returns The new transaction ID (always 0 after reset)
   *
   * @example
   * ```ts
   * // Load a document from file
   * const fileData = await fetch('/example.grida').then(r => r.json());
   * editor.commands.reset(
   *   editor.state.init({
   *     editable: true,
   *     document: fileData.document
   *   }),
   *   '/example.grida'
   * );
   * ```
   */
  public reset(
    state: editor.state.IEditorState,
    key: string | undefined = undefined,
    force: boolean = false
  ): number {
    if (this._locked && !force) return this._tid;

    const document_key = key ?? Date.now().toString();
    const prev_transform = this.mstate.transform;
    const prev_webfontlist = this.mstate.webfontlist;

    // Explicit full reset: Use the provided state (typically from editor.state.init())
    // Preserve editor-level runtime properties (transform, webfontlist) while replacing document-level properties
    this.mstate = {
      ...state,
      document_key, // Set reset identifier
      transform: prev_transform, // Preserve camera transform
      webfontlist: prev_webfontlist, // Preserve Google Fonts registry (editor-level, not document-level)
    };

    this.historyManager.clear();
    this._tid = 0;
    this.emit({ type: "document/reset", document_key }, []);
    return this._tid;
  }

  private log(...args: any[]) {
    this.logger?.(...args);
  }

  public insert(
    payload:
      | {
          id?: string;
          prototype: grida.program.nodes.NodePrototype;
        }
      | {
          document: grida.program.document.IPackedSceneDocument;
        },
    target: editor.NodeID | null
  ): editor.NodeID[] {
    const nodesBefore = new Set(Object.keys(this.mstate.document.nodes));

    this.dispatch({
      type: "insert",
      ...payload,
      target,
    });

    const nodesAfter = Object.keys(this.mstate.document.nodes);
    return nodesAfter.filter((id) => !nodesBefore.has(id));
  }

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
    backgroundColor: grida.program.document.ISceneBackground["background_color"]
  ) {
    this.dispatch({
      type: "scenes/change/background-color",
      scene: scene_id,
      backgroundColor,
    });
  }

  public async createNodeFromSvg(
    svg: string
  ): Promise<NodeProxy<grida.program.nodes.ContainerNode>> {
    const id = this.idgen.next();

    const packed = await this.svg.svgPack(svg);
    if (!packed) {
      throw new Error("Failed to pack SVG");
    }

    // Handle both response formats: { success: true, data: { svg } } or direct { svg }
    const svgData =
      (packed as any).svg ||
      ((packed as any).success && (packed as any).data?.svg);
    if (!svgData) {
      throw new Error("Failed to extract SVG data from packed result");
    }

    let result = await iosvg.convert(svgData, {
      name: "svg",
      currentColor: kolor.colorformats.RGBA32F.BLACK,
    });
    if (result) {
      result = result as grida.program.nodes.i.IPositioning &
        grida.program.nodes.i.IFixedDimension;

      // Use explicit scene-level target for programmatic SVG node creation
      this.insert(
        {
          id: id,
          prototype: result,
        },
        this.mstate.scene_id ?? null
      );

      return this.getNodeById<grida.program.nodes.ContainerNode>(id);
    } else {
      throw new Error("Failed to convert SVG");
    }
  }

  public createImageNode(
    image: grida.program.document.ImageRef
  ): NodeProxy<grida.program.nodes.ImageNode> {
    const id = this.idgen.next();
    // Use explicit scene-level target for programmatic image node creation
    this.insert(
      {
        id: id,
        prototype: {
          type: "image",
          _$id: id,
          src: image.url,
          width: image.width,
          height: image.height,
        },
      },
      this.mstate.scene_id ?? null
    );

    return this.getNodeById(id);
  }

  public createTextNode(text = ""): NodeProxy<grida.program.nodes.TextNode> {
    const id = this.idgen.next();
    // Use explicit scene-level target for programmatic text node creation
    this.insert(
      {
        id: id,
        prototype: {
          type: "text",
          _$id: id,
          text: text,
          width: "auto",
          height: "auto",
          fill: {
            type: "solid",
            color: kolor.colorformats.RGBA32F.BLACK,
            active: true,
          },
        },
      },
      this.mstate.scene_id ?? null
    );

    return this.getNodeById(id);
  }

  public createRectangleNode(): NodeProxy<grida.program.nodes.RectangleNode> {
    const id = this.idgen.next();
    // Use explicit scene-level target for programmatic rectangle node creation
    this.insert(
      {
        id: id,
        prototype: {
          type: "rectangle",
          _$id: id,
          width: 100,
          height: 100,
          fill: {
            type: "solid",
            color: kolor.colorformats.RGBA32F.BLACK,
            active: true,
          },
        },
      },
      this.mstate.scene_id ?? null
    );

    return this.getNodeById(id);
  }

  /**
   * Query nodes using selectors and return their IDs.
   * This is a pure query function that does not dispatch any actions.
   *
   * @param selectors - Array of selectors to query nodes
   * @returns Array of node IDs within the current scene, or empty array if none found
   *
   * @example
   * ```typescript
   * // Get all nodes in current scene
   * const allNodes = editor.commands.querySelectAll("~");
   *
   * // Get children of selected nodes
   * const children = editor.commands.querySelectAll(">");
   *
   * // Then use select() to actually select them
   * editor.commands.select(children, "reset");
   * ```
   */
  public querySelectAll(
    ...selectors: grida.program.document.Selector[]
  ): editor.NodeID[] {
    const { document_ctx, selection, scene_id } = this.mstate;
    const ids = Array.from(
      new Set(
        selectors.flatMap((selector) =>
          dq.querySelector(document_ctx, selection, selector)
        )
      )
    );

    // Filter to only include nodes within the current scene
    // This prevents selecting nodes from other scenes when using CMD+A on an empty scene
    const scene_scoped_ids = scene_id
      ? ids.filter((node_id) => {
          // Check if node belongs to the current scene
          const top_id = dq.getTopIdWithinScene(
            document_ctx,
            node_id,
            scene_id
          );
          return top_id !== null;
        })
      : ids;

    return scene_scoped_ids;
  }

  /**
   * Select nodes by their IDs with an optional selection mode.
   * This is the low-level selection action dispatcher.
   *
   * @param selection - Array of node IDs to select
   * @param mode - Selection mode: "reset" (replace), "add" (additive), or "toggle"
   * @default "reset"
   *
   * @example
   * ```typescript
   * // Reset selection to specific nodes
   * editor.commands.select([node1, node2], "reset");
   *
   * // Add nodes to current selection
   * editor.commands.select([node3], "add");
   *
   * // Toggle nodes in selection
   * editor.commands.select([node4], "toggle");
   *
   * // Query then select (common pattern)
   * const targets = editor.commands.querySelectAll("~");
   * editor.commands.select(targets);
   * ```
   */
  public select(
    selection: editor.NodeID[],
    mode: "reset" | "add" | "toggle" = "reset"
  ): void {
    if (selection.length === 0) {
      // If no ids provided, keep the current selection unchanged
      return;
    }

    this.dispatch({
      type: "select",
      selection,
      mode,
    });
  }

  public blur(debug_label?: string) {
    if (debug_label) this.log("debug:blur", debug_label);

    this.dispatch({
      type: "blur",
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

  public paste(target: editor.NodeID | editor.NodeID[]): editor.NodeID[] {
    const nodesBefore = new Set(Object.keys(this.mstate.document.nodes));

    this.dispatch({
      type: "paste",
      target,
    });

    const nodesAfter = Object.keys(this.mstate.document.nodes);
    return nodesAfter.filter((id) => !nodesBefore.has(id));
  }

  /**
   * TODO: Refactor this method to either:
   * 1. Rename to `insertVector` - since this method directly inserts a vector network
   *    without relying on memory clipboard data (unlike `paste()` which uses `state.user_clipboard`).
   *    This would be more accurate naming and consistent with `insert()`.
   * 2. OR make it use memory clipboard payload - store the vector network in `state.user_clipboard`
   *    and use the standard `paste()` flow, making it consistent with other paste operations.
   */
  public pasteVector(vector_network: vn.VectorNetwork): void {
    const scene_id = this.mstate.scene_id;
    if (!scene_id) {
      return;
    }
    this.dispatch({
      type: "paste-vector-network",
      vector_network,
      target: scene_id,
    });
  }

  public pastePayload(payload: io.clipboard.ClipboardPayload): boolean {
    switch (payload.type) {
      case "prototypes": {
        // Capture selection at start to prevent nesting when looping
        const currentSelection = [...this.mstate.selection];
        const target = resolveInsertTargetParent(this.mstate, currentSelection);

        payload.prototypes.forEach((p) => {
          const sub =
            grida.program.nodes.factory.create_packed_scene_document_from_prototype(
              p,
              () => this.idgen.next()
            );
          // Use explicit target to prevent nesting - all prototypes go to same parent
          this.insert({ document: sub }, target);
        });
        return true;
      }
    }

    return false;
  }

  public duplicate(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "duplicate",
      target,
    });
  }

  public flatten(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "flatten",
      target,
    });
  }

  public op(target: ReadonlyArray<editor.NodeID>, op: cg.BooleanOperation) {
    this.dispatch({
      type: "group-op",
      target: target,
      op: op,
    });
  }

  public union(target: ReadonlyArray<editor.NodeID>) {
    this.dispatch({
      type: "group-op",
      target: target,
      op: "union",
    });
  }

  public intersect(target: ReadonlyArray<editor.NodeID>) {
    this.dispatch({
      type: "group-op",
      target: target,
      op: "intersection",
    });
  }

  public subtract(target: ReadonlyArray<editor.NodeID>) {
    this.dispatch({
      type: "group-op",
      target: target,
      op: "difference",
    });
  }

  public exclude(target: ReadonlyArray<editor.NodeID>) {
    this.dispatch({
      type: "group-op",
      target: target,
      op: "xor",
    });
  }

  public groupMask(target: ReadonlyArray<editor.NodeID>) {
    assert(Array.isArray(target), "target must be an array");
    this.group(target);
    this.dispatch({
      type: "node/change/*",
      node_id: target[0],
      mask: "alpha",
    });
  }

  public applyScale(
    target: ReadonlyArray<editor.NodeID> | "selection",
    factor: number,
    options?: {
      origin?: "center" | cmath.CardinalDirection;
      include_subtree?: boolean;
      space?: "auto" | "global";
    }
  ) {
    const targets = (target === "selection" ? this.state.selection : target) as
      | ReadonlyArray<editor.NodeID>
      | undefined;
    if (!targets || targets.length === 0) return;
    if (!Number.isFinite(factor) || factor === 1) return;

    this.dispatch({
      type: "apply-scale",
      targets: Array.from(targets),
      factor,
      origin: options?.origin ?? "center",
      include_subtree: options?.include_subtree ?? true,
      space: options?.space ?? "auto",
    });
  }

  //
  public selectVertex(
    node_id: editor.NodeID,
    vertex: number,
    options: { additive?: boolean } = {}
  ) {
    this.dispatch({
      type: "select-vertex",
      target: {
        node_id,
        vertex,
      },
      additive: options.additive,
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

  public selectSegment(
    node_id: editor.NodeID,
    segment: number,
    options: { additive?: boolean } = {}
  ): void {
    this.dispatch({
      type: "select-segment",
      target: {
        node_id,
        segment,
      },
      additive: options.additive,
    });
  }

  public selectTangent(
    node_id: editor.NodeID,
    vertex: number,
    tangent: 0 | 1,
    options: { additive?: boolean } = {}
  ) {
    this.dispatch({
      type: "select-tangent",
      target: {
        node_id,
        vertex,
        tangent,
      },
      additive: options.additive,
    });
  }

  public deleteSegment(node_id: editor.NodeID, segment: number): void {
    this.dispatch({
      type: "delete-segment",
      target: {
        node_id,
        segment,
      },
    });
  }

  public splitSegment(node_id: editor.NodeID, point: vn.PointOnSegment) {
    this.dispatch({
      type: "split-segment",
      target: {
        node_id,
        point,
      },
    });
  }

  public translateVertex(
    node_id: editor.NodeID,
    vertex: number,
    delta: cmath.Vector2
  ) {
    this.dispatch({
      type: "translate-vertex",
      target: { node_id, vertex },
      delta,
    });
  }

  public translateSegment(
    node_id: editor.NodeID,
    segment: number,
    delta: cmath.Vector2
  ) {
    this.dispatch({
      type: "translate-segment",
      target: { node_id, segment },
      delta,
    });
  }

  public bendSegment(
    node_id: editor.NodeID,
    segment: number,
    ca: number,
    cb: cmath.Vector2,
    frozen: {
      a: cmath.Vector2;
      b: cmath.Vector2;
      ta: cmath.Vector2;
      tb: cmath.Vector2;
    }
  ) {
    this.dispatch({
      type: "bend-segment",
      target: { node_id, segment },
      ca,
      cb,
      frozen,
    });
  }

  public planarize(ids: editor.NodeID | editor.NodeID[]): void {
    this.dispatch({
      type: "vector/planarize",
      target: ids,
    });
  }

  public bendOrClearCorner(
    node_id: editor.NodeID,
    vertex: number,
    tangent?: cmath.Vector2 | 0,
    ref?: "ta" | "tb"
  ) {
    this.dispatch({
      type: "bend-or-clear-corner",
      target: { node_id, vertex, ref },
      tangent,
    });
  }

  public selectVariableWidthStop(node_id: editor.NodeID, stop: number): void {
    this.dispatch({
      type: "variable-width/select-stop",
      target: {
        node_id,
        stop,
      },
    });
  }

  public deleteVariableWidthStop(node_id: editor.NodeID, stop: number): void {
    this.dispatch({
      type: "variable-width/delete-stop",
      target: {
        node_id,
        stop,
      },
    });
  }

  public addVariableWidthStop(
    node_id: editor.NodeID,
    u: number,
    r: number
  ): void {
    this.dispatch({
      type: "variable-width/add-stop",
      target: {
        node_id,
        u,
        r,
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

  public insertNode(prototype: grida.program.nodes.NodePrototype) {
    const id = this.idgen.next();
    // Use explicit scene-level target for programmatic node insertion
    this.insert(
      {
        id,
        prototype,
      },
      this.mstate.scene_id ?? null
    );
    return id;
  }

  public delete(target: editor.NodeID[]): void {
    this.dispatch({
      type: "delete",
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
    target: editor.NodeID[],
    order: "back" | "front" | "forward" | "backward" | number
  ): void {
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

  public autoLayout(
    target: "selection" | editor.NodeID[],
    prefersDirectApplication: boolean = true
  ) {
    // Check if we should apply layout directly to a single container without layout
    if (
      prefersDirectApplication &&
      target === "selection" &&
      this.state.selection.length === 1
    ) {
      const node_id = this.state.selection[0]!;
      const node = this.getNodeSnapshotById(node_id);

      // If it's a container without a layout, apply layout directly
      // The reducer will analyze the container's children's spatial arrangement
      // to infer the optimal flex direction, spacing, and alignment (same as wrapping)
      if (
        node.type === "container" &&
        (node as grida.program.nodes.ContainerNode).layout !== "flex"
      ) {
        this.dispatch({
          type: "autolayout",
          contain: false,
          target: node_id,
        });
        return;
      }
    }

    // Default behavior: wrap nodes in new container(s)
    this.dispatch({
      type: "autolayout",
      contain: true,
      target,
    });
  }

  public reLayout(
    node_id: string,
    layout: "normal" | "flex-row" | "flex-column"
  ): void {
    const node = this.getNodeSnapshotById(node_id);
    assert(
      node.type === "container",
      `reLayout requires a container node, got ${node.type}`
    );

    // cases
    // none: no changes to be made
    // clear: any => no layout (make things absolute)
    // flex: non-flex => flex (apply flex layout, use autoLayout)
    // flex-direction-switch: flex => flex { direction } (change only the direction)
    type RelayoutAction =
      | { type: "none" }
      | { type: "clear" }
      | { type: "flex"; direction: "horizontal" | "vertical" }
      | { type: "flex-direction-switch"; direction: "horizontal" | "vertical" };

    const currentLayout = (node as grida.program.nodes.ContainerNode).layout;
    const currentDirection = (node as grida.program.nodes.ContainerNode)
      .direction;

    // Compute the action type
    const action: RelayoutAction = (() => {
      // Check if layout is already applied
      const isAlreadyApplied =
        (layout === "normal" && currentLayout !== "flex") ||
        (layout === "flex-row" &&
          currentLayout === "flex" &&
          currentDirection === "horizontal") ||
        (layout === "flex-column" &&
          currentLayout === "flex" &&
          currentDirection === "vertical");

      if (isAlreadyApplied) {
        return { type: "none" };
      }

      // Converting to normal layout (clearing flex)
      if (layout === "normal") {
        return { type: "clear" };
      }

      // Converting to flex layout
      const direction = layout === "flex-row" ? "horizontal" : "vertical";

      // If already flex, just switching direction
      if (currentLayout === "flex") {
        return { type: "flex-direction-switch", direction };
      }

      // Converting from non-flex to flex
      return { type: "flex", direction };
    })();

    // Handle each action type
    switch (action.type) {
      case "none":
        // No-op if already in desired state
        return;

      case "clear": {
        // [layout => no layout] - convert flex to absolute positioning
        const children = dq.getChildren(this.state.document_ctx, node_id);

        // Get current absolute positions of all children
        const childrenWithRects = children
          .map((child_id) => {
            const rect = this.geometry.getNodeAbsoluteBoundingRect(child_id);
            return rect ? { id: child_id, rect } : null;
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        // Get parent's absolute position to calculate relative offsets
        const parentRect = this.geometry.getNodeAbsoluteBoundingRect(node_id);
        assert(parentRect, "Parent rect not found");

        // Update parent to remove flex layout
        this.dispatch([
          {
            type: "node/change/*",
            node_id: node_id,
            layout: "flow",
            direction: undefined,
            main_axis_gap: undefined,
            cross_axis_gap: undefined,
            main_axis_alignment: undefined,
            cross_axis_alignment: undefined,
            layout_wrap: undefined,
          },
        ]);

        // Update each child to absolute positioning with calculated positions
        childrenWithRects.forEach(({ id, rect }) => {
          // Calculate position relative to parent
          const relativeLeft = rect.x - parentRect.x;
          const relativeTop = rect.y - parentRect.y;

          this.changeNodePropertyPositioning(id, {
            position: "absolute",
            left: cmath.quantize(relativeLeft, 1),
            top: cmath.quantize(relativeTop, 1),
            right: undefined,
            bottom: undefined,
          });
        });
        break;
      }

      case "flex": {
        // [no layout => layout] - use autoLayout
        const children = dq.getChildren(this.state.document_ctx, node_id);

        if (children.length === 0) {
          // If no children, just set the layout properties
          this.changeContainerNodeLayout(node_id, "flex");
          this.changeFlexContainerNodeDirection(node_id, action.direction);
          return;
        }

        // Use autoLayout with contain: false to apply layout to existing container
        this.dispatch({
          type: "autolayout",
          contain: false,
          target: node_id,
        });

        // Ensure the direction matches the requested layout
        // (autolayout guesses the direction, but we want to enforce the specific one)
        this.changeFlexContainerNodeDirection(node_id, action.direction);
        break;
      }

      case "flex-direction-switch":
        // Just switch the direction
        this.changeFlexContainerNodeDirection(node_id, action.direction);
        break;
    }
  }

  public contain(target: "selection" | editor.NodeID[]) {
    this.dispatch({
      type: "contain",
      target,
    });
  }

  public group(target: "selection" | editor.NodeID[]) {
    this.dispatch({
      type: "group",
      target,
    });
  }

  public ungroup(target: editor.NodeID): editor.NodeID[][] {
    // Validate and track children before ungrouping (helper also validates)
    const node = this.mstate.document.nodes[target];
    if (!node || (node.type !== "group" && node.type !== "boolean")) {
      // Not a group, reject/ignore - return empty array
      return [];
    }

    const childrenBefore = this.mstate.document.links[target] || [];

    this.dispatch({
      type: "ungroup",
      target,
    });

    // Return children as a single chunk (chunked by original group)
    return [childrenBefore];
  }

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
    this.getNodeById(node_id).active = next;
    return next;
  }

  toggleNodeLocked(node_id: string) {
    const next = !this.getNodeSnapshotById(node_id).locked;
    this.getNodeById(node_id).locked = next;
    return next;
  }

  lockAspectRatio(node_id: string) {
    const rect = this.geometry.getNodeAbsoluteBoundingRect(node_id);
    assert(
      rect,
      `Measured rect not found for node: ${node_id} (geometry not ready?)`
    );
    const w = rect.width;
    const h = rect.height;
    assert(
      typeof w === "number" && Number.isFinite(w) && w > 0,
      `Invalid measured width for node: ${node_id}`
    );
    assert(
      typeof h === "number" && Number.isFinite(h) && h > 0,
      `Invalid measured height for node: ${node_id}`
    );
    const pair = cmath.aspectRatio(w, h, 1000);
    if (!pair) return;

    this.dispatch({
      type: "node/change/*",
      node_id,
      layout_target_aspect_ratio: pair,
    });
  }

  unlockAspectRatio(node_id: string) {
    this.dispatch({
      type: "node/change/*",
      node_id,
      layout_target_aspect_ratio: undefined,
    });
  }

  toggleTextNodeUnderline(node_id: string) {
    this.dispatch({
      type: "node/toggle/underline",
      node_id: node_id,
    });
  }

  toggleTextNodeLineThrough(node_id: string) {
    this.dispatch({
      type: "node/toggle/line-through",
      node_id: node_id,
    });
  }

  changeNodePropertyProps(
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

  changeNodePropertyComponent(node_id: string, component_id: string) {
    this.dispatch({
      type: "node/change/component",
      node_id: node_id,
      component_id: component_id,
    });
  }

  changeNodePropertyText(
    node_id: string,
    text: tokens.StringValueExpression | null
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      text,
    });
  }

  changeNodeUserData(node_id: string, userdata: unknown) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      userdata: userdata as any,
    });
  }

  changeNodePropertyPositioning(
    node_id: string,
    positioning: Partial<grida.program.nodes.i.IPositioning>
  ) {
    this.dispatch({
      type: "node/change/positioning",
      node_id: node_id,
      ...positioning,
    });
  }

  changeNodePropertyPositioningMode(
    node_id: string,
    position: grida.program.nodes.i.IPositioning["position"]
  ) {
    this.dispatch({
      type: "node/change/positioning-mode",
      node_id: node_id,
      position,
    });
  }

  changeNodePropertySrc(node_id: string, src?: tokens.StringValueExpression) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      src,
    });
  }

  changeNodePropertyHref(
    node_id: string,
    href?: grida.program.nodes.i.IHrefable["href"]
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      href,
    });
  }

  changeNodePropertyTarget(
    node_id: string,
    target?: grida.program.nodes.i.IHrefable["target"]
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      target,
    });
  }

  changeNodeSize(
    node_id: string,
    axis: "width" | "height",
    value: grida.program.css.LengthPercentage | "auto"
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      [axis]: value,
    });
  }

  changeNodePropertyFills(node_id: string | string[], fills: cg.Paint[]) {
    const node_ids = Array.isArray(node_id) ? node_id : [node_id];
    this.dispatch(
      node_ids.map((node_id) => ({
        type: "node/change/*",
        node_id,
        fill_paints: fills,
      }))
    );
  }

  changeNodePropertyStrokes(node_id: string | string[], strokes: cg.Paint[]) {
    const node_ids = Array.isArray(node_id) ? node_id : [node_id];
    this.dispatch(
      node_ids.map((node_id) => ({
        type: "node/change/*",
        node_id,
        stroke_paints: strokes,
      }))
    );
  }

  addNodeFill(
    node_id: string | string[],
    fill: cg.Paint,
    at: "start" | "end" = "start"
  ) {
    const node_ids = Array.isArray(node_id) ? node_id : [node_id];
    this.dispatch(
      node_ids.map((node_id) => {
        const current = this.getNodeSnapshotById(node_id);
        const currentFills = Array.isArray((current as any).fill_paints)
          ? ((current as any).fill_paints as cg.Paint[])
          : (current as any).fill
            ? [(current as any).fill as cg.Paint]
            : [];

        const newFills =
          at === "start" ? [fill, ...currentFills] : [...currentFills, fill];

        return {
          type: "node/change/*",
          node_id,
          fill_paints: newFills,
        };
      })
    );
  }

  addNodeStroke(
    node_id: string | string[],
    stroke: cg.Paint,
    at: "start" | "end" = "start"
  ) {
    const node_ids = Array.isArray(node_id) ? node_id : [node_id];
    this.dispatch(
      node_ids.map((node_id) => {
        const current = this.getNodeSnapshotById(node_id);
        const currentStrokes = Array.isArray((current as any).stroke_paints)
          ? ((current as any).stroke_paints as cg.Paint[])
          : (current as any).stroke
            ? [(current as any).stroke as cg.Paint]
            : [];

        const newStrokes =
          at === "start"
            ? [stroke, ...currentStrokes]
            : [...currentStrokes, stroke];

        return {
          type: "node/change/*",
          node_id,
          stroke_paints: newStrokes,
        };
      })
    );
  }

  changeNodePropertyStrokeWidth(
    node_id: string,
    strokeWidth: editor.api.NumberChange
  ) {
    try {
      const value = resolveNumberChangeValue(
        this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
        "stroke_width",
        strokeWidth
      );

      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        stroke_width: value,
      });
    } catch (e) {
      reportError(e);
      return;
    }
  }

  changeNodePropertyStrokeTopWidth(
    node_id: editor.NodeID,
    stroke_top_width: number
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      rectangular_stroke_width_top: stroke_top_width,
    });
  }

  changeNodePropertyStrokeRightWidth(
    node_id: editor.NodeID,
    stroke_right_width: number
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      rectangular_stroke_width_right: stroke_right_width,
    });
  }

  changeNodePropertyStrokeBottomWidth(
    node_id: editor.NodeID,
    stroke_bottom_width: number
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      rectangular_stroke_width_bottom: stroke_bottom_width,
    });
  }

  changeNodePropertyStrokeLeftWidth(
    node_id: editor.NodeID,
    stroke_left_width: number
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      rectangular_stroke_width_left: stroke_left_width,
    });
  }

  changeNodePropertyStrokeAlign(node_id: string, stroke_align: cg.StrokeAlign) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      stroke_align,
    });
  }

  changeNodePropertyStrokeCap(node_id: string, strokeCap: cg.StrokeCap) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      stroke_cap: strokeCap,
    });
  }

  changeNodePropertyStrokeJoin(node_id: string, strokeJoin: cg.StrokeJoin) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      stroke_join: strokeJoin,
    });
  }

  changeNodePropertyStrokeMiterLimit(
    node_id: string,
    strokeMiterLimit: number
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      stroke_miter_limit: strokeMiterLimit,
    });
  }

  changeNodePropertyStrokeDashArray(
    node_id: string,
    strokeDashArray: number[] | undefined
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      stroke_dash_array: strokeDashArray,
    });
  }

  changeNodePropertyFit(node_id: string, fit: cg.BoxFit) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fit,
    });
  }

  changeNodePropertyCornerRadius(
    node_id: string,
    cornerRadius: cg.CornerRadius
  ) {
    if (typeof cornerRadius === "number") {
      // When a uniform corner radius is applied after using individual corner
      // values, the individual corner properties may still remain on the node
      // (e.g. corner_radius_bottom_left). Since the renderer prioritizes the
      // per-corner properties, the final value may appear reverted. To ensure
      // consistency, update all four corner values together when the uniform
      // radius is set.
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        corner_radius: cornerRadius,
        rectangular_corner_radius_top_left: cornerRadius,
        rectangular_corner_radius_top_right: cornerRadius,
        rectangular_corner_radius_bottom_right: cornerRadius,
        rectangular_corner_radius_bottom_left: cornerRadius,
      });
    } else {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        rectangular_corner_radius_top_left: cornerRadius[0],
        rectangular_corner_radius_top_right: cornerRadius[1],
        rectangular_corner_radius_bottom_right: cornerRadius[2],
        rectangular_corner_radius_bottom_left: cornerRadius[3],
      });
    }
  }

  changeNodePropertyCornerSmoothing(
    node_id: editor.NodeID,
    corner_smoothing: number
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      corner_smoothing,
    });
  }

  changeNodePropertyCornerRadiusWithDelta(
    node_id: string,
    delta: number
  ): void {
    const node = this.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.UnknwonNode;

    const applyDelta = (
      currentValue: number | undefined,
      delta: number
    ): number => {
      const startValue = currentValue ?? 0;
      const newValue = startValue + delta;
      return Math.max(0, newValue);
    };

    const next = {
      corner_radius: applyDelta(node.corner_radius, delta),
      rectangular_corner_radius_top_left: applyDelta(
        node.rectangular_corner_radius_top_left,
        delta
      ),
      rectangular_corner_radius_top_right: applyDelta(
        node.rectangular_corner_radius_top_right,
        delta
      ),
      rectangular_corner_radius_bottom_right: applyDelta(
        node.rectangular_corner_radius_bottom_right,
        delta
      ),
      rectangular_corner_radius_bottom_left: applyDelta(
        node.rectangular_corner_radius_bottom_left,
        delta
      ),
    };

    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      ...next,
    });
  }

  changeNodePropertyPointCount(
    node_id: editor.NodeID,
    pointCount: number
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      point_count: pointCount,
    });
  }

  changeNodePropertyInnerRadius(
    node_id: editor.NodeID,
    innerRadius: number
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      inner_radius: innerRadius,
    });
  }

  changeNodePropertyArcData(
    node_id: editor.NodeID,
    arcData: grida.program.nodes.i.IEllipseArcData
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      inner_radius: arcData.inner_radius,
      angle: arcData.angle,
      angle_offset: arcData.angle_offset,
    });
  }

  changeTextNodeFontWeight(node_id: string, fontWeight: cg.NFontWeight) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      font_weight: fontWeight,
    });
  }

  changeTextNodeFontKerning(node_id: string, fontKerning: boolean) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      font_kerning: fontKerning,
    });
  }

  changeTextNodeFontWidth(node_id: string, fontWidth: number) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      font_width: fontWidth,
    });
  }

  changeTextNodeFontFeature(
    node_id: editor.NodeID,
    feature: cg.OpenTypeFeature,
    value: boolean
  ): void {
    const node = this.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.TextNode;
    const features = Object.assign({}, node.font_features ?? {});
    features[feature] = value;

    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      font_features: features,
    });
  }
  changeTextNodeFontVariation(
    node_id: editor.NodeID,
    key: string,
    value: number
  ): void {
    const node = this.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.TextNode;
    const variations = Object.assign({}, node.font_variations ?? {});
    variations[key] = value;

    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      font_variations: variations,
    });
  }

  changeTextNodeFontOpticalSizing(
    node_id: editor.NodeID,
    fontOpticalSizing: cg.OpticalSizing
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      font_optical_sizing: fontOpticalSizing,
    });
  }

  changeTextNodeFontSize(node_id: string, fontSize: editor.api.NumberChange) {
    try {
      const value = resolveNumberChangeValue(
        this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
        "font_size",
        fontSize
      );

      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        font_size: value,
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
      text_align: textAlign,
    });
  }

  changeTextNodeTextAlignVertical(
    node_id: string,
    textAlignVertical: cg.TextAlignVertical
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      text_align_vertical: textAlignVertical,
    });
  }

  changeTextNodeTextTransform(
    node_id: string,
    textTransform: cg.TextTransform
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      text_transform: textTransform,
    });
  }

  changeTextNodeTextDecorationLine(
    node_id: string,
    textDecorationLine: cg.TextDecorationLine
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      text_decoration_line: textDecorationLine,
    });
  }

  changeTextNodeTextDecorationStyle(
    node_id: string,
    textDecorationStyle: cg.TextDecorationStyle
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      text_decoration_style: textDecorationStyle,
    });
  }

  changeTextNodeTextDecorationThickness(
    node_id: string,
    textDecorationThickness: cg.TextDecorationThicknessPercentage
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      text_decoration_thickness: textDecorationThickness,
    });
  }

  changeTextNodeTextDecorationColor(
    node_id: string,
    textDecorationColor: cg.TextDecorationColor
  ) {
    const value =
      textDecorationColor === "currentcolor" ? null : textDecorationColor;

    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      text_decoration_color: value,
    });
  }

  changeTextNodeTextDecorationSkipInk(
    node_id: string,
    textDecorationSkipInk: cg.TextDecorationSkipInkFlag
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      text_decoration_skip_ink: textDecorationSkipInk,
    });
  }

  changeTextNodeLineHeight(
    node_id: string,
    lineHeight: editor.api.NumberChange
  ) {
    try {
      const value = resolveNumberChangeValue(
        this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
        "line_height",
        lineHeight
      );
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        line_height: value,
      });
    } catch (e) {
      reportError(e);
      return;
    }
  }

  changeTextNodeLetterSpacing(
    node_id: string,
    letterSpacing: editor.api.TChange<
      grida.program.nodes.TextNode["letter_spacing"]
    >
  ) {
    try {
      let value: number | undefined;
      if (letterSpacing.value === undefined) {
        value = undefined;
      } else {
        value = resolveNumberChangeValue(
          this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
          "letter_spacing",
          letterSpacing as editor.api.NumberChange
        );
      }

      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        letter_spacing: value,
      });
    } catch (e) {
      reportError(e);
      return;
    }
  }

  changeTextNodeWordSpacing(
    node_id: string,
    wordSpacing: editor.api.TChange<
      grida.program.nodes.TextNode["word_spacing"]
    >
  ) {
    try {
      let value: number | undefined;
      if (wordSpacing.value === undefined) {
        value = undefined;
      } else {
        value = resolveNumberChangeValue(
          this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
          "word_spacing",
          wordSpacing as editor.api.NumberChange
        );
      }

      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        word_spacing: value,
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
      max_length: maxLength,
    });
  }

  changeTextNodeMaxLines(node_id: string, maxLines: number | null): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      max_lines: maxLines,
    });
  }

  //
  changeNodePropertyBorder(
    node_id: string,
    border: grida.program.css.Border | undefined
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      border: border,
    });
  }
  //
  changeContainerNodePadding(
    node_id: string,
    padding: grida.program.nodes.i.IPadding
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      ...padding,
    });
  }

  changeNodeFilterEffects(
    node_id: editor.NodeID,
    effects?: cg.FilterEffect[]
  ): void {
    const fe_blur = effects?.find((effect) => effect.type === "filter-blur") as
      | cg.FeLayerBlur
      | undefined;
    const fe_backdrop_blur = effects?.find(
      (effect) => effect.type === "backdrop-filter-blur"
    ) as cg.FeBackdropBlur | undefined;
    const fe_shadows = effects?.filter(
      (e): e is cg.FeShadow => e.type === "shadow"
    );
    const fe_liquid_glass = effects?.find(
      (effect) => effect.type === "glass"
    ) as cg.FeLiquidGlass | undefined;
    const fe_noises = effects?.filter(
      (e): e is cg.FeNoise => e.type === "noise"
    );

    const i: grida.program.nodes.i.IEffects = {
      fe_backdrop_blur,
      fe_blur,
      fe_shadows,
      fe_liquid_glass,
      fe_noises,
    };

    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      ...i,
    });
  }

  changeNodeFeShadows(node_id: string, effects?: cg.FeShadow[]) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fe_shadows: effects,
    });
  }

  changeNodeFeBlur(node_id: string, effect?: cg.FeLayerBlur) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fe_blur: effect,
    });
  }

  changeNodeFeBackdropBlur(
    node_id: editor.NodeID,
    effect?: cg.FeBackdropBlur
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fe_backdrop_blur: effect,
    });
  }

  changeNodeFeNoises(node_id: editor.NodeID, effects?: cg.FeNoise[]): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fe_noises: effects,
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
      main_axis_alignment: mainAxisAlignment,
    });
  }

  changeFlexContainerNodeCrossAxisAlignment(
    node_id: string,
    crossAxisAlignment: cg.CrossAxisAlignment
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      cross_axis_alignment: crossAxisAlignment,
    });
  }
  changeFlexContainerNodeGap(
    node_id: string,
    gap: number | { main_axis_gap: number; cross_axis_gap: number }
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      main_axis_gap: typeof gap === "number" ? gap : gap.main_axis_gap,
      cross_axis_gap: typeof gap === "number" ? gap : gap.cross_axis_gap,
    });
  }
  changeFlexContainerNodeWrap(node_id: string, layoutWrap: "wrap" | "nowrap") {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      layout_wrap: layoutWrap,
    });
  }
  //
  changeNodePropertyMouseCursor(node_id: string, cursor: cg.SystemMouseCursor) {
    this.dispatch({
      type: "node/change/*",
      node_id,
      cursor,
    });
  }
  changeNodePropertyStyle(
    node_id: string,
    key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
    value: any
  ) {
    this.dispatch({
      type: "node/change/style",
      node_id: node_id,
      style: {
        [key]: value,
      },
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

  dispose() {
    this.listeners.clear();
  }
}

export type { EditorDocumentStore };

export class Editor
  implements
    editor.IStoreSubscriptionTrait<editor.state.IEditorState>,
    editor.api.IEditorDocumentStoreConsumerWithConstraintsActions,
    editor.api.IDocumentFontActions,
    editor.api.IDocumentImageActions,
    editor.api.IDocumentGeometryQuery,
    editor.api.IDocumentNodeTextNodeFontActions,
    editor.api.IDocumentExportPluginActions,
    editor.api.IDocumentVectorInterfaceActions,
    editor.api.IDocumentSVGInterfaceProvider,
    editor.api.IDocumentMarkdownInterfaceProvider,
    editor.api.IEditorIntrospectActions
{
  // private readonly listeners: Set<(editor: this, action?: Action) => void> = new Set();
  private readonly logger: (...args: any[]) => void;

  /**
   * [main camera]
   * grida currently implements single camera system.
   */
  readonly camera: Camera;
  readonly surface: EditorSurface;
  readonly backend: editor.EditorContentRenderingBackend;
  readonly doc: EditorDocumentStore;

  private _m_wasm_canvas_scene: Scene | null = null;
  private _m_exporter: editor.api.IDocumentExporterInterfaceProvider =
    new NoopDefaultExportInterfaceProvider();

  public get exporter() {
    return this._m_exporter;
  }

  _m_geometry: editor.api.IDocumentGeometryInterfaceProvider;
  get geometryProvider() {
    return this._m_geometry;
  }

  _m_vector: editor.api.IDocumentVectorInterfaceProvider | null = null;
  private get vectorProvider() {
    return this._m_vector;
  }

  _m_svg: editor.api.IDocumentSVGInterfaceProvider | null = null;
  public get svgProvider() {
    return this._m_svg;
  }

  _m_markdown: editor.api.IDocumentMarkdownInterfaceProvider | null = null;
  public get markdownProvider() {
    return this._m_markdown;
  }

  _m_font_collection: editor.api.IDocumentFontCollectionInterfaceProvider | null =
    null;
  public get fontCollection() {
    return this._m_font_collection;
  }

  _m_font_parser: editor.api.IDocumentFontParserInterfaceProvider | null = null;
  public get fontParser() {
    return this._m_font_parser;
  }

  private readonly _fontManager: DocumentFontManager;

  readonly onMount?: (surface: Scene) => void;

  get state() {
    return this.doc.state;
  }

  get transform() {
    return this.doc.state.transform;
  }

  get debug() {
    return this.doc.state.debug;
  }

  set debug(value: boolean) {
    this.doc.reduce((state) => {
      state.debug = value;
      return state;
    });
  }

  public toggleDebug() {
    this.debug = !this.debug;
    return this.debug;
  }

  readonly commands: editor.api.EditorCommands;

  constructor({
    logger = console.log,
    backend,
    viewportElement,
    geometry,
    initialState,
    interfaces = {},
    onCreate,
    onMount,
  }: {
    logger?: (...args: any[]) => void;
    backend: editor.EditorContentRenderingBackend;
    viewportElement: string | HTMLElement;
    geometry:
      | editor.api.IDocumentGeometryInterfaceProvider
      | ((editor: Editor) => editor.api.IDocumentGeometryInterfaceProvider);
    initialState: editor.state.IEditorStateInit;
    onCreate?: (editor: Editor) => void;
    onMount?: (surface: Scene) => void;
    interfaces?: {
      exporter?: WithEditorInstance<editor.api.IDocumentExporterInterfaceProvider>;
      vector?: WithEditorInstance<editor.api.IDocumentVectorInterfaceProvider>;
      font_collection?: WithEditorInstance<editor.api.IDocumentFontCollectionInterfaceProvider>;
      font_parser?: WithEditorInstance<editor.api.IDocumentFontParserInterfaceProvider>;
      svg?: WithEditorInstance<editor.api.IDocumentSVGInterfaceProvider>;
      markdown?: WithEditorInstance<editor.api.IDocumentMarkdownInterfaceProvider>;
    };
  }) {
    this.logger = logger;
    this.onMount = onMount;
    this.backend = backend;
    this.camera = new Camera(this, new domapi.DOMViewportApi(viewportElement));
    this.doc = new EditorDocumentStore(
      grida.id.noop.generator, // test only
      // // TODO: resolve from server
      // new grida.id.u32.NodeIdGenerator({
      //   actor: grida.id.u32.k.OFFLINE_ACTOR_ID,
      // }),
      initialState,
      backend,
      this,
      this,
      this,
      () => this.camera.viewport.size,
      logger
    );
    this.surface = new EditorSurface(this);

    this._m_geometry =
      typeof geometry === "function" ? geometry(this) : geometry;
    //

    if (interfaces?.exporter) {
      this._m_exporter = resolveWithEditorInstance(this, interfaces.exporter);
    }

    if (interfaces?.vector) {
      this._m_vector = resolveWithEditorInstance(this, interfaces.vector);
    }

    if (interfaces?.font_collection) {
      this._m_font_collection = resolveWithEditorInstance(
        this,
        interfaces.font_collection
      );
    }

    if (interfaces?.font_parser) {
      this._m_font_parser = resolveWithEditorInstance(
        this,
        interfaces.font_parser
      );
    }

    if (interfaces?.svg) {
      this._m_svg = resolveWithEditorInstance(this, interfaces.svg);
    }

    if (interfaces?.markdown) {
      this._m_markdown = resolveWithEditorInstance(this, interfaces.markdown);
    }

    this._fontManager = new DocumentFontManager(this);

    this._do_legacy_warmup();
    this.commands = this.doc;
    onCreate?.(this);

    this.log("editor instantiated");
  }

  /**
   * legacy warmup - ideally, this should be called externally, or once internallu,
   * but as we allow dynamic surface binding, this proccess shall be duplicated once surface binded as well.
   */
  private _do_legacy_warmup() {
    // warm up
    // TODO: remove this from core document state.
    googlefonts.fetchWebfontList().then((webfontlist) => {
      this.doc.dispatch({
        type: "__internal/webfonts#webfontList",
        webfontlist,
      });
      void this.loadPlatformDefaultFonts();
    });
  }

  private log(...args: any[]) {
    if (this.debug || process.env.NODE_ENV === "development") {
      this.logger?.(...args);
    }
  }

  public subscribe(fn: editor.api.SubscriptionCallbackFn<this>) {
    // TODO: we can have a single subscription to the document and use that.
    // Subscribe to the document store changes
    return this.doc.subscribe((doc, action, patches) => {
      // Forward the document store changes to our listeners
      fn(this, action, patches);
    });
  }

  public archive(): Blob {
    const documentData = {
      version: "0.89.0-beta+20251219",
      document: this.getSnapshot().document,
    } satisfies io.JSONDocumentFileModel;

    const blob = new Blob([io.archive.pack(documentData) as BlobPart], {
      type: "application/zip",
    });

    return blob;
  }

  public getSnapshot(): Readonly<editor.state.IEditorState> {
    return this.doc.state;
  }

  public getJson(): unknown {
    return JSON.parse(JSON.stringify(this.doc.state));
  }

  public getDocumentJson(): unknown {
    return JSON.parse(JSON.stringify(this.doc.state.document));
  }

  public tree(entryId?: string): string {
    return describeDocumentTree(
      this.doc.state.document,
      this.doc.state.document_ctx,
      {
        entryId,
        chars: editor.ascii.chars,
      }
    );
  }

  private __bind_wasm_surface(surface: Scene) {
    this._m_wasm_canvas_scene = surface;
    //
    this._m_geometry = new CanvasWasmGeometryQueryInterfaceProvider(
      this,
      surface
    );

    this._m_exporter = new CanvasWasmDefaultExportInterfaceProvider(
      this,
      surface
    );

    this._m_vector = new CanvasWasmVectorInterfaceProvider(this, surface);

    this._m_svg = new CanvasWasmSVGInterfaceProvider(this, surface);

    this._m_markdown = new CanvasWasmMarkdownInterfaceProvider(this, surface);

    this._m_font_collection = new CanvasWasmFontManagerAgentInterfaceProvider(
      this,
      surface
    );

    this._m_font_parser = new CanvasWasmFontParserInterfaceProvider(
      this,
      surface
    );

    this._do_legacy_warmup();
  }

  /**
   * mount the canvas surface
   * this does not YET manage the width / height / dpr. It assumes the canvas sets its own physical width / height.
   * @param el canvas element
   */
  public async mount(el: HTMLCanvasElement) {
    this.log("mount surface");
    assert(this.backend === "canvas", "Editor is not using canvas backend");

    await init({
      locateFile: locateFile,
    }).then((factory) => {
      const surface = factory.createWebGLCanvasSurface(el);
      surface.runtime_renderer_set_cache_tile(false);
      // surface.setDebug(this.debug);
      // surface.setVerbose(this.debug);
      this.__bind_wasm_surface(surface);
      this.onMount?.(surface);

      this.log("grida wasm initialized");

      const syncTransform = (
        surface: Scene,
        transform: cmath.Transform,
        // physical width
        width: number,
        // physical height
        height: number
      ) => {
        // the transform is the canvas transform, which needs to be converted to camera transform.
        // input transform = translation + scale of the viewport, top left aligned
        // camera transform = transform of the camera, center aligned
        // - translate the transform to the center of the canvas
        // - reverse the transform to match the canvas coordinate system

        const toCenter = cmath.transform.translate(cmath.transform.identity, [
          -width / 2,
          -height / 2,
        ]);

        const dpr = window.devicePixelRatio || 1;

        const deviceScale: cmath.Transform = [
          [dpr, 0, 0],
          [0, dpr, 0],
        ];

        const physicalTransform = cmath.transform.multiply(
          deviceScale,
          transform
        );

        const viewMatrix = cmath.transform.multiply(
          toCenter,
          physicalTransform
        );

        surface.setMainCameraTransform(cmath.transform.invert(viewMatrix));
        surface.redraw();
      };

      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target == el) {
            this._m_wasm_canvas_scene?.resize(el.width, el.height);
            syncTransform(
              this._m_wasm_canvas_scene!,
              this.state.transform,
              el.width,
              el.height
            );
          }
        }
      });

      // TODO: cleanup not handled
      ro.observe(el, { box: "device-pixel-content-box" });

      if (process.env.NEXT_PUBLIC_GRIDA_WASM_VERBOSE === "1") {
        this.log("wasm::factory", factory.module);
      }

      const syncDocument = (
        surface: Scene,
        document: grida.program.document.Document,
        sceneId?: string
      ) => {
        const payloadDocument: grida.program.document.Document =
          sceneId && document.entry_scene_id !== sceneId
            ? {
                ...document,
                entry_scene_id: sceneId,
              }
            : document;

        const p = JSON.stringify({
          version: "0.89.0-beta+20251219",
          document: payloadDocument,
        });
        surface.loadScene(p);
        surface.redraw();
      };

      // setup hooks
      // - state.document
      // - state.scene_id
      // - state.debug
      // - state.transform
      // - [state.hovered_node_id, state.selection]

      // once
      syncDocument(
        this._m_wasm_canvas_scene!,
        this.doc.state.document,
        this.doc.state.scene_id
      );
      syncTransform(
        this._m_wasm_canvas_scene!,
        this.doc.state.transform,
        el.width,
        el.height
      );

      // fit the camera
      this.camera.fit("*");

      // subscribe
      this.doc.subscribeWithSelector(
        (state) => state.document,
        (_, document, _prev, action, patches) => {
          // FIXME: Unstable
          // the current patch based sync is not stable, it WILL fail to direct sync when deleting a node, etc.
          // this is not fully tested, and the direct sync fallback should kept as-is until we fully investicate this.

          if (!this._m_wasm_canvas_scene) return;

          // Full sync on document reset
          if (action?.type === "document/reset") {
            syncDocument(
              this._m_wasm_canvas_scene,
              document,
              this.doc.state.scene_id
            );
            // Perform initial actions after reset
            this.camera.fit("*");
            return;
          }

          // Patch-based sync for normal changes
          if (!patches || patches.length === 0) return;

          const documentPatches = patches.filter(
            (patch) => patch.path[0] === "document"
          );

          if (documentPatches.length === 0) {
            return;
          }

          const operations =
            editor.api.patch.toJsonPatchOperations(documentPatches);
          if (operations.length === 0) {
            return;
          }

          const result = this._m_wasm_canvas_scene.applyTransactions([
            operations,
          ]);

          if (!result || result.some((report) => !report.success)) {
            syncDocument(
              this._m_wasm_canvas_scene,
              document,
              this.doc.state.scene_id
            );
            this.log("falling back to direct sync", result);
          } else {
            this._m_wasm_canvas_scene.redraw();
          }
        }
      );

      this.doc.subscribeWithSelector(
        (state) => state.scene_id,
        (_, scene_id) => {
          if (!this._m_wasm_canvas_scene) return;

          const document = this.doc.state.document;
          syncDocument(this._m_wasm_canvas_scene, document, scene_id);
        }
      );

      this.doc.subscribeWithSelector(
        (state) => state.debug,
        (_, v) => {
          this._m_wasm_canvas_scene?.setDebug(v);
          this._m_wasm_canvas_scene?.redraw();
        }
      );

      this.doc.subscribeWithSelector(
        (state) => {
          const hovered = state.hovered_node_id;
          const selected = state.selection;
          return [...selected, ...(hovered ? [hovered] : [])];
        },
        (_, v) => {
          this._m_wasm_canvas_scene?.highlightStrokes({
            nodes: v,
            style: {
              strokeWidth: 1,
              // --color-workbench-accent-sky
              stroke: "#00a6f4",
            },
          });
          this._m_wasm_canvas_scene?.redraw();
        }
      );

      this.doc.subscribeWithSelector(
        (state) => state.transform,
        (_, v) => {
          syncTransform(this._m_wasm_canvas_scene!, v, el.width, el.height);
        }
      );
    });
  }

  // ================================================================
  // #region IDocumentImageInterfaceActions implementation
  // ================================================================

  private readonly images = new Map<string, grida.program.document.ImageRef>();

  __is_image_registered(ref: string): boolean {
    return this.images.has(ref);
  }

  __get_image_ref(ref: string): grida.program.document.ImageRef | null {
    return this.images.get(ref) || null;
  }

  __get_image_bytes_for_wasm(ref: string): Uint8Array | null {
    assert(this._m_wasm_canvas_scene, "WASM canvas scene is not initialized");
    const data = this._m_wasm_canvas_scene.getImageBytes(ref);
    if (!data) return null;
    return new Uint8Array(data);
  }

  __get_image_size_for_wasm(
    ref: string
  ): { width: number; height: number } | null {
    assert(this._m_wasm_canvas_scene, "WASM canvas scene is not initialized");
    const size = this._m_wasm_canvas_scene.getImageSize(ref);
    if (!size) return null;
    return size;
  }

  protected _experimental_createImage_for_wasm(
    data: Uint8Array
  ): Readonly<grida.program.document.ImageRef> {
    assert(this._m_wasm_canvas_scene, "WASM canvas scene is not initialized");

    const result = this._m_wasm_canvas_scene.addImage(data);
    if (!result) throw new Error("addImage failed");
    const { hash, url, width, height, type } = result;

    const ref: grida.program.document.ImageRef = {
      url,
      width,
      height,
      bytes: data.byteLength,
      type: type as grida.program.document.ImageType,
    };

    this.images.set(url, ref);

    return ref;
  }

  public insert(
    payload:
      | {
          id?: string;
          prototype: grida.program.nodes.NodePrototype;
        }
      | {
          document: grida.program.document.IPackedSceneDocument;
        },
    target: editor.NodeID | null
  ): editor.NodeID[] {
    const insertedNodeIds = this.doc.insert(payload, target);
    for (const font of this.doc.state.fontfaces) {
      this.loadFontSync(font);
    }
    return insertedNodeIds;
  }

  async createImageAsync(
    src: string
  ): Promise<Readonly<grida.program.document.ImageRef>> {
    const res = await fetch(src);
    const blob = await res.blob();
    const bytes = await blob.arrayBuffer();
    const type = blob.type;

    // TODO: add file validation

    return this.createImage(
      new Uint8Array(bytes),
      src,
      type as grida.program.document.ImageType
    );
  }

  async createImage(
    data: Uint8Array,
    url?: string,
    type?: grida.program.document.ImageType | (string | {})
  ): Promise<Readonly<grida.program.document.ImageRef>> {
    // TODO: add file validation

    if (this.backend === "canvas" && this._m_wasm_canvas_scene) {
      return this._experimental_createImage_for_wasm(data);
    }

    // For DOM backend, we need to get dimensions
    const imageUrl = url || URL.createObjectURL(new Blob([data as BlobPart]));

    const { width, height } = await new Promise<{
      width: number;
      height: number;
    }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = imageUrl;
    });

    const ref: grida.program.document.ImageRef = {
      url: url || imageUrl,
      width,
      height,
      bytes: data.byteLength,
      type: (type as grida.program.document.ImageType) || "image/png",
    };

    this.doc.reduce((state) => {
      state.document.images[ref.url] = ref;
      return state;
    });

    return ref;
  }

  getImage(ref: string): ImageProxy | null {
    if (!this.__is_image_registered(ref)) return null;
    return new ImageProxy(this, ref);
  }

  // #endregion

  /**
   * Checks if a node is being used as a mask
   * @param target the node to test
   */
  public isMask(target: editor.NodeID) {
    const n = this.doc.getNodeSnapshotById(target);
    return "mask" in n && n.mask;
  }

  /**
   * groups targets as mask, if multiple, if single && is mask, remove mask
   * @param target
   */
  public toggleMask(target: ReadonlyArray<editor.NodeID>) {
    if (target.length === 0) return;
    if (target.length === 1) {
      if (this.isMask(target[0])) {
        this.removeMask(target[0]);
        return;
      }
    }
    this.doc.groupMask(target);
  }

  public removeMask(target: editor.NodeID) {
    if (!this.isMask(target)) return;
    this.doc.dispatch({
      type: "node/change/*",
      node_id: target,
      mask: null,
    });
  }

  // #endregion IDocumentEditorActions implementation

  // #region IDocumentGeometryQuery implementation

  public getNodeIdsFromPointerEvent(
    event: PointerEvent | MouseEvent
  ): string[] {
    return this.geometryProvider.getNodeIdsFromPointerEvent(event);
  }

  public getNodeIdsFromPoint(point: cmath.Vector2): string[] {
    return this.geometryProvider.getNodeIdsFromPoint(point);
  }

  public getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[] {
    return this.geometryProvider.getNodeIdsFromEnvelope(envelope);
  }

  public getNodeAbsoluteBoundingRect(
    node_id: editor.NodeID
  ): cmath.Rectangle | null {
    return this.geometryProvider.getNodeAbsoluteBoundingRect(node_id);
  }

  public getNodeAbsoluteRotation(node_id: editor.NodeID): number {
    const parent_ids = dq.getAncestors(this.doc.state.document_ctx, node_id);

    let rotation = 0;
    // Calculate the absolute rotation
    try {
      for (const parent_id of parent_ids) {
        const parent_node = this.doc.getNodeSnapshotById(parent_id);
        assert(parent_node, `parent node not found: ${parent_id}`);
        if ("rotation" in parent_node) {
          rotation += parent_node.rotation ?? 0;
        }
      }

      // finally, add the node's own rotation
      const node = this.doc.getNodeSnapshotById(node_id);
      assert(node, `node not found: ${node_id}`);
      if ("rotation" in node) {
        rotation += node.rotation ?? 0;
      }
    } catch (e) {
      reportError(e);
    }

    return rotation;
  }

  // #endregion IDocumentGeometryQuery implementation

  toggleTextNodeBold(node_id: string) {
    const node = this.doc.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.TextNode;
    if (node.type !== "text") return false;

    const isBold = node.font_weight === 700;
    const next_weight = isBold ? 400 : 700;
    const fontFamily = node.font_family;
    if (!fontFamily) return false;

    const match = this.selectFontStyle({
      fontFamily: fontFamily,
      fontWeight: next_weight,
      fontStyleItalic: node.font_style_italic,
    });

    if (!match) {
      this.log(
        "toggleNodeBold: matching font face not found",
        fontFamily,
        next_weight,
        node.font_style_italic
      );
      return false;
    }

    this.changeTextNodeFontStyle(node_id, { fontStyleKey: match.key });
    return match.key.fontWeight as cg.NFontWeight;
  }

  toggleTextNodeItalic(node_id: string) {
    const node = this.doc.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.TextNode;
    if (node.type !== "text") return false;

    const next_italic = !node.font_style_italic;
    const fontFamily = node.font_family;
    if (!fontFamily) return false;

    const match = this.selectFontStyle({
      fontFamily: fontFamily,
      fontWeight: node.font_weight,
      fontStyleItalic: next_italic,
    });

    if (!match) {
      this.log(
        "toggleNodeItalic: matching font face not found",
        fontFamily,
        next_italic,
        node.font_weight
      );
      return false;
    }

    this.changeTextNodeFontStyle(node_id, { fontStyleKey: match.key });
    return true;
  }

  changeTextNodeFontStyle(
    node_id: string,
    fontStyleDescription: editor.api.FontStyleChangeDescription
  ) {
    const { fontStyleKey } = fontStyleDescription;
    const next_family = fontStyleKey.fontFamily;

    const node = this.doc.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.TextNode;

    const prev: grida.program.nodes.i.IFontStyle = {
      font_postscript_name: node.font_postscript_name,
      font_weight: node.font_weight,
      font_width: node.font_width,
      font_kerning: node.font_kerning,
      font_size: node.font_size,
      font_variations: node.font_variations,
      font_features: node.font_features,
      font_optical_sizing: node.font_optical_sizing,
      font_style_italic: node.font_style_italic,
    };

    const description = Object.assign(
      {},
      {
        fontFamily: next_family,
        fontInstancePostscriptName: fontStyleKey.fontPostscriptName,
        fontStyleItalic: fontStyleKey.fontStyleItalic,
        fontWeight: fontStyleKey.fontWeight,
      } satisfies Partial<editor.api.FontStyleSelectDescription>,
      Object.fromEntries(
        Object.entries(fontStyleKey).filter(([_, v]) => v !== undefined)
      )
    ) as editor.api.FontStyleSelectDescription;

    const match = this.selectFontStyle(description);

    // reject
    if (!match) {
      this.log(
        "matching font face not found",
        fontStyleKey.fontFamily,
        description
      );
      return;
    }

    const {
      font_family: _fontFamily,
      ...next
    }: grida.program.nodes.i.IFontStyle = {
      ...prev,
      font_postscript_name:
        match.instance?.postscriptName || match.face.postscriptName,
      // ----
      // [high level variables]
      font_weight: match.instance?.coordinates?.wght ?? prev.font_weight,
      font_width: match.instance?.coordinates?.wdth ?? prev.font_width,
      // TODO: should prevent optical sizing auto => fixed
      // (if the next value === auto's expected value && prev value is auto, keep auto) => the change style does not change the size, so the logic can be even simpler.
      font_optical_sizing:
        match.instance?.coordinates?.opsz ?? prev.font_optical_sizing,
      // ----
      // Clear variable axes for non-variable fonts
      font_variations: match.isVariable
        ? match.instance?.coordinates
        : undefined,
      // TODO: clean the invalid features by face change.
      // fontFeatures: match.features,
      font_style_italic: match.face.italic,
    } as const;

    this.doc.dispatch({
      type: "node/change/fontFamily",
      node_id: node_id,
      fontFamily: next_family,
    });

    this.doc.dispatch({
      type: "node/change/*",
      node_id: node_id,
      ...next,
    });
  }

  // text style
  async changeTextNodeFontFamilySync(
    node_id: string,
    fontFamily: string,
    force = true
  ) {
    const node = this.doc.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.TextNode;
    assert(node, "node is not found");
    assert(node.type === "text", "node is not a text node");

    // load the font family & prepare
    await this.loadFontSync({ family: fontFamily });
    const ready = await this.getFontFamilyDetailsSync(fontFamily);

    if (!ready) {
      this.log(
        "tried to change font family, but the font could not be parsed correctly",
        fontFamily
      );
      return false;
    }

    const description: editor.api.FontStyleSelectDescription = { fontFamily };

    if (!force) {
      // when not force, try to keep the previous (current) font style
      description.fontWeight = node.font_weight;
      description.fontStyleItalic = node.font_style_italic;
      description.fontVariations = node.font_variations;
    }

    const match = this.selectFontStyle(description);

    if (match) {
      this.changeTextNodeFontStyle(node_id, { fontStyleKey: match.key });
      return true;
    } else {
      this.log(
        "tried to change font family, but matching font face not found",
        fontFamily,
        description
      );
      return false;
    }
  }

  /**
   * removes explicit width or height value from the text node, making them sized "auto", based on the content.
   */
  autoSizeTextNode(node_id: string, axis: "width" | "height") {
    const node = this.doc.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.UnknwonNode;
    if (node.type !== "text") return;

    const prev = this.geometryProvider.getNodeAbsoluteBoundingRect(node_id);
    if (!prev) return;

    const h_align = node.text_align;
    const v_align = node.text_align_vertical;

    // FIXME: nested raf.
    // why this is needed?
    // currently, the api does not expose a way or contains value for textlayout size, not the box size.
    // since we can't pre-calculate the delta, this is the dirty hack to first resize, then get the next size, shift delta.
    // => need api/data that holds actual textlayout size (non box size)

    requestAnimationFrame(() => {
      this.doc.dispatch({
        type: "node/change/*",
        node_id: node_id,
        [axis]: "auto",
      });

      requestAnimationFrame(() => {
        const next = this.geometryProvider.getNodeAbsoluteBoundingRect(node_id);
        if (!next) return;

        if (axis === "width") {
          const diff = prev.width - next.width;
          if (diff === 0) return;
          let left = prev.x;
          switch (h_align) {
            case "right":
              left = prev.x + diff;
              break;
            case "center":
              left = prev.x + diff / 2;
              break;
            default:
              return;
          }
          this.doc.changeNodePropertyPositioning(node_id, {
            left: cmath.quantize(left, 1),
          });
        } else {
          const diff = prev.height - next.height;
          if (diff === 0) return;
          let top = prev.y;
          switch (v_align) {
            case "bottom":
              top = prev.y + diff;
              break;
            case "center":
              top = prev.y + diff / 2;
              break;
            default:
              return;
          }
          this.doc.changeNodePropertyPositioning(node_id, {
            top: cmath.quantize(top, 1),
          });
        }
      });
    });
  }

  // #endregion IRulerActions implementation

  // #region IVectorInterfaceActions implementation
  toVectorNetwork(node_id: string): vn.VectorNetwork | null {
    if (!this.vectorProvider) {
      throw new Error("Vector interface provider is not bound");
    }
    return this.vectorProvider.toVectorNetwork(node_id);
  }
  // #endregion IVectorInterfaceActions implementation

  // #region IDocumentSVGInterfaceActions implementation
  public svgOptimize(svg: string): string | null {
    if (!this.svgProvider) {
      throw new Error("SVG interface provider is not bound");
    }
    return this.svgProvider.svgOptimize(svg);
  }

  public svgPack(
    svg: string
  ): { svg: svgtypes.ir.IRSVGInitialContainerNode } | null {
    if (!this.svgProvider) {
      throw new Error("SVG interface provider is not bound");
    }
    return this.svgProvider.svgPack(svg);
  }

  // #endregion IDocumentSVGInterfaceActions implementation

  // #region IDocumentMarkdownInterfaceActions implementation
  public markdownToHtml(markdown: string): string | null {
    if (!this.markdownProvider) {
      throw new Error("Markdown interface provider is not bound");
    }
    return this.markdownProvider.markdownToHtml(markdown);
  }
  // #endregion IDocumentMarkdownInterfaceActions implementation

  // ==============================================================
  // #region IFontLoaderActions implementation
  // ==============================================================
  async loadFontSync(font: { family: string }): Promise<void> {
    if (!this.fontCollection) return;
    await this.fontCollection.loadFont(font);
  }

  // FIXME: return typeface description
  listLoadedFonts(): string[] {
    if (!this.fontCollection) return [];
    return this.fontCollection.listLoadedFonts();
  }

  async loadPlatformDefaultFonts(): Promise<void> {
    const fonts: string[] = Array.from(
      editor.config.fonts.DEFAULT_FONT_FALLBACK_SET
    );

    if (this.fontCollection) {
      void Promise.all(fonts.map((family) => this.loadFontSync({ family })));
      void this.fontCollection.setFallbackFonts(fonts);
    }
  }

  getFontItem(fontFamily: string): googlefonts.GoogleWebFontListItem | null {
    const item: googlefonts.GoogleWebFontListItem | undefined =
      this.doc.state.webfontlist.items.find((f) => f.family === fontFamily);
    if (!item) return null;
    return item;
  }

  /**
   * Loads all font faces for a given family and extracts details once every
   * face is available. This method fetches all font files first and then runs
   * analysis to avoid progressive parsing.
   */
  async getFontFamilyDetailsSync(
    fontFamily: string
  ): Promise<editor.font_spec.UIFontFamily | null> {
    return this._fontManager.parseFontFamily(fontFamily);
  }

  public selectFontStyle(description: editor.api.FontStyleSelectDescription): {
    key: editor.font_spec.FontStyleKey;
    face: editor.font_spec.UIFontFaceData;
    instance: editor.font_spec.UIFontFaceInstance | null;
    isVariable: boolean;
  } | null {
    return this._fontManager.selectFontStyle(description);
  }

  // ==============================================================
  // #endregion IFontLoaderActions implementation
  // ==============================================================

  // ==============================================================
  // #region IExportPluginActions implementation
  // ==============================================================
  exportNodeAs(
    node_id: string,
    format: "PNG" | "JPEG"
  ): Promise<Uint8Array | false>;
  exportNodeAs(node_id: string, format: "PDF"): Promise<Uint8Array | false>;
  exportNodeAs(node_id: string, format: "SVG"): Promise<string | false>;
  async exportNodeAs(
    node_id: string,
    format: "PNG" | "JPEG" | "PDF" | "SVG"
  ): Promise<Uint8Array | string | false> {
    const supported_by_exporter = this.exporter.formats.includes(format);
    if (!supported_by_exporter) return false;

    const can_export_request = this.exporter.canExportNodeAs(node_id, format);
    if (!can_export_request) return false;

    return this.exporter.exportNodeAs(node_id, format);
  }
  // ==============================================================
  // #endregion IExportPluginActions implementation
  // ==============================================================

  /**
   * Dispose editor instance and cleanup resources
   */
  dispose() {
    this.doc.dispose();
  }
}

export class EditorSurface
  implements
    editor.api.IEditorSurfaceActions,
    editor.api.IEditorA11yActions,
    editor.api.ISurfaceMultiplayerFollowPluginActions,
    editor.api.ISurfaceMultiplayerCursorChatActions
{
  readonly camera: Camera;
  readonly __pligin_follow: EditorFollowPlugin;
  private readonly __pointer_move_throttle_ms: number = 30;
  private get state(): editor.state.IEditorState {
    return this._editor.doc.state;
  }

  constructor(
    readonly _editor: Editor,
    config: { pointer_move_throttle_ms: number } = {
      pointer_move_throttle_ms: 30,
    }
  ) {
    this.camera = _editor.camera;
    this.__pligin_follow = new EditorFollowPlugin(_editor);
    this.__pointer_move_throttle_ms = config.pointer_move_throttle_ms;
  }

  private dispatch(action: Action) {
    this._editor.doc.dispatch(action);
  }

  // ==============================================================
  // #region Surface actions
  // ==============================================================

  surfaceSetTool(tool: editor.state.ToolMode, debug_label?: string) {
    if (debug_label) console.log("debug:setTool", tool, debug_label);

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
  surfaceTryEnterContentEditMode(
    node_id?: string,
    mode: "auto" | "paint/gradient" | "paint/image" = "auto",
    options?: {
      paintIndex?: number;
      paintTarget?: "fill" | "stroke";
    }
  ) {
    node_id = node_id ?? this.state.selection[0];
    switch (mode) {
      case "auto":
        return this.dispatch({
          type: "surface/content-edit-mode/try-enter",
        });
      case "paint/gradient":
        if (node_id) {
          const paintTarget = options?.paintTarget ?? "fill";
          const paintIndex = options?.paintIndex ?? 0;
          return this.dispatch({
            type: "surface/content-edit-mode/paint/gradient",
            node_id: node_id,
            paint_target: paintTarget,
            paint_index: paintIndex,
          });
        } else {
          // no-op
        }
      case "paint/image":
        if (node_id) {
          const paintTarget = options?.paintTarget ?? "fill";
          const paintIndex = options?.paintIndex ?? 0;
          return this.dispatch({
            type: "surface/content-edit-mode/paint/image",
            node_id: node_id,
            paint_target: paintTarget,
            paint_index: paintIndex,
          });
        }
    }
  }

  surfaceTryExitContentEditMode() {
    this.dispatch({
      type: "surface/content-edit-mode/try-exit",
    });
  }

  surfaceTryToggleContentEditMode() {
    if (this._editor.doc.state.content_edit_mode) {
      this.surfaceTryExitContentEditMode();
    } else {
      this.surfaceTryEnterContentEditMode();
    }
  }

  /**
   * Create a new scene with UX customizations.
   *
   * This method is almost identical to the core {@link EditorDocumentStore.createScene},
   * but includes UX-specific customizations such as inheriting the background color
   * from the current scene or fallback scenes.
   *
   * **Background Color Inheritance:**
   * - If `scene.background_color` is provided, it will be used
   * - Otherwise, inherits from the current scene's background color
   * - If current scene has no background, falls back to any other scene's background
   * - If no scene has a background, defaults to WHITESMOKE (#F5F5F5)
   *
   * @param scene - Optional scene initialization data
   *
   * @example
   * ```typescript
   * // Create a new scene with default UX customizations
   * editor.surface.surfaceCreateScene();
   *
   * // Create a scene with custom name and background
   * editor.surface.surfaceCreateScene({
   *   name: "My Scene",
   *   background_color: { r: 1, g: 0, b: 0, a: 1 }
   * });
   * ```
   */
  public surfaceCreateScene(scene?: grida.program.document.SceneInit) {
    // If background_color was explicitly provided, use core API directly
    if (scene?.background_color) {
      this._editor.doc.createScene(scene);
      return;
    }

    // Get the current scene's background before creating the new scene
    const current_scene_id = this.state.scene_id;
    const current_scene = current_scene_id
      ? (this.state.document.nodes[current_scene_id] as
          | grida.program.nodes.SceneNode
          | undefined)
      : undefined;
    const current_background = current_scene?.background_color;

    // First, create the scene using the core API
    this._editor.doc.createScene(scene);

    // Get the newly created scene ID (it becomes the current scene)
    const new_scene_id = this.state.scene_id;
    if (!new_scene_id) {
      return;
    }

    // Get background color with fallback: current scene -> fallback scene -> default
    let background_color: grida.program.document.ISceneBackground["background_color"];

    // Use the previous current scene's background if available
    if (current_background) {
      background_color = current_background;
    } else {
      // Try any other scene (fallback)
      for (const fallback_scene_id of this.state.document.scenes_ref) {
        if (fallback_scene_id === new_scene_id) continue;
        const fallback_scene = this.state.document.nodes[fallback_scene_id] as
          | grida.program.nodes.SceneNode
          | undefined;
        if (fallback_scene?.background_color) {
          background_color = fallback_scene.background_color;
          break;
        }
      }
    }

    // Default to WHITESMOKE if no scene has a background color
    if (!background_color) {
      background_color = kolor.colorformats.RGBA32F.WHITESMOKE;
    }

    // Update the newly created scene's background
    this._editor.doc.changeSceneBackground(new_scene_id, background_color);
  }

  public surfaceHoverNode(node_id: string, event: "enter" | "leave") {
    this.dispatch({
      type: "hover/ui",
      target: node_id,
      event,
    });
  }

  public surfaceHoverEnterNode(node_id: string) {
    this.dispatch({
      type: "hover/title-bar",
      target: node_id,
      event: "enter",
    });
  }

  public surfaceHoverLeaveNode(node_id: string) {
    this.dispatch({
      type: "hover/title-bar",
      target: node_id,
      event: "leave",
    });
  }

  /**
   * Blur event handler for window focus loss.
   *
   * **Why we need this:**
   * When the window/tab loses focus (e.g., user switches tabs, clicks outside the window),
   * modifier keys (Meta/Cmd, Ctrl, Alt, Shift) do NOT fire keyup events. This means:
   * - If user was holding Alt+click, then switches tabs, Alt state remains "pressed"
   * - Surface configurations (measurement mode, snap modifiers, etc.) remain active
   * - Tool state may be stuck in a modifier-dependent mode
   *
   * **Solution:**
   * On window blur, we reset all modifier-dependent state to safe defaults:
   * - Clear stuck title bar hover (pointerLeave never fires on tab switch)
   * - Reset all surface configurations (raycast targeting, measurement, modifiers)
   * - Reset tool to cursor (safe default state)
   *
   * This ensures the editor is in a consistent, predictable state when the user returns.
   */
  public onblur(event: FocusEvent): void {
    if (event.defaultPrevented) return;

    // Clear stuck title bar hover state
    // This handles edge case where pointerLeave never fires (e.g., tab switch, window blur)
    const state = this.state;
    if (
      state.hovered_node_source === "title-bar" &&
      state.hovered_node_id !== null
    ) {
      this.surfaceHoverLeaveNode(state.hovered_node_id);
    }

    // Reset all surface configurations
    // Meta keys (Alt, Ctrl, Meta, Shift) don't fire keyup events on tab switch,
    // so we must reset all modifier-dependent configurations to prevent stuck state
    this.surfaceConfigureSurfaceRaycastTargeting({
      target: "auto",
    });
    this.surfaceConfigureMeasurement("off");
    this.surfaceConfigureTranslateWithCloneModifier("off");
    this.surfaceConfigureTransformWithCenterOriginModifier("off");
    this.surfaceConfigureTranslateWithAxisLockModifier("off");
    this.surfaceConfigureTransformWithPreserveAspectRatioModifier("off");
    this.surfaceConfigureTranslateWithForceDisableSnap("off");
    this.surfaceConfigureScaleWithForceDisableSnap("off");
    this.surfaceConfigureRotateWithQuantizeModifier("off");
    this.surfaceConfigurePaddingWithMirroringModifier("off");

    // Reset tool to cursor (safe default state)
    this.surfaceSetTool({ type: "cursor" }, "window blur");
  }

  public surfaceLockNudgeGesture(state: "on" | "off") {
    this.dispatch({
      type: "gesture/nudge",
      state,
    });
  }

  public surfaceUpdateVectorHoveredControl(
    hoveredControl: {
      type: editor.state.VectorContentEditModeHoverableGeometryControlType;
      index: number;
    } | null
  ) {
    this.dispatch({
      type: "vector/update-hovered-control",
      hoveredControl,
    });
  }

  public surfaceSelectGradientStop(
    node_id: editor.NodeID,
    stop: number,
    options?: {
      paintIndex?: number;
      paintTarget?: "fill" | "stroke";
    }
  ): void {
    const paintTarget = options?.paintTarget ?? "fill";
    const paintIndex = options?.paintIndex ?? 0;
    this.dispatch({
      type: "select-gradient-stop",
      target: {
        node_id,
        stop,
        paint_index: paintIndex,
        paint_target: paintTarget,
      },
    });
  }

  public surfaceConfigureSurfaceRaycastTargeting(
    config: Partial<editor.state.HitTestingConfig>
  ) {
    this.dispatch({
      type: "config/surface/raycast-targeting",
      config,
    });
  }

  public surfaceConfigureMeasurement(measurement: "on" | "off") {
    this.dispatch({
      type: "config/surface/measurement",
      measurement,
    });
  }

  public surfaceConfigureTranslateWithCloneModifier(
    translate_with_clone: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/translate-with-clone",
      translate_with_clone,
    });
  }

  public surfaceConfigureTranslateWithAxisLockModifier(
    tarnslate_with_axis_lock: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/translate-with-axis-lock",
      tarnslate_with_axis_lock,
    });
  }

  public surfaceConfigureTranslateWithForceDisableSnap(
    translate_with_force_disable_snap: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/translate-with-force-disable-snap",
      translate_with_force_disable_snap,
    });
  }

  public surfaceConfigureScaleWithForceDisableSnap(
    scale_with_force_disable_snap: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/scale-with-force-disable-snap",
      scale_with_force_disable_snap,
    });
  }

  public surfaceConfigureTransformWithCenterOriginModifier(
    transform_with_center_origin: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/transform-with-center-origin",
      transform_with_center_origin,
    });
  }

  public surfaceConfigureTransformWithPreserveAspectRatioModifier(
    transform_with_preserve_aspect_ratio: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/transform-with-preserve-aspect-ratio",
      transform_with_preserve_aspect_ratio,
    });
  }

  public surfaceConfigureRotateWithQuantizeModifier(
    rotate_with_quantize: number | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/rotate-with-quantize",
      rotate_with_quantize,
    });
  }

  public surfaceConfigureCurveTangentMirroringModifier(
    curve_tangent_mirroring: vn.TangentMirroringMode
  ) {
    this.dispatch({
      type: "config/modifiers/curve-tangent-mirroring",
      curve_tangent_mirroring,
    });
  }

  public surfaceConfigurePathKeepProjectingModifier(
    path_keep_projecting: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/path-keep-projecting",
      path_keep_projecting,
    });
  }

  public surfaceConfigurePaddingWithMirroringModifier(
    padding_with_axis_mirroring: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/padding-with-mirroring",
      padding_with_axis_mirroring,
    });
  }

  // #region IPixelGridActions implementation
  surfaceConfigurePixelGrid(state: "on" | "off") {
    this.dispatch({
      type: "surface/pixel-grid",
      state,
    });
  }
  surfaceTogglePixelGrid(): "on" | "off" {
    const { pixelgrid } = this.state;
    const next = pixelgrid === "on" ? "off" : "on";
    this.surfaceConfigurePixelGrid(next);
    return next;
  }
  // #endregion IPixelGridActions implementation

  // #region IRulerActions implementation
  surfaceConfigureRuler(state: "on" | "off") {
    this.dispatch({
      type: "surface/ruler",
      state,
    });
  }
  surfaceToggleRuler(): "on" | "off" {
    const { ruler } = this._editor.state;
    const next = ruler === "on" ? "off" : "on";
    this.surfaceConfigureRuler(next);
    return next;
  }

  // ==============================================================
  // #endregion Surface actions
  // ==============================================================

  // #region IEventTargetActions implementation

  private _throttled_pointer_move_with_raycast = editor.throttle(
    (event: PointerEvent, position: { x: number; y: number }) => {
      // this is throttled - as it is expensive
      const ids = this._editor.getNodeIdsFromPointerEvent(event);
      this._editor.doc.dispatch({
        type: "event-target/event/on-pointer-move-raycast",
        node_ids_from_point: ids,
        position,
        shiftKey: event.shiftKey,
      });
    },
    this.__pointer_move_throttle_ms
  );

  surfacePointerDown(event: PointerEvent) {
    const ids = this._editor.getNodeIdsFromPointerEvent(event);

    this._editor.doc.dispatch({
      type: "event-target/event/on-pointer-down",
      node_ids_from_point: ids,
      shiftKey: event.shiftKey,
    });
  }

  surfacePointerUp(event: PointerEvent) {
    this._editor.doc.dispatch({
      type: "event-target/event/on-pointer-up",
    });
  }

  surfacePointerMove(event: PointerEvent) {
    const position = this.camera.pointerEventToViewportPoint(event);

    this._editor.doc.dispatch({
      type: "event-target/event/on-pointer-move",
      position_canvas: position,
      position_client: { x: event.clientX, y: event.clientY },
    });

    this._throttled_pointer_move_with_raycast(event, position);
  }

  surfaceClick(event: MouseEvent) {
    const ids = this._editor.getNodeIdsFromPointerEvent(event);

    this._editor.doc.dispatch({
      type: "event-target/event/on-click",
      node_ids_from_point: ids,
      shiftKey: event.shiftKey,
    });
  }

  surfaceDoubleClick(event: MouseEvent) {
    this._editor.doc.dispatch({
      type: "event-target/event/on-double-click",
    });
  }

  surfaceMultipleSelectionOverlayClick(group: string[], event: MouseEvent) {
    const ids = this._editor.getNodeIdsFromPointerEvent(event);
    this._editor.doc.dispatch({
      type: "event-target/event/multiple-selection-overlay/on-click",
      selection: group,
      node_ids_from_point: ids,
      shiftKey: event.shiftKey,
    });
  }

  surfaceDragStart(event: PointerEvent) {
    this._editor.doc.dispatch({
      type: "event-target/event/on-drag-start",
      shiftKey: event.shiftKey,
    });
  }

  surfaceDragEnd(event: PointerEvent) {
    const { marquee } = this._editor.doc.state;
    if (marquee) {
      // test area in canvas space
      const area = cmath.rect.fromPoints([marquee.a, marquee.b]);

      const contained =
        this._editor.geometryProvider.getNodeIdsFromEnvelope(area);

      this._editor.doc.dispatch({
        type: "event-target/event/on-drag-end",
        node_ids_from_area: contained,
        shiftKey: event.shiftKey,
      });

      return;
    }
    this._editor.doc.dispatch({
      type: "event-target/event/on-drag-end",
      shiftKey: event.shiftKey,
    });
  }

  surfaceDrag(event: TCanvasEventTargetDragGestureState) {
    requestAnimationFrame(() => {
      this._editor.doc.dispatch({
        type: "event-target/event/on-drag",
        event,
      });
    });
  }

  //

  //

  surfaceStartGuideGesture(axis: cmath.Axis, idx: number | -1) {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        idx: idx,
        type: "guide",
        axis,
      },
    });
  }

  surfaceStartScaleGesture(
    selection: string | string[],
    direction: cmath.CardinalDirection
  ) {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "scale",
        selection: Array.isArray(selection) ? selection : [selection],
        direction,
      },
    });
  }

  surfaceStartSortGesture(selection: string | string[], node_id: string) {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "sort",
        selection: Array.isArray(selection) ? selection : [selection],
        node_id,
      },
    });
  }

  surfaceStartGapGesture(selection: string | string[], axis: "x" | "y") {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "gap",
        selection: selection,
        axis,
      },
    });
  }

  surfaceStartPaddingGesture(
    node_id: string,
    side: "top" | "right" | "bottom" | "left"
  ) {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "padding",
        node_id,
        side,
      },
    });
  }

  // #region drag resize handle
  surfaceStartCornerRadiusGesture(
    selection: string,
    anchor?: cmath.IntercardinalDirection
  ) {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "corner-radius",
        node_id: selection,
        anchor,
      },
    });
  }
  // #endregion drag resize handle

  surfaceStartRotateGesture(selection: string) {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "rotate",
        selection,
      },
    });
  }

  surfaceStartTranslateVectorNetwork(node_id: string) {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "translate-vector-controls",
        node_id,
      },
    });
  }

  surfaceStartTranslateVariableWidthStop(node_id: string, stop: number) {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "translate-variable-width-stop",
        node_id,
        stop,
      },
    });
  }

  surfaceStartResizeVariableWidthStop(
    node_id: string,
    stop: number,
    side: "left" | "right"
  ) {
    this._editor.doc.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "resize-variable-width-stop",
        node_id,
        stop,
        side,
      },
    });
  }

  surfaceStartCurveGesture(
    node_id: string,
    segment: number,
    control: "ta" | "tb"
  ) {
    this._editor.doc.dispatch({
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

  // #region IFollowPluginActions implementation
  follow(cursor_id: string): void {
    this.__pligin_follow.follow(cursor_id);
  }

  unfollow(): void {
    this.__pligin_follow.unfollow();
  }
  // #endregion IFollowPluginActions implementation

  public async writeClipboardMedia(
    target: "selection" | editor.NodeID,
    format: "png"
  ): Promise<boolean> {
    assert(
      this._editor.backend === "canvas",
      "Editor is not using canvas backend"
    );
    const ids = target === "selection" ? this.state.selection : [target];
    if (ids.length === 0) return false;
    const id = ids[0];
    const data = await this._editor.exportNodeAs(id, "PNG");
    const blob = new Blob([data as BlobPart], { type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  }

  public async writeClipboardSVG(
    target: "selection" | editor.NodeID
  ): Promise<boolean> {
    assert(
      this._editor.backend === "canvas",
      "Editor is not using canvas backend"
    );
    const ids = target === "selection" ? this.state.selection : [target];
    if (ids.length === 0) return false;
    const id = ids[0];
    const data = await this._editor.exportNodeAs(id, "SVG");
    if (typeof data !== "string") {
      return false;
    }

    const svgBlob = new Blob([data], { type: "image/svg+xml" });
    const textBlob = new Blob([data], { type: "text/plain" });
    const item = new ClipboardItem({
      "image/svg+xml": svgBlob,
      "text/plain": textBlob,
    });

    try {
      await navigator.clipboard.write([item]);
    } catch (error) {
      await navigator.clipboard.writeText(data);
    }

    return true;
  }

  // ==============================================================
  // #region ICursorChatActions implementation
  // ==============================================================
  openCursorChat(): void {
    this._editor.doc.reduce((state) => {
      state.local_cursor_chat.is_open = true;
      return state;
    });
  }

  closeCursorChat(): void {
    this._editor.doc.reduce((state) => {
      state.local_cursor_chat.is_open = false;
      state.local_cursor_chat.message = null;
      state.local_cursor_chat.last_modified = null;
      return state;
    });
  }

  updateCursorChatMessage(message: string | null): void {
    this._editor.doc.reduce((state) => {
      state.local_cursor_chat.message = message;
      state.local_cursor_chat.last_modified = message ? Date.now() : null;
      return state;
    });
  }

  public __sync_cursors(
    cursors: editor.state.IEditorMultiplayerCursorState["cursors"]
  ) {
    this._editor.doc.reduce((state) => {
      state.cursors = cursors;
      return state;
    });
  }

  // ==============================================================
  // #endregion ICursorChatActions implementation
  // ==============================================================

  // ==============================================================
  // #region a11y actions
  // ==============================================================

  public a11yEscape() {
    const step = this._stackEscapeSteps(this.state)[0];

    switch (step) {
      case "escape-tool": {
        this.surfaceSetTool({ type: "cursor" }, "a11yEscape");
        break;
      }
      case "escape-selection": {
        this._editor.doc.blur("a11yEscape");
        break;
      }
      case "escape-content-edit-mode":
      default: {
        this.surfaceTryExitContentEditMode();
        break;
      }
    }
  }

  private _stackEscapeSteps(
    state: editor.state.IEditorState
  ): editor.a11y.EscapeStep[] {
    const steps: editor.a11y.EscapeStep[] = [];

    if (!state.content_edit_mode) {
      // p1. if the tool is selected, escape the tool
      if (state.tool.type !== "cursor") {
        steps.push("escape-tool");
      }
      // p2. if the selection is not empty, escape the selection
      if (state.selection.length > 0) {
        steps.push("escape-selection");
      }
    } else {
      switch (state.content_edit_mode.type) {
        case "vector": {
          const { selected_vertices, selected_segments, selected_tangents } =
            state.content_edit_mode.selection;
          const hasSelection =
            selected_vertices.length > 0 ||
            selected_segments.length > 0 ||
            selected_tangents.length > 0;

          // p1. if the selection is not empty, escape the selection
          if (hasSelection) {
            steps.push("escape-selection");
          }

          // p2. if the tool is selected, escape the tool
          if (state.tool.type !== "cursor") {
            steps.push("escape-tool");
          }
          break;
        }
        case "paint/gradient":
        case "paint/image": {
          break;
        }
      }

      // p3. if the content edit mode is active, escape the content edit mode
      steps.push("escape-content-edit-mode");
    }

    return steps;
  }

  public async a11yCopyAsImage(format: "png"): Promise<boolean> {
    if (this.state.content_edit_mode?.type === "vector") {
      const { selected_vertices, selected_segments, selected_tangents } =
        this.state.content_edit_mode.selection;
      const hasSelection =
        selected_vertices.length > 0 ||
        selected_segments.length > 0 ||
        selected_tangents.length > 0;
      if (!hasSelection) return false;
    } else {
      if (this.state.selection.length === 0) return false;
    }
    return await this.writeClipboardMedia("selection", format);
  }

  public async a11yCopyAsSVG(): Promise<boolean> {
    if (this.state.content_edit_mode?.type === "vector") {
      const { selected_vertices, selected_segments, selected_tangents } =
        this.state.content_edit_mode.selection;
      const hasSelection =
        selected_vertices.length > 0 ||
        selected_segments.length > 0 ||
        selected_tangents.length > 0;
      if (!hasSelection) return false;
    } else {
      if (this.state.selection.length === 0) return false;
    }

    return await this.writeClipboardSVG("selection");
  }

  public a11yCopy() {
    if (this.state.content_edit_mode?.type === "vector") {
      const { selected_vertices, selected_segments, selected_tangents } =
        this.state.content_edit_mode.selection;
      const hasSelection =
        selected_vertices.length > 0 ||
        selected_segments.length > 0 ||
        selected_tangents.length > 0;
      if (!hasSelection) return;
    }
    this._editor.doc.copy("selection");
  }

  public a11yCut() {
    this._editor.doc.cut("selection");
  }

  /**
   * User-facing paste operation that handles UX concerns.
   *
   * This method:
   * - Captures current selection at invocation time (bounded context)
   * - Resolves target parents from selection using UX logic:
   *   - If container selected → paste as child
   *   - If non-container selected → paste as sibling
   *   - If no selection → paste to scene level
   * - Calls core paste() with explicit target
   * - Updates selection to newly pasted nodes
   *
   * This is the primary method for user-initiated paste operations (keyboard shortcuts, menu items, etc.).
   *
   * @remarks
   * - Selection is captured at invocation time, so multiple pastes don't cause nesting
   * - Selection is updated after paste to select the newly inserted nodes
   * - All UX logic (selection resolution, selection update) is handled here, not in the reducer
   * - For programmatic paste operations, use `editor.commands.paste(target)` directly
   *
   * @example
   * ```typescript
   * // Called from keyboard shortcut (Cmd+V)
   * editor.surface.a11yPaste();
   * ```
   */
  public a11yPaste() {
    // Capture current selection at invocation time (bounded context)
    const currentSelection = [...this.state.selection];
    const clipboard = this.state.user_clipboard;

    if (!clipboard || clipboard.type !== "prototypes") {
      // No clipboard or wrong type - delegate to core paste which will handle other cases
      // For scene-level paste with no selection
      const scene_id = this.state.scene_id;
      if (scene_id) {
        this._editor.doc.paste(scene_id);
      }
      return;
    }

    const copiedIds = clipboard.ids;

    // Resolve target parents from current selection using helper function
    let targetParents: Array<string | null>;

    if (currentSelection.length === 0) {
      // No selection - paste to scene level
      const scene_id = this.state.scene_id;
      targetParents = scene_id ? [scene_id] : [null];
    } else {
      // Use helper to resolve target parents from selection
      targetParents = resolvePasteTargetParents(
        this.state,
        currentSelection,
        copiedIds
      );

      // If no valid targets resolved, fallback to scene level
      if (targetParents.length === 0) {
        const scene_id = this.state.scene_id;
        targetParents = scene_id ? [scene_id] : [null];
      }
    }

    // Validate that we can resolve valid targets (reject invalid input)
    // If targetParents contains null, we must have a valid scene_id to convert it
    const scene_id = this.state.scene_id;
    const hasNullTargets = targetParents.some((id) => id === null);
    if (hasNullTargets && !scene_id) {
      // Cannot paste: no valid target parent and no scene_id available
      return;
    }

    // Normalize to single target or array (core paste accepts both)
    // Convert null to scene_id (we've validated scene_id exists above)
    const target: string | string[] =
      targetParents.length === 1
        ? (targetParents[0] ?? scene_id!)
        : targetParents.map((id) => id ?? scene_id!);

    // Call core paste with explicit target - it returns newly inserted node IDs
    const pastedNodeIds = this._editor.doc.paste(target);

    // Update selection to newly pasted nodes
    // Note: pastedNodeIds includes all newly created nodes, but we want to select only top-level ones
    // For now, select all - this can be refined later if needed
    if (pastedNodeIds.length > 0) {
      this._editor.doc.select(pastedNodeIds, "reset");
    }
  }

  public insert(
    payload: editor.api.InsertPayload | editor.api.InsertPayload[]
  ): editor.NodeID[] {
    const currentSelection = [...this.state.selection];
    const target = resolveInsertTargetParent(this.state, currentSelection);

    const payloads = Array.isArray(payload) ? payload : [payload];
    const allInsertedNodeIds: editor.NodeID[] = [];

    // Insert all payloads using the same target (prevents nesting)
    // Use editor.insert() instead of doc.insert() to handle font sync
    for (const p of payloads) {
      const insertedNodeIds = this._editor.insert(p, target);
      allInsertedNodeIds.push(...insertedNodeIds);
    }

    // Select all newly inserted nodes as a group
    if (allInsertedNodeIds.length > 0) {
      this._editor.doc.select(allInsertedNodeIds, "reset");
    }

    return allInsertedNodeIds;
  }

  public ungroup(target: editor.NodeID[]): editor.NodeID[][] {
    // Filter to only group and boolean nodes
    const groupNodes = target.filter((nodeId) => {
      const node = this.state.document.nodes[nodeId];
      return node && (node.type === "group" || node.type === "boolean");
    });

    if (groupNodes.length === 0) {
      return [];
    }

    // Ungroup each group node and collect chunks (preserving which children came from which group)
    const allChunks: editor.NodeID[][] = [];
    for (const groupId of groupNodes) {
      const chunks = this._editor.doc.ungroup(groupId);
      allChunks.push(...chunks);
    }

    // Update selection to all ungrouped children (flatten chunks for selection)
    const allUngroupedChildren = allChunks.flat();
    if (allUngroupedChildren.length > 0) {
      this._editor.doc.select(allUngroupedChildren, "reset");
    }

    return allChunks;
  }

  public order(
    order: "front" | "back" | "forward" | "backward" | number
  ): void {
    const currentSelection = [...this.state.selection];
    if (currentSelection.length > 0) {
      this._editor.doc.order(currentSelection, order);
    }
  }

  public a11yDelete() {
    const state = this.state;
    const target_node_ids = state.selection;

    // Handle content edit modes first
    if (state.content_edit_mode?.type === "paint/gradient") {
      const mode =
        state.content_edit_mode as editor.state.PaintGradientContentEditMode;
      const { node_id, selected_stop, paint_target, paint_index } = mode;

      // Only delete if there are more than 2 stops (minimum required for gradient)
      const node = dq.__getNodeById(state, node_id);
      if (node) {
        const paintTarget = paint_target ?? "fill";
        const { paints, resolvedIndex } = editor.resolvePaints(
          node as grida.program.nodes.UnknwonNode,
          paintTarget,
          paint_index ?? 0
        );
        const targetPaint = paints[resolvedIndex];

        if (targetPaint && cg.isGradientPaint(targetPaint)) {
          const gradient = targetPaint as cg.GradientPaint;
          if (gradient.stops.length > 2) {
            this.dispatch({
              type: "paint/gradient/delete-stop",
              target: {
                node_id,
                stop: selected_stop,
                paint_index: paint_index ?? 0,
                paint_target: paintTarget,
              },
            });
            return;
          }
        }
      }
    }

    if (state.content_edit_mode?.type === "width") {
      const mode =
        state.content_edit_mode as editor.state.VariableWidthContentEditMode;
      const { node_id, variable_width_selected_stop, variable_width_profile } =
        mode;

      // Only delete if there's a selected stop and more than 2 stops
      if (
        variable_width_selected_stop !== null &&
        variable_width_profile.stops.length > 2
      ) {
        this._editor.doc.deleteVariableWidthStop(
          node_id,
          variable_width_selected_stop
        );
        return;
      }
    }

    if (state.content_edit_mode?.type === "vector") {
      const mode =
        state.content_edit_mode as editor.state.VectorContentEditMode;
      const { node_id } = mode;

      this.dispatch({
        type: "vector/delete-selection",
        target: { node_id },
      });
      return;
    }

    // Default: delete selected nodes
    // Scene deletion protection is handled by __self_delete_nodes with default 'on'
    this._editor.doc.delete(target_node_ids);
  }

  public a11ySetClipboardColor(color: cg.RGBA32F) {
    this.dispatch({
      type: "clip/color",
      color,
    });
  }

  public a11yNudgeResize(
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

  public a11yArrow(
    direction: "up" | "down" | "left" | "right",
    shiftKey: boolean
  ) {
    this.dispatch({
      type: `a11y/${direction}`,
      target: "selection",
      shiftKey,
    });
  }

  public a11yAlign(alignment: {
    horizontal?: "min" | "max" | "center";
    vertical?: "min" | "max" | "center";
  }) {
    this.dispatch({
      type: "a11y/align",
      alignment,
    });
  }

  public a11yToggleActive(target: "selection" | editor.NodeID = "selection") {
    const target_ids = target === "selection" ? this.state.selection : [target];

    for (const node_id of target_ids) {
      this._editor.doc.toggleNodeActive(node_id);
    }
  }

  public a11yToggleLocked(target: "selection" | editor.NodeID = "selection") {
    const target_ids = target === "selection" ? this.state.selection : [target];
    for (const node_id of target_ids) {
      this._editor.doc.toggleNodeLocked(node_id);
    }
  }

  public a11yToggleBold(target: "selection" | editor.NodeID = "selection") {
    const target_ids = target === "selection" ? this.state.selection : [target];
    target_ids.forEach((node_id) => {
      this._editor.toggleTextNodeBold(node_id);
    });
  }

  public a11yToggleItalic(target: "selection" | editor.NodeID = "selection") {
    const target_ids = target === "selection" ? this.state.selection : [target];
    target_ids.forEach((node_id) => {
      this._editor.toggleTextNodeItalic(node_id);
    });
  }

  public a11yToggleUnderline(
    target: "selection" | editor.NodeID = "selection"
  ) {
    const target_ids = target === "selection" ? this.state.selection : [target];
    target_ids.forEach((node_id) => {
      this.dispatch({
        type: "node/toggle/underline",
        node_id,
      });
    });
  }

  public a11yToggleLineThrough(
    target: "selection" | editor.NodeID = "selection"
  ) {
    const target_ids = target === "selection" ? this.state.selection : [target];
    target_ids.forEach((node_id) => {
      this.dispatch({
        type: "node/toggle/line-through",
        node_id,
      });
    });
  }

  public a11ySetOpacity(
    target: "selection" | editor.NodeID = "selection",
    opacity: number
  ) {
    const target_ids = target === "selection" ? this.state.selection : [target];
    for (const node_id of target_ids) {
      const _node = this._editor.doc.getNodeById(node_id);
      if (_node) _node.opacity = opacity;
    }
  }

  public a11yChangeFontSize(
    target: "selection" | editor.NodeID = "selection",
    delta: number
  ) {
    const target_ids = target === "selection" ? this.state.selection : [target];
    for (const node_id of target_ids) {
      const node = this._editor.doc.getNodeSnapshotById(node_id);
      if (node && node.type === "text") {
        this._editor.doc.changeTextNodeFontSize(node_id, {
          type: "delta",
          value: delta,
        });
      }
    }
  }

  // ==============================================================
  // #endregion a11y actions
  // ==============================================================

  /**
   * Explicitly overrides browser's native undo/redo behavior for Cmd+Z/Cmd+Shift+Z when fired from
   * input or contentEditable elements, and automatically executes the editor's undo/redo instead.
   *
   * **Why this exists:**
   *
   * When contentEditable elements or input fields are focused and the user presses Cmd+Z or Cmd+Shift+Z,
   * the browser's native undo/redo system intercepts the keyboard shortcut before our custom hotkey handlers
   * can respond. This creates a conflict between:
   * 1. The browser's native undo/redo (which operates on the input's own history)
   * 2. Our custom editor history system (which tracks document-level changes)
   *
   * This conflict causes the browser's native undo/redo to execute instead of our editor's undo/redo,
   * breaking the user's expectation that Cmd+Z should undo document-level changes, not just text input changes.
   *
   * **How it works:**
   *
   * This method should be called in the `onKeyDown` handler of input or contentEditable elements
   * that are part of the editor's content editing flow (e.g., text editing mode). When it detects
   * Cmd+Z or Cmd+Shift+Z, it:
   * 1. Prevents the browser's default undo/redo behavior
   * 2. Stops event propagation
   * 3. Automatically executes the appropriate editor command (undo or redo)
   *
   * **When to use:**
   *
   * Call this method in `onKeyDown` handlers for:
   * - ContentEditable elements used for text editing in content edit mode
   * - Any input elements where the editor's history should take precedence over browser's native undo/redo
   *
   * Do NOT use this for regular form inputs or inputs in UI widgets where browser's native undo/redo
   * is expected and desired behavior.
   *
   * @param event - The keyboard event from the `onKeyDown` handler (works with both native KeyboardEvent and React.KeyboardEvent)
   * @returns `true` if the event was handled (Cmd+Z/Cmd+Shift+Z), `false` otherwise
   *
   * @example
   * ```typescript
   * <ContentEditable
   *   onKeyDown={(e) => {
   *     if (editor.surface.explicitlyOverrideInputUndoRedo(e)) {
   *       return; // Event was handled (undo/redo executed)
   *     }
   *     // Handle other keys normally...
   *   }}
   * />
   * ```
   */
  public explicitlyOverrideInputUndoRedo(event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    preventDefault: () => void;
    stopPropagation: () => void;
  }): boolean {
    // Check if this is Cmd+Z (undo) or Cmd+Shift+Z (redo)
    const isCmdOrCtrl = event.metaKey || event.ctrlKey;
    const isZKey = event.key === "z" || event.key === "Z";

    if (!isCmdOrCtrl || !isZKey) {
      return false;
    }

    // Prevent browser's native undo/redo behavior
    event.preventDefault();
    event.stopPropagation();

    // Execute the appropriate editor command
    if (event.shiftKey) {
      // Redo: Cmd+Shift+Z
      this._editor.doc.redo();
    } else {
      // Undo: Cmd+Z
      this._editor.doc.undo();
    }

    return true;
  }
}

export class ImageProxy implements editor.api.ImageInstance {
  public readonly type: grida.program.document.ImageType;
  private readonly ref_obj: grida.program.document.ImageRef;
  constructor(
    private readonly editor: Editor,
    private readonly ref: string
  ) {
    assert(editor.__is_image_registered(ref), "Image is not registered");
    this.ref_obj = editor.__get_image_ref(ref)!;
    this.type = this.ref_obj.type;
  }

  getBytes(): Uint8Array {
    return this.editor.__get_image_bytes_for_wasm(this.ref)!;
  }

  async getDataURL(): Promise<string> {
    const bytes = this.getBytes();
    const blob = new Blob([bytes as BlobPart], { type: this.type });

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        reject(new Error("Failed to read image file"));
      };

      reader.readAsDataURL(blob);
    });
  }

  getSize() {
    return this.editor.__get_image_size_for_wasm(this.ref)!;
  }
}

export class NodeProxy<T extends grida.program.nodes.Node> {
  constructor(
    private readonly doc: EditorDocumentStore,
    private readonly node_id: string
  ) {}

  get $() {
    // @ts-expect-error - this is a workaround to allow the proxy to be used as a node
    return new Proxy(this, {
      get: (target, prop: string) => {
        return (target.doc.getNodeSnapshotById(target.node_id) as T)[
          prop as keyof T
        ];
      },
      set: (target, prop: string, value) => {
        try {
          target.doc.dispatch({
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

  get id() {
    return this.node_id;
  }

  /**
   * {@link grida.program.nodes.UnknwonNode#name}
   */
  set name(name: string) {
    this.doc.dispatch({
      type: "node/change/*",
      node_id: this.node_id,
      name,
    });
  }

  /**
   * {@link grida.program.nodes.UnknwonNode#name}
   */
  get name() {
    return this.$.name;
  }

  /**
   * {@link grida.program.nodes.UnknwonNode#active}
   */
  set active(active: boolean) {
    this.doc.dispatch({
      type: "node/change/*",
      node_id: this.node_id,
      active: active,
    });
  }

  /**
   * {@link grida.program.nodes.UnknwonNode#active}
   */
  get active() {
    return this.$.active;
  }

  /**
   * {@link grida.program.nodes.UnknwonNode#locked}
   */
  set locked(locked: boolean) {
    this.doc.dispatch({
      type: "node/change/*",
      node_id: this.node_id,
      locked,
    });
  }

  /**
   * {@link grida.program.nodes.UnknwonNode#locked}
   */
  get locked() {
    return this.$.locked;
  }

  /**
   * {@link grida.program.nodes.UnknwonNode#rotation}
   */
  set rotation(rotation: number) {
    this.doc.dispatch({
      type: "node/change/*",
      node_id: this.node_id,
      rotation,
    });
  }

  public changeRotation = (change: editor.api.NumberChange) => {
    const value = resolveNumberChangeValue(
      this.doc.getNodeSnapshotById(
        this.node_id
      ) as grida.program.nodes.UnknwonNode,
      "rotation",
      change
    );
    this.doc.dispatch({
      type: "node/change/*",
      node_id: this.node_id,
      rotation: value,
    });
  };

  /**
   * {@link grida.program.nodes.UnknwonNode#opacity}
   */
  set opacity(opacity: number) {
    this.doc.dispatch({
      type: "node/change/*",
      node_id: this.node_id,
      opacity,
    });
  }

  public changeOpacity(change: editor.api.NumberChange) {
    const value = resolveNumberChangeValue(
      this.doc.getNodeSnapshotById(
        this.node_id
      ) as grida.program.nodes.UnknwonNode,
      "opacity",
      change
    );

    this.doc.dispatch({
      type: "node/change/*",
      node_id: this.node_id,
      opacity: value,
    });
  }

  /**
   * {@link grida.program.nodes.UnknwonNode#blend_mode}
   */
  set blend_mode(blend_mode: cg.LayerBlendMode) {
    this.doc.dispatch({
      type: "node/change/*",
      node_id: this.node_id,
      blend_mode,
    });
  }

  /**
   * {@link grida.program.nodes.UnknwonNode#mask}
   */
  set mask(mask: cg.LayerMaskType | null | undefined) {
    this.doc.dispatch({
      type: "node/change/*",
      node_id: this.node_id,
      mask,
    });
  }
}
