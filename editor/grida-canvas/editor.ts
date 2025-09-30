import produce from "immer";
import { Action, editor } from ".";
import reducer, { _internal_reducer } from "./reducers";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import cg from "@grida/cg";
import nid from "./reducers/tools/id";
import type { tokens } from "@grida/tokens";
import type { BitmapEditorBrush } from "@grida/bitmap";
import cmath from "@grida/cmath";
import assert from "assert";
import { domapi } from "./backends/dom";
import { animateTransformTo } from "./animation";
import { InternalAction, TCanvasEventTargetDragGestureState } from "./action";
import iosvg from "@grida/io-svg";
import { io } from "@grida/io";
import { EditorFollowPlugin } from "./plugins/follow";
import vn from "@grida/vn";
import * as googlefonts from "@grida/fonts/google";
import { DocumentFontManager } from "./font-manager";
import init, { type Scene } from "@grida/canvas-wasm";
import locateFile from "./backends/wasm-locate-file";
import {
  NoopDefaultExportInterfaceProvider,
  CanvasWasmGeometryQueryInterfaceProvider,
  CanvasWasmVectorInterfaceProvider,
  CanvasWasmFontManagerAgentInterfaceProvider,
  CanvasWasmFontParserInterfaceProvider,
  CanvasWasmDefaultExportInterfaceProvider,
} from "./backends";

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
    this.editor.dispatch({
      type: "transform",
      transform,
      sync: true,
    });
  }

  // #region ICameraActions implementation
  transformWithSync(transform: cmath.Transform, sync: boolean = true) {
    this.editor.dispatch({
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
      .map((id) => this.editor.geometry.getNodeAbsoluteBoundingRect(id))
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

export class Editor
  implements
    editor.api.IDocumentActions,
    editor.api.IDocumentNodeChangeActions,
    editor.api.IDocumentGeometryQuery,
    editor.api.IDocumentExportPluginActions,
    editor.api.IDocumentSchemaActions_Experimental,
    editor.api.IDocumentBrushToolActions,
    editor.api.IDocumentVectorInterfaceActions
{
  private readonly logger: (...args: any[]) => void;
  private listeners: Set<(editor: this, action?: Action) => void>;
  private mstate: editor.state.IEditorState;
  readonly camera: Camera;
  readonly surface: EditorSurface;

  readonly backend: editor.EditorContentRenderingBackend;

  private _m_wasm_canvas_scene: Scene | null = null;
  private _m_exporter: editor.api.IDocumentExporterInterfaceProvider =
    new NoopDefaultExportInterfaceProvider();

  public get exporter() {
    return this._m_exporter;
  }

  _m_geometry: editor.api.IDocumentGeometryInterfaceProvider;
  get geometry() {
    return this._m_geometry;
  }

  _m_vector: editor.api.IDocumentVectorInterfaceProvider | null = null;
  private get vectorProvider() {
    return this._m_vector;
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

  get state(): Readonly<editor.state.IEditorState> {
    return this.mstate;
  }

  readonly onMount?: (surface: Scene) => void;

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
    };
  }) {
    this.logger = logger;
    this.onMount = onMount;
    this.backend = backend;
    this.camera = new Camera(this, new domapi.DOMViewportApi(viewportElement));
    this.surface = new EditorSurface(this);
    this.mstate = editor.state.init(initialState);
    this.listeners = new Set();
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

    this._fontManager = new DocumentFontManager(this);

    this._do_legacy_warmup();
    onCreate?.(this);

    this.log("editor instantiated");
  }

  /**
   * legacy warmup - ideally, this should be called externally, or once internallu,
   * but as we allow dynamic surface binding, this proccess shall be duplicated once surface binded as well.
   */
  private _do_legacy_warmup() {
    // warm up
    googlefonts.fetchWebfontList().then((webfontlist) => {
      this.__internal_dispatch({
        type: "__internal/webfonts#webfontList",
        webfontlist,
      });
      void this.loadPlatformDefaultFonts();
    });
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

  get transform() {
    return this.mstate.transform;
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

  private log(...args: any[]) {
    if (this.debug || process.env.NODE_ENV === "development") {
      this.logger?.(...args);
    }
  }

  public reset(
    state: editor.state.IEditorState,
    key: string | undefined = undefined,
    force: boolean = false
  ): number {
    this.__internal_dispatch(
      {
        type: "__internal/reset",
        key,
        state,
      },
      force
    );
    return this._tid;
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
        document: grida.program.document.Document
      ) => {
        const p = JSON.stringify({
          version: "0.0.1-beta.1+20250728",
          document,
        });
        surface.loadScene(p);
        surface.redraw();
      };

      // setup hooks
      // - state.document
      // - state.debug
      // - state.transform
      // - [state.hovered_node_id, state.selection]

      // once
      syncDocument(this._m_wasm_canvas_scene!, this.state.document);
      syncTransform(
        this._m_wasm_canvas_scene!,
        this.state.transform,
        el.width,
        el.height
      );

      // fit the camera
      this.camera.fit("*");

      // subscribe
      this.subscribeWithSelector(
        (state) => state.document,
        (_, v) => {
          syncDocument(this._m_wasm_canvas_scene!, v);
        }
      );

      this.subscribeWithSelector(
        (state) => state.debug,
        (_, v) => {
          this._m_wasm_canvas_scene?.setDebug(v);
          this._m_wasm_canvas_scene?.redraw();
        }
      );

      this.subscribeWithSelector(
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

      this.subscribeWithSelector(
        (state) => state.transform,
        (_, v) => {
          syncTransform(this._m_wasm_canvas_scene!, v, el.width, el.height);
        }
      );
    });
  }

  public archive(): Blob {
    const documentData = {
      version: "0.0.1-beta.1+20250728",
      document: this.getSnapshot().document,
    } satisfies io.JSONDocumentFileModel;

    const blob = new Blob([io.archive.pack(documentData) as BlobPart], {
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
    for (const font of this.mstate.fontfaces) {
      this.loadFontSync(font);
    }
  }

  public __get_node_siblings(node_id: string): string[] {
    return dq.getSiblings(this.mstate.document_ctx, node_id);
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

  private __internal_dispatch(action: InternalAction, force: boolean = false) {
    if (this._locked && !force) return;
    this.mstate = _internal_reducer(this.mstate, action);

    this._tid++;
    this.listeners.forEach((l) => l(this, action));
  }

  public dispatch(action: Action, force: boolean = false) {
    if (this._locked && !force) return;
    this.mstate = reducer(this.mstate, action, {
      geometry: this,
      vector: this,
      viewport: {
        width: this.camera.viewport.size.width,
        height: this.camera.viewport.size.height,
      },
      backend: this.backend,
      // TODO: LEGACY_PAINT_MODEL
      paint_constraints: {
        fill: this.backend === "dom" ? "fill" : "fills",
        stroke: this.backend === "dom" ? "stroke" : "strokes",
      },
    });
    this._tid++;
    this.listeners.forEach((l) => l(this, action));
  }

  public dispatchAll(actions: Action[], force: boolean = false) {
    if (this._locked && !force) return;
    this.mstate = actions.reduce(
      (state, action) =>
        reducer(state, action, {
          geometry: this,
          vector: this,
          viewport: {
            width: this.camera.viewport.size.width,
            height: this.camera.viewport.size.height,
          },
          backend: this.backend,
          // TODO: LEGACY_PAINT_MODEL
          paint_constraints: {
            fill: this.backend === "dom" ? "fill" : "fills",
            stroke: this.backend === "dom" ? "stroke" : "strokes",
          },
        }),
      this.mstate
    );
    this._tid++;
    if (actions.length) {
      this.listeners.forEach((l) => l(this, actions[actions.length - 1]));
    }
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

    this.reduce((state) => {
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

  public blur(debug_label?: string) {
    if (debug_label) this.log("debug:blur", debug_label);

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
    this.groupMask(target);
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

  public removeMask(target: editor.NodeID) {
    if (!this.isMask(target)) return;
    this.dispatch({
      type: "node/change/*",
      node_id: target,
      mask: null,
    });
  }

  /**
   * Checks if a node is being used as a mask
   * @param target the node to test
   */
  public isMask(target: editor.NodeID) {
    const n = this.getNodeSnapshotById(target);
    return "mask" in n && n.mask;
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
        fill: {
          type: "solid",
          color: { r: 0, g: 0, b: 0, a: 1 },
          active: true,
        },
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
          active: true,
        },
      },
    });

    return this.getNodeById(id);
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

  public group(target: "selection" | editor.NodeID[]) {
    if (this.backend === "dom") {
      throw new Error("Grouping is not supported in DOM backend");
    }
    this.dispatch({
      type: "group",
      target,
    });
  }

  public ungroup(target: "selection" | editor.NodeID[]) {
    if (this.backend === "dom") {
      throw new Error("Grouping is not supported in DOM backend");
    }
    this.dispatch({
      type: "ungroup",
      target,
    });
  }
  // #endregion IDocumentEditorActions implementation

  // #region IDocumentGeometryQuery implementation

  public getNodeIdsFromPointerEvent(
    event: PointerEvent | MouseEvent
  ): string[] {
    return this.geometry.getNodeIdsFromPointerEvent(event);
  }

  public getNodeIdsFromPoint(point: cmath.Vector2): string[] {
    return this.geometry.getNodeIdsFromPoint(point);
  }

  public getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[] {
    return this.geometry.getNodeIdsFromEnvelope(envelope);
  }

  public getNodeAbsoluteBoundingRect(
    node_id: editor.NodeID
  ): cmath.Rectangle | null {
    return this.geometry.getNodeAbsoluteBoundingRect(node_id);
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

  // #endregion IDocumentGeometryQuery implementation

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
  toggleTextNodeBold(node_id: string) {
    const node = this.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.TextNode;
    if (node.type !== "text") return false;

    const isBold = node.fontWeight === 700;
    const next_weight = isBold ? 400 : 700;
    const fontFamily = node.fontFamily;
    if (!fontFamily) return false;

    const match = this.selectFontStyle({
      fontFamily: fontFamily,
      fontWeight: next_weight,
      fontStyleItalic: node.fontStyleItalic,
    });

    if (!match) {
      this.log(
        "toggleNodeBold: matching font face not found",
        fontFamily,
        next_weight,
        node.fontStyleItalic
      );
      return false;
    }

    this.changeTextNodeFontStyle(node_id, { fontStyleKey: match.key });
    return match.key.fontWeight as cg.NFontWeight;
  }
  toggleTextNodeItalic(node_id: string) {
    const node = this.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.TextNode;
    if (node.type !== "text") return false;

    const next_italic = !node.fontStyleItalic;
    const fontFamily = node.fontFamily;
    if (!fontFamily) return false;

    const match = this.selectFontStyle({
      fontFamily: fontFamily,
      fontWeight: node.fontWeight,
      fontStyleItalic: next_italic,
    });

    if (!match) {
      this.log(
        "toggleNodeItalic: matching font face not found",
        fontFamily,
        next_italic,
        node.fontWeight
      );
      return false;
    }

    this.changeTextNodeFontStyle(node_id, { fontStyleKey: match.key });
    return true;
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
  changeNodePropertyOpacity(node_id: string, opacity: editor.api.NumberChange) {
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
  changeNodePropertyBlendMode(
    node_id: editor.NodeID,
    blendMode: cg.LayerBlendMode
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      blendMode,
    });
  }
  changeNodeMaskType(node_id: string, mask: cg.LayerMaskType) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      mask,
    });
  }
  changeNodePropertyRotation(
    node_id: string,
    rotation: editor.api.NumberChange
  ) {
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

  autoSizeTextNode(node_id: string, axis: "width" | "height") {
    const node = this.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.UnknwonNode;
    if (node.type !== "text") return;

    const prev = this.geometry.getNodeAbsoluteBoundingRect(node_id);
    if (!prev) return;

    const h_align = node.textAlign;
    const v_align = node.textAlignVertical;

    // FIXME: nested raf.
    // why this is needed?
    // currently, the api does not expose a way or contains value for textlayout size, not the box size.
    // since we can't pre-calculate the delta, this is the dirty hack to first resize, then get the next size, shift delta.
    // => need api/data that holds actual textlayout size (non box size)

    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        [axis]: "auto",
      });

      requestAnimationFrame(() => {
        const next = this.geometry.getNodeAbsoluteBoundingRect(node_id);
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
          this.changeNodePropertyPositioning(node_id, {
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
          this.changeNodePropertyPositioning(node_id, {
            top: cmath.quantize(top, 1),
          });
        }
      });
    });
  }

  changeNodePropertyFills(node_id: string | string[], fills: cg.Paint[]) {
    const node_ids = Array.isArray(node_id) ? node_id : [node_id];
    this.dispatchAll(
      node_ids.map((node_id) => ({
        type: "node/change/*",
        node_id,
        fills,
      }))
    );
  }

  changeNodePropertyStrokes(node_id: string | string[], strokes: cg.Paint[]) {
    const node_ids = Array.isArray(node_id) ? node_id : [node_id];
    this.dispatchAll(
      node_ids.map((node_id) => ({
        type: "node/change/*",
        node_id,
        strokes,
      }))
    );
  }

  addNodeFill(
    node_id: string | string[],
    fill: cg.Paint,
    at: "start" | "end" = "start"
  ) {
    const node_ids = Array.isArray(node_id) ? node_id : [node_id];
    this.dispatchAll(
      node_ids.map((node_id) => {
        const current = this.getNodeSnapshotById(node_id);
        const currentFills = Array.isArray((current as any).fills)
          ? ((current as any).fills as cg.Paint[])
          : (current as any).fill
            ? [(current as any).fill as cg.Paint]
            : [];

        const newFills =
          at === "start" ? [fill, ...currentFills] : [...currentFills, fill];

        return {
          type: "node/change/*",
          node_id,
          fills: newFills,
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
    this.dispatchAll(
      node_ids.map((node_id) => {
        const current = this.getNodeSnapshotById(node_id);
        const currentStrokes = Array.isArray((current as any).strokes)
          ? ((current as any).strokes as cg.Paint[])
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
          strokes: newStrokes,
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

  changeNodePropertyStrokeAlign(node_id: string, strokeAlign: cg.StrokeAlign) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      strokeAlign,
    });
  }

  changeNodePropertyStrokeCap(node_id: string, strokeCap: cg.StrokeCap) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      strokeCap,
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
      // (e.g. cornerRadiusBottomLeft). Since the renderer prioritizes the
      // per-corner properties, the final value may appear reverted. To ensure
      // consistency, update all four corner values together when the uniform
      // radius is set.
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        cornerRadius,
        cornerRadiusTopLeft: cornerRadius,
        cornerRadiusTopRight: cornerRadius,
        cornerRadiusBottomRight: cornerRadius,
        cornerRadiusBottomLeft: cornerRadius,
      });
    } else {
      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        cornerRadiusTopLeft: cornerRadius[0],
        cornerRadiusTopRight: cornerRadius[1],
        cornerRadiusBottomRight: cornerRadius[2],
        cornerRadiusBottomLeft: cornerRadius[3],
      });
    }
  }
  changeNodePropertyCornerRadiusWithDelta(
    node_id: string,
    delta: number
  ): void {
    const node = this.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.UnknwonNode;
    const allCornerRadius = {
      cornerRadius: node.cornerRadius,
      cornerRadiusTopLeft: node.cornerRadiusTopLeft,
      cornerRadiusTopRight: node.cornerRadiusTopRight,
      cornerRadiusBottomRight: node.cornerRadiusBottomRight,
      cornerRadiusBottomLeft: node.cornerRadiusBottomLeft,
    };

    const next = {
      ...allCornerRadius,
      cornerRadius: allCornerRadius.cornerRadius
        ? allCornerRadius.cornerRadius + delta
        : undefined,
      cornerRadiusTopLeft: allCornerRadius.cornerRadiusTopLeft
        ? allCornerRadius.cornerRadiusTopLeft + delta
        : undefined,
      cornerRadiusTopRight: allCornerRadius.cornerRadiusTopRight
        ? allCornerRadius.cornerRadiusTopRight + delta
        : undefined,
      cornerRadiusBottomRight: allCornerRadius.cornerRadiusBottomRight
        ? allCornerRadius.cornerRadiusBottomRight + delta
        : undefined,
      cornerRadiusBottomLeft: allCornerRadius.cornerRadiusBottomLeft
        ? allCornerRadius.cornerRadiusBottomLeft + delta
        : undefined,
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
      pointCount,
    });
  }
  changeNodePropertyInnerRadius(
    node_id: editor.NodeID,
    innerRadius: number
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      innerRadius,
    });
  }
  changeNodePropertyArcData(
    node_id: editor.NodeID,
    arcData: grida.program.nodes.i.IEllipseArcData
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      innerRadius: arcData.innerRadius,
      angle: arcData.angle,
      angleOffset: arcData.angleOffset,
    });
  }
  // text style
  async changeTextNodeFontFamilySync(
    node_id: string,
    fontFamily: string,
    force = true
  ) {
    const node = this.getNodeSnapshotById(
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
      description.fontWeight = node.fontWeight;
      description.fontStyleItalic = node.fontStyleItalic;
      description.fontVariations = node.fontVariations;
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
  changeTextNodeFontWeight(node_id: string, fontWeight: cg.NFontWeight) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fontWeight,
    });
  }

  changeTextNodeFontKerning(node_id: string, fontKerning: boolean) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fontKerning,
    });
  }

  changeTextNodeFontWidth(node_id: string, fontWidth: number) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fontWidth,
    });
  }

  changeTextNodeFontStyle(
    node_id: string,
    fontStyleDescription: editor.api.FontStyleChangeDescription
  ) {
    const { fontStyleKey } = fontStyleDescription;
    const next_family = fontStyleKey.fontFamily;

    const node = this.getNodeSnapshotById(
      node_id
    ) as grida.program.nodes.TextNode;

    const prev: grida.program.nodes.i.IFontStyle = {
      fontPostscriptName: node.fontPostscriptName,
      fontWeight: node.fontWeight,
      fontWidth: node.fontWidth,
      fontKerning: node.fontKerning,
      fontSize: node.fontSize,
      fontVariations: node.fontVariations,
      fontFeatures: node.fontFeatures,
      fontOpticalSizing: node.fontOpticalSizing,
      fontStyleItalic: node.fontStyleItalic,
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
      fontFamily: _fontFamily,
      ...next
    }: grida.program.nodes.i.IFontStyle = {
      ...prev,
      fontPostscriptName:
        match.instance?.postscriptName || match.face.postscriptName,
      // ----
      // [high level variables]
      fontWeight: match.instance?.coordinates?.wght ?? prev.fontWeight,
      fontWidth: match.instance?.coordinates?.wdth ?? prev.fontWidth,
      // TODO: should prevent optical sizing auto => fixed
      // (if the next value === auto's expected value && prev value is auto, keep auto) => the change style does not change the size, so the logic can be even simpler.
      fontOpticalSizing:
        match.instance?.coordinates?.opsz ?? prev.fontOpticalSizing,
      // ----
      // Clear variable axes for non-variable fonts
      fontVariations: match.isVariable
        ? match.instance?.coordinates
        : undefined,
      // TODO: clean the invalid features by face change.
      // fontFeatures: match.features,
      fontStyleItalic: match.face.italic,
    } as const;

    this.log(
      "changeTextNodeFontStyle",
      "next",
      next,
      "match",
      match,
      "fontStyleKey",
      fontStyleKey,
      "description",
      description
    );

    this.dispatch({
      type: "node/change/fontFamily",
      node_id: node_id,
      fontFamily: next_family,
    });

    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      ...next,
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
    const features = Object.assign({}, node.fontFeatures ?? {});
    features[feature] = value;

    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fontFeatures: features,
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
    const variations = Object.assign({}, node.fontVariations ?? {});
    variations[key] = value;

    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fontVariations: variations,
    });
  }

  changeTextNodeFontOpticalSizing(
    node_id: editor.NodeID,
    fontOpticalSizing: cg.OpticalSizing
  ): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fontOpticalSizing,
    });
  }

  // FIXME: remove me
  changeTextNodeFontVariationInstance(
    node_id: editor.NodeID,
    coordinates: Record<string, number>
  ): void {
    const { wght, ...rest } = coordinates;

    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      fontWeight:
        typeof wght === "number" ? (wght as cg.NFontWeight) : undefined,
      fontVariations:
        Object.keys(rest).length > 0
          ? (rest as Record<string, number>)
          : undefined,
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

  changeTextNodeTextTransform(
    node_id: string,
    textTransform: cg.TextTransform
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      textTransform,
    });
  }

  changeTextNodeTextDecorationLine(
    node_id: string,
    textDecorationLine: cg.TextDecorationLine
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      textDecorationLine: textDecorationLine,
    });
  }

  changeTextNodeTextDecorationStyle(
    node_id: string,
    textDecorationStyle: cg.TextDecorationStyle
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      textDecorationStyle,
    });
  }

  changeTextNodeTextDecorationThickness(
    node_id: string,
    textDecorationThickness: cg.TextDecorationThicknessPercentage
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      textDecorationThickness,
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
      textDecorationColor: value,
    });
  }

  changeTextNodeTextDecorationSkipInk(
    node_id: string,
    textDecorationSkipInk: cg.TextDecorationSkipInkFlag
  ) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      textDecorationSkipInk,
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

  changeTextNodeWordSpacing(
    node_id: string,
    wordSpacing: editor.api.TChange<grida.program.nodes.TextNode["wordSpacing"]>
  ) {
    try {
      let value: number | undefined;
      if (wordSpacing.value === undefined) {
        value = undefined;
      } else {
        value = resolveNumberChangeValue(
          this.getNodeSnapshotById(node_id) as grida.program.nodes.UnknwonNode,
          "wordSpacing",
          wordSpacing as editor.api.NumberChange
        );
      }

      this.dispatch({
        type: "node/change/*",
        node_id: node_id,
        wordSpacing: value,
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

  changeTextNodeMaxLines(node_id: string, maxLines: number | null): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      maxLines,
    });
  }

  //
  changeNodePropertyBorder(
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

  changeNodeFilterEffects(
    node_id: editor.NodeID,
    effects?: cg.FilterEffect[]
  ): void {
    const feBlur = effects?.find(
      (effect) => effect.type === "filter-blur"
    )?.blur;
    const feBackdropBlur = effects?.find(
      (effect) => effect.type === "backdrop-filter-blur"
    )?.blur;
    const feShadows = effects?.filter((effect) => effect.type === "shadow");

    const i: grida.program.nodes.i.IEffects = {
      feBackdropBlur: feBackdropBlur,
      feBlur: feBlur,
      feShadows: feShadows,
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
      feShadows: effects,
    });
  }

  changeNodeFeBlur(node_id: string, effect?: cg.FeBlur) {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      feBlur: effect,
    });
  }

  changeNodeFeBackdropBlur(node_id: editor.NodeID, effect?: cg.FeBlur): void {
    this.dispatch({
      type: "node/change/*",
      node_id: node_id,
      feBackdropBlur: effect,
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

  // #region IVectorInterfaceActions implementation
  toVectorNetwork(node_id: string): vn.VectorNetwork | null {
    if (!this.vectorProvider) {
      throw new Error("Vector interface provider is not bound");
    }
    return this.vectorProvider.toVectorNetwork(node_id);
  }
  // #endregion IVectorInterfaceActions implementation

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
      this.mstate.webfontlist.items.find((f) => f.family === fontFamily);
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
    this.listeners.clear();
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
    return this._editor.state;
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
    this._editor.dispatch(action);
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
    if (this._editor.state.content_edit_mode) {
      this.surfaceTryExitContentEditMode();
    } else {
      this.surfaceTryEnterContentEditMode();
    }
  }

  public surfaceHoverNode(node_id: string, event: "enter" | "leave") {
    this.dispatch({
      type: "hover",
      target: node_id,
      event,
    });
  }

  public surfaceHoverEnterNode(node_id: string) {
    this.surfaceHoverNode(node_id, "enter");
  }

  public surfaceHoverLeaveNode(node_id: string) {
    this.surfaceHoverNode(node_id, "leave");
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
      this._editor.dispatch({
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

    this._editor.dispatch({
      type: "event-target/event/on-pointer-down",
      node_ids_from_point: ids,
      shiftKey: event.shiftKey,
    });
  }

  surfacePointerUp(event: PointerEvent) {
    this._editor.dispatch({
      type: "event-target/event/on-pointer-up",
    });
  }

  surfacePointerMove(event: PointerEvent) {
    const position = this.camera.pointerEventToViewportPoint(event);

    this._editor.dispatch({
      type: "event-target/event/on-pointer-move",
      position_canvas: position,
      position_client: { x: event.clientX, y: event.clientY },
    });

    this._throttled_pointer_move_with_raycast(event, position);
  }

  surfaceClick(event: MouseEvent) {
    const ids = this._editor.getNodeIdsFromPointerEvent(event);

    this._editor.dispatch({
      type: "event-target/event/on-click",
      node_ids_from_point: ids,
      shiftKey: event.shiftKey,
    });
  }

  surfaceDoubleClick(event: MouseEvent) {
    this._editor.dispatch({
      type: "event-target/event/on-double-click",
    });
  }

  surfaceDragStart(event: PointerEvent) {
    this._editor.dispatch({
      type: "event-target/event/on-drag-start",
      shiftKey: event.shiftKey,
    });
  }

  surfaceDragEnd(event: PointerEvent) {
    const { marquee } = this._editor.state;
    if (marquee) {
      // test area in canvas space
      const area = cmath.rect.fromPoints([marquee.a, marquee.b]);

      const contained = this._editor.geometry.getNodeIdsFromEnvelope(area);

      this._editor.dispatch({
        type: "event-target/event/on-drag-end",
        node_ids_from_area: contained,
        shiftKey: event.shiftKey,
      });

      return;
    }
    this._editor.dispatch({
      type: "event-target/event/on-drag-end",
      shiftKey: event.shiftKey,
    });
  }

  surfaceDrag(event: TCanvasEventTargetDragGestureState) {
    requestAnimationFrame(() => {
      this._editor.dispatch({
        type: "event-target/event/on-drag",
        event,
      });
    });
  }

  //

  surfaceStartGuideGesture(axis: cmath.Axis, idx: number | -1) {
    this._editor.dispatch({
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
    this._editor.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "scale",
        selection: Array.isArray(selection) ? selection : [selection],
        direction,
      },
    });
  }

  surfaceStartSortGesture(selection: string | string[], node_id: string) {
    this._editor.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "sort",
        selection: Array.isArray(selection) ? selection : [selection],
        node_id,
      },
    });
  }

  surfaceStartGapGesture(selection: string | string[], axis: "x" | "y") {
    this._editor.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "gap",
        selection: selection,
        axis,
      },
    });
  }

  // #region drag resize handle
  surfaceStartCornerRadiusGesture(
    selection: string,
    anchor?: cmath.IntercardinalDirection
  ) {
    this._editor.dispatch({
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
    this._editor.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "rotate",
        selection,
      },
    });
  }

  surfaceStartTranslateVectorNetwork(node_id: string) {
    this._editor.dispatch({
      type: "surface/gesture/start",
      gesture: {
        type: "translate-vector-controls",
        node_id,
      },
    });
  }

  surfaceStartTranslateVariableWidthStop(node_id: string, stop: number) {
    this._editor.dispatch({
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
    this._editor.dispatch({
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
    this._editor.dispatch({
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
    this._editor.reduce((state) => {
      state.local_cursor_chat.is_open = true;
      return state;
    });
  }

  closeCursorChat(): void {
    this._editor.reduce((state) => {
      state.local_cursor_chat.is_open = false;
      state.local_cursor_chat.message = null;
      state.local_cursor_chat.last_modified = null;
      return state;
    });
  }

  updateCursorChatMessage(message: string | null): void {
    this._editor.reduce((state) => {
      state.local_cursor_chat.message = message;
      state.local_cursor_chat.last_modified = message ? Date.now() : null;
      return state;
    });
  }

  public __sync_cursors(
    cursors: editor.state.IEditorMultiplayerCursorState["cursors"]
  ) {
    this._editor.reduce((state) => {
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
        this._editor.blur("a11yEscape");
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
    this._editor.copy("selection");
  }

  public a11yCut() {
    this._editor.cut("selection");
  }

  public a11yPaste() {
    this._editor.paste();
  }

  public a11yDelete() {
    this.dispatch({ type: "a11y/delete" });
  }

  public a11ySetClipboardColor(color: cg.RGBA8888) {
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

  public a11yToggleActive(target: "selection" | editor.NodeID = "selection") {
    const target_ids = target === "selection" ? this.state.selection : [target];

    for (const node_id of target_ids) {
      this._editor.toggleNodeActive(node_id);
    }
  }

  public a11yToggleLocked(target: "selection" | editor.NodeID = "selection") {
    const target_ids = target === "selection" ? this.state.selection : [target];
    for (const node_id of target_ids) {
      this._editor.toggleNodeLocked(node_id);
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
      this._editor.changeNodePropertyOpacity(node_id, {
        type: "set",
        value: opacity,
      });
    }
  }

  // ==============================================================
  // #endregion a11y actions
  // ==============================================================
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
