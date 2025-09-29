import locateFile from "@/grida-canvas/backends/wasm-locate-file";
import { Editor } from "@/grida-canvas/editor";
import {
  CanvasWasmGeometryQueryInterfaceProvider,
  CanvasWasmImageExportInterfaceProvider,
  CanvasWasmPDFExportInterfaceProvider,
  CanvasWasmSVGExportInterfaceProvider,
  CanvasWasmVectorInterfaceProvider,
  CanvasWasmFontManagerAgentInterfaceProvider,
  CanvasWasmFontParserInterfaceProvider,
} from "../grida-canvas/backends/wasm";
import init, { type ApplicationFactory, Scene } from "@grida/canvas-wasm";
import assert from "assert";
import { editor } from "../grida-canvas/editor.i";

type ResourceLoaderFn<T> = () => Promise<T> | T;
type ResourceLoader<T> = ResourceLoaderFn<T> | Promise<T> | T;

function loadResource<T>(loader: ResourceLoader<T>): Promise<T> {
  if (loader instanceof Promise) {
    return loader;
  }
  if (typeof loader === "function") {
    const result = (loader as ResourceLoaderFn<T>)();
    return result instanceof Promise ? result : Promise.resolve(result);
  }
  return Promise.resolve(loader);
}

/**
 * Grida Canvas Editor Window Host
 *
 * is responsible for:
 * - loading the wasm binary
 * - loading and managing the resources
 * - loading the document
 * - service layer connection
 */
export class GridaCanvasEditorSelfHostedWindowHost {
  private _editor: Editor | null = null;
  public get editor() {
    return this._editor;
  }

  private _wasm_factory: ApplicationFactory | null = null;
  private _scene: Scene | null = null;
  readonly fetch: typeof window.fetch;
  readonly logger: (...args: any[]) => void;

  private _ready = false;
  get ready() {
    return this._ready;
  }

  constructor({
    fetch = window.fetch,
    logger = console.log,
  }: {
    fetch: typeof window.fetch;
    logger?: (...args: any[]) => void;
  }) {
    this.fetch = fetch;
    this.logger = logger;
  }

  async boot(
    backend: "canvas",
    {
      el,
      doc,
      webfontslist = "eager",
    }: {
      el: HTMLCanvasElement;
      doc: ResourceLoader<editor.state.IEditorStateInit>;
      /**
       * pre load google fonts list
       * @default "eager"
       */
      webfontslist?: "lazy" | "eager";
    }
  ): Promise<Editor> {
    await this.__mount_canvas_wasm(el);
    const initialState = await loadResource(doc);

    if (!this._scene) {
      throw new Error("Scene not initialized");
    }

    this._editor = new Editor({
      backend,
      viewportElement: el,
      logger: this.logger,
      geometry: (editor: Editor) =>
        new CanvasWasmGeometryQueryInterfaceProvider(editor, this._scene!),
      interfaces: {
        export_as_image: (editor: Editor) =>
          new CanvasWasmImageExportInterfaceProvider(editor, this._scene!),
        export_as_pdf: (editor: Editor) =>
          new CanvasWasmPDFExportInterfaceProvider(editor, this._scene!),
        export_as_svg: (editor: Editor) =>
          new CanvasWasmSVGExportInterfaceProvider(editor, this._scene!),
        vector: (editor: Editor) =>
          new CanvasWasmVectorInterfaceProvider(editor, this._scene!),
        font_collection: (editor: Editor) =>
          new CanvasWasmFontManagerAgentInterfaceProvider(editor, this._scene!),
        font_parser: (editor: Editor) =>
          new CanvasWasmFontParserInterfaceProvider(editor, this._scene!),
      },
      initialState,
    });
    this._ready = true;

    return this._editor;
  }

  private async __mount_canvas_wasm(el: HTMLCanvasElement) {
    // load wasm binary
    try {
      assert(
        el instanceof HTMLCanvasElement,
        "element must be an HTMLCanvasElement"
      );

      this._wasm_factory = await init({
        locateFile: locateFile,
      });

      this._scene = this._wasm_factory.createWebGLCanvasSurface(el);
    } catch {
      throw new Error("Failed to warmup Grida Canvas WASM");
    }
  }
}
