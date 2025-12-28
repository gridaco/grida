import cmath from "@grida/cmath";
import type { editor } from "..";
import type { Editor } from "../editor";
import type { Scene, svgtypes } from "@grida/canvas-wasm";
import type vn from "@grida/vn";
import type grida from "@grida/schema";
import type { types } from "@grida/canvas-wasm";
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
  readonly formats: grida.program.document.NodeExportSettings["format"][] = [
    "PNG",
    "JPEG",
    "PDF",
    "SVG",
    "WEBP",
    "BMP",
  ];

  constructor(
    readonly editor: Editor,
    readonly surface: Scene
  ) {}

  canExportNodeAs(
    node_id: string,
    format: grida.program.document.NodeExportSettings["format"] | (string & {})
  ): boolean {
    return this.formats.includes(format as any);
  }

  async exportNodeAsImage(
    node_id: string,
    format: "PNG" | "JPEG" | "WEBP" | "BMP",
    config?: editor.api.ExportConfigOf<"PNG" | "JPEG" | "WEBP" | "BMP">
  ): Promise<Uint8Array> {
    const constraints: types.ExportConstraints = config?.constraints || {
      type: "SCALE",
      value: 1,
    };

    // Build format-specific export config
    let exportFormat: types.ExportAs;
    if (format === "PNG") {
      exportFormat = { format: "PNG", constraints };
    } else if (format === "JPEG") {
      exportFormat = { format: "JPEG", constraints, quality: config?.quality };
    } else if (format === "WEBP") {
      exportFormat = { format: "WEBP", constraints, quality: config?.quality };
    } else {
      // BMP
      exportFormat = { format: "BMP", constraints };
    }

    const data = await this.surface.exportNodeAs(node_id, exportFormat);
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

  exportNodeAs<F extends grida.program.document.NodeExportSettings["format"]>(
    node_id: string,
    format: F,
    config?: editor.api.ExportConfigOf<F>
  ): Promise<F extends "SVG" ? string : Uint8Array> {
    switch (format) {
      case "PNG":
      case "JPEG":
      case "WEBP":
      case "BMP": {
        return this.exportNodeAsImage(
          node_id,
          format as "PNG" | "JPEG" | "WEBP" | "BMP",
          config as editor.api.ExportConfigOf<"PNG" | "JPEG" | "WEBP" | "BMP">
        ) as Promise<F extends "SVG" ? string : Uint8Array>;
      }
      case "PDF": {
        return this.exportNodeAsPDF(node_id) as Promise<
          F extends "SVG" ? string : Uint8Array
        >;
      }
      case "SVG": {
        return this.exportNodeAsSVG(node_id) as Promise<
          F extends "SVG" ? string : Uint8Array
        >;
      }
      default: {
        throw new Error(`Non supported format: ${format}`);
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

export class CanvasWasmSVGInterfaceProvider
  implements editor.api.IDocumentSVGInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Scene
  ) {}

  svgOptimize(svg: string): string | null {
    const res = this.surface.svgkit.optimize(svg);
    if (res.success) {
      return res.data.svg_optimized;
    }
    return null;
  }

  svgPack(svg: string): { svg: svgtypes.ir.IRSVGInitialContainerNode } | null {
    const res = this.surface.svgkit.pack(svg);
    if (res.success) return res.data;
    return null;
  }
}

export class CanvasWasmMarkdownInterfaceProvider
  implements editor.api.IDocumentMarkdownInterfaceProvider
{
  constructor(
    readonly editor: Editor,
    readonly surface: Scene
  ) {}

  markdownToHtml(markdown: string): string | null {
    const res = this.surface.markdownkit.toHtml(markdown);
    if (res.success) {
      return res.data.html;
    }
    return null;
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
