import { FontFaceManager } from "@grida/fonts/fontface-dom";
import { FontParserWorker } from "@grida/fonts/parser/worker";
import { editor } from "..";
import type { Editor } from "../editor";

/**
 * DOM specific font loader that registers loaded fonts to document.fonts
 */
export class DOMFontManagerAgentInterfaceProvider
  implements editor.api.IDocumentFontCollectionInterfaceProvider
{
  private manager: FontFaceManager;
  private loadedFonts = new Set<string>();

  constructor(readonly editor: Editor) {
    this.manager = new FontFaceManager();
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
   * Returns a list of fonts that have been loaded via {@link loadFont}.
   */
  listLoadedFonts(): string[] {
    return Array.from(this.loadedFonts);
  }

  setFallbackFonts(fonts: string[]): void {
    // TODO: implement explicit font fallback management.
  }
}

export class DOMFontParserInterfaceProvider
  implements editor.api.IDocumentFontParserInterfaceProvider
{
  constructor(readonly editor: Editor) {}

  private fontParserWorker: FontParserWorker | null = null;
  private getParserWorker() {
    return (this.fontParserWorker ??= new FontParserWorker());
  }

  async parseFamily(
    familyName: string,
    faces: {
      faceId: string;
      data: ArrayBuffer;
      userFontStyleItalic?: boolean;
    }[]
  ): Promise<editor.font_spec.UIFontFamily | null> {
    //

    // Parse each buffer once all fonts are loaded
    const parsed = await Promise.all(
      faces.map(({ data }) => this.getParserWorker().details(data))
    );

    const parsed_faces: editor.font_spec.UIFontFaceData[] = parsed.map(
      ({ fvar, features, postscriptName }, i) => {
        const italic = faces[i].userFontStyleItalic ?? false;
        return {
          italic,
          // following the opentype spec, the postscript name for file (not instances) is required, but technically be empty.
          postscriptName: postscriptName ?? "TTF_ERROR_NO_POSTSCRIPT_NAME",
          axes: fvar.axes,
          instances: fvar.instances,
          features,
        } satisfies editor.font_spec.UIFontFaceData;
      }
    );

    const detail: editor.font_spec.UIFontFamily = {
      family: familyName,
      faces: parsed_faces,
      styles: mapStyles(familyName, parsed_faces),
      // axes will be set externally
      // axes: ...
    } satisfies editor.font_spec.UIFontFamily;

    return detail;

    //
  }
}

/**
 * map styles for static or VF fonts.
 *
 * style = static font face or VF instance
 */
function mapStyles(
  fontFamily: string,
  types: editor.font_spec.UIFontFaceData[]
): editor.font_spec.FontStyleInstance[] {
  return types.flatMap((typeface) => {
    if (typeface.instances) {
      return typeface.instances.map(
        (instance) =>
          ({
            fontFamily,
            fontStyleName: instance.name,
            fontPostscriptName: typeface.postscriptName,
            fontInstancePostscriptName: instance.postscriptName ?? null,
            italic: typeface.italic,
            // FIXME: support Typr to return the weight
            weight: 400,
          }) satisfies editor.font_spec.FontStyleInstance
      );
    } else {
      return [
        {
          fontFamily,
          fontStyleName: typeface.postscriptName,
          fontPostscriptName: typeface.postscriptName,
          fontInstancePostscriptName: typeface.postscriptName,
          italic: typeface.italic,
          // FIXME: support Typr to return the weight
          weight: 400,
        } satisfies editor.font_spec.FontStyleInstance,
      ];
    }
  });
}
