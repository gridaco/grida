import cmath from "@grida/cmath";
import type { editor } from "..";
import type { Editor } from "../editor";
import type { Grida2D } from "@grida/canvas-wasm";
import type vn from "@grida/vn";
import {
  UnifiedFontManager,
  type FontAdapter,
  type FontAdapterHandle,
  type FontVariant,
} from "@grida/fonts";
import * as google from "@grida/fonts/google";

export class CanvasWasmGeometryQueryInterfaceProvider
  implements editor.api.IDocumentGeometryInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D
  ) {}

  getNodeIdsFromPoint(point: cmath.Vector2): string[] {
    return this.surface.getNodeIdsFromPoint(point[0], point[1]);
  }

  getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[] {
    return this.surface.getNodeIdsFromEnvelope(envelope);
  }

  getNodeIdsFromPointerEvent(event: {
    clientX: number;
    clientY: number;
  }): string[] {
    const p = this.editor.clientPointToCanvasPoint([
      event.clientX,
      event.clientY,
    ]);
    return this.getNodeIdsFromPoint(p);
  }

  getNodeAbsoluteBoundingRect(node_id: string): cmath.Rectangle | null {
    return this.surface.getNodeAbsoluteBoundingBox(node_id);
  }
}

export class CanvasWasmImageExportInterfaceProvider
  implements editor.api.IDocumentImageExportInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D
  ) {}

  async exportNodeAsImage(
    node_id: string,
    format: "PNG" | "JPEG"
  ): Promise<Uint8Array> {
    const data = await this.surface.exportNodeAs(node_id, {
      format: format,
      constraints: {
        type: "SCALE",
        value: 1,
      },
    });
    return data.data;
  }
}

export class CanvasWasmPDFExportInterfaceProvider
  implements editor.api.IDocumentPDFExportInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D
  ) {}

  async exportNodeAsPDF(node_id: string): Promise<Uint8Array> {
    const data = await this.surface.exportNodeAs(node_id, {
      format: "PDF",
    });
    return data.data;
  }
}

export class CanvasWasmSVGExportInterfaceProvider
  implements editor.api.IDocumentSVGExportInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D
  ) {}

  async exportNodeAsSVG(node_id: string): Promise<string> {
    const data = await this.surface.exportNodeAs(node_id, {
      format: "SVG",
    });
    const str = new TextDecoder("utf-8").decode(data.data);
    return str;
  }
}

export class CanvasWasmVectorInterfaceProvider
  implements editor.api.IDocumentVectorInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Grida2D
  ) {}

  toVectorNetwork(node_id: string): vn.VectorNetwork | null {
    return this.surface.toVectorNetwork(node_id);
  }
}

class WasmFontAdapter implements FontAdapter {
  constructor(private surface: Grida2D) {}

  async onRegister(
    bytes: ArrayBuffer,
    v: FontVariant
  ): Promise<FontAdapterHandle> {
    this.surface.registerFont(v.family, new Uint8Array(bytes));
    return { id: v.family };
  }

  onUnregister(handle: FontAdapterHandle, v: FontVariant): void {
    void handle;
    void v;
  }
}

export class CanvasWasmFontLoaderInterfaceProvider
  implements editor.api.IDocumentFontLoaderInterfaceProvider
{
  private manager: UnifiedFontManager;
  private loadedFonts = new Set<string>();
  private googleFontsCache = new Map<
    string,
    google.GoogleWebFontListItem
  >();

  constructor(readonly editor: Editor, readonly surface: Grida2D) {
    this.manager = new UnifiedFontManager(new WasmFontAdapter(surface));
  }

  async loadFont(font: { family: string }): Promise<void> {
    if (this.loadedFonts.has(font.family)) return;

    if (this.googleFontsCache.size === 0) {
      const list = await google.fetchWebfontList();
      list.items.forEach((f) => this.googleFontsCache.set(f.family, f));
    }

    const googleFont = this.googleFontsCache.get(font.family);
    if (googleFont) {
      await this.manager.loadGoogleFont(googleFont);
      this.loadedFonts.add(font.family);
    }
  }

  /**
   * TODO: provide loaded fonts from wasm backend when available.
   */
  listLoadedFonts(): string[] {
    return [];
  }
}
