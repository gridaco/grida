import cmath from "@grida/cmath";
import type { editor } from "..";
import type { Editor } from "../editor";
import type { Scene } from "@grida/canvas-wasm";
import type vn from "@grida/vn";
import {
  UnifiedFontManager,
  type FontAdapter,
  type FontAdapterHandle,
  type FontVariant,
} from "@grida/fonts/fontface";

export class CanvasWasmGeometryQueryInterfaceProvider
  implements editor.api.IDocumentGeometryInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Scene
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
    const p = this.editor.camera.clientPointToCanvasPoint([
      event.clientX,
      event.clientY,
    ]);
    return this.getNodeIdsFromPoint(p);
  }

  getNodeAbsoluteBoundingRect(node_id: string): cmath.Rectangle | null {
    return this.surface.getNodeAbsoluteBoundingBox(node_id);
  }
}

export class CanvasWasmDefaultExportInterfaceProvider
  implements editor.api.IDocumentExporterInterfaceProvider
{
  readonly formats = ["PNG", "JPEG", "PDF", "SVG"];

  constructor(
    readonly editor: Editor,
    readonly surface: Scene
  ) {}

  canExportNodeAs(
    node_id: string,
    format: "PNG" | "JPEG" | "PDF" | "SVG" | (string & {})
  ): boolean {
    return this.formats.includes(format);
  }

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

  async exportNodeAsPDF(node_id: string): Promise<Uint8Array> {
    const data = await this.surface.exportNodeAs(node_id, {
      format: "PDF",
    });
    return data.data;
  }

  async exportNodeAsSVG(node_id: string): Promise<string> {
    const data = await this.surface.exportNodeAs(node_id, {
      format: "SVG",
    });
    const str = new TextDecoder("utf-8").decode(data.data);
    return str;
  }

  exportNodeAs(
    node_id: string,
    format: "PNG" | "JPEG" | "PDF" | "SVG" | (string & {})
  ): Promise<Uint8Array | string> {
    switch (format) {
      case "PNG":
      case "JPEG": {
        return this.exportNodeAsImage(node_id, format as "PNG" | "JPEG");
      }
      case "PDF": {
        return this.exportNodeAsPDF(node_id);
      }
      case "SVG": {
        return this.exportNodeAsSVG(node_id);
      }
      default: {
        throw new Error("Non supported format");
      }
    }
  }
}

export class CanvasWasmVectorInterfaceProvider
  implements editor.api.IDocumentVectorInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Scene
  ) {}

  toVectorNetwork(node_id: string): vn.VectorNetwork | null {
    return this.surface.toVectorNetwork(node_id);
  }
}

class WasmFontAdapter implements FontAdapter {
  constructor(private surface: Scene) {}

  async onRegister(
    bytes: ArrayBuffer,
    v: FontVariant
  ): Promise<FontAdapterHandle> {
    this.surface.addFont(v.family, new Uint8Array(bytes));
    return { id: v.family };
  }

  onUnregister(handle: FontAdapterHandle, v: FontVariant): void {
    void handle;
    void v;
  }
}

export class CanvasWasmFontManagerAgentInterfaceProvider
  implements editor.api.IDocumentFontCollectionInterfaceProvider
{
  private manager: UnifiedFontManager;
  private loadedFonts = new Set<string>();

  constructor(
    readonly editor: Editor,
    readonly surface: Scene
  ) {
    this.manager = new UnifiedFontManager(new WasmFontAdapter(surface));
  }

  async loadFont(font: { family: string }): Promise<void> {
    if (this.loadedFonts.has(font.family)) return;
    const item = await this.editor.getFontItem(font.family);
    if (item) {
      await this.manager.loadGoogleFont(item);
      this.loadedFonts.add(font.family);
    }
  }

  /**
   * TODO: provide loaded fonts from wasm backend when available.
   */
  listLoadedFonts(): string[] {
    return Array.from(this.loadedFonts);
  }

  setFallbackFonts(fonts: string[]): void {
    this.surface.setFallbackFonts(fonts);
  }
}

export class CanvasWasmFontParserInterfaceProvider
  implements editor.api.IDocumentFontParserInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Scene
  ) {}

  async parseFamily(
    familyName: string,
    faces: { faceId: string; data: ArrayBuffer }[]
  ): Promise<editor.font_spec.UIFontFamily | null> {
    const res = await this.surface.fontskit.analyzeFamily(faces, familyName);
    if (res.success) {
      const d = res.data;

      const fam = {
        family: d.family_name,
        axes: d.axes,
        faces: d.faces.map(
          (face) =>
            ({
              postscriptName: face.postscript_name,
              axes: face.axes,
              instances:
                face.instances?.map((instance) => ({
                  name: instance.name,
                  postscriptName: instance.postscript_name,
                  coordinates: instance.coordinates,
                })) ?? [],
              features: face.features.reduce(
                (acc, feature) => {
                  acc[feature.tag] = feature;
                  return acc;
                },
                {} as { [tag: string]: editor.font_spec.UIFontFaceFeature }
              ),
              italic: face.is_strict_italic,
            }) satisfies editor.font_spec.UIFontFaceData
        ),
        styles: d.styles.map(
          (style) =>
            ({
              fontFamily: familyName,
              fontStyleName: style.name,
              fontPostscriptName: style.face_post_script_name,
              fontInstancePostscriptName: style.postscript_name,
              fontStyleItalic: style.italic,
              fontWeight: style.weight,
            }) satisfies editor.font_spec.FontStyleInstance
        ),
      } satisfies editor.font_spec.UIFontFamily;

      return fam;
    }
    return null;
  }
}
