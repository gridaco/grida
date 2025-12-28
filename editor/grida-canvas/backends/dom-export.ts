import { toPng, toSvg, toJpeg } from "html-to-image";
import type { Options } from "html-to-image/lib/types";
import type { editor } from "..";
import type { Editor } from "../editor";
import type grida from "@grida/schema";
import assert from "assert";

export async function exportAsImage(
  node_id: string,
  format: "SVG" | "PNG" | "JPEG",
  {
    xpath,
    htmlToImageOptions = {},
  }: {
    xpath?: string;
    htmlToImageOptions?: Partial<Options>;
  } = {}
): Promise<{ url: string } | null> {
  const domnode = document.getElementById(node_id);

  if (!domnode) {
    return null;
  }

  // Generate a filter function based on XPath
  let filter: Options["filter"];
  if (xpath?.trim()) {
    try {
      const xpathResult = document.evaluate(
        xpath,
        domnode,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const excludedNodes = new Set<HTMLElement>();
      for (let i = 0; i < xpathResult.snapshotLength; i++) {
        const node = xpathResult.snapshotItem(i) as HTMLElement;
        if (node) excludedNodes.add(node);
      }

      // Exclude nodes that match the XPath query
      filter = (domNode) => excludedNodes.has(domNode as HTMLElement);
    } catch (error) {
      throw new Error("Invalid XPath");
    }
  }

  // Prepare the options for html-to-image
  const options: Options = {
    ...htmlToImageOptions,
    skipFonts: true,
    preferredFontFormat: "woff2",
    filter,
  };

  // Select the correct export function
  const generateImage =
    format === "PNG" ? toPng : format === "JPEG" ? toJpeg : toSvg;

  // Export the image
  const dataUrl = await generateImage(domnode, options);
  return { url: dataUrl };
}

export class DOMImageExportInterfaceProvider
  implements editor.api.IDocumentImageExportInterfaceProvider
{
  constructor(readonly editor: Editor) {}

  async exportNodeAsImage(
    node_id: string,
    format: "PNG" | "JPEG"
  ): Promise<Uint8Array> {
    const result = await exportAsImage(node_id, format);
    if (!result) {
      throw new Error("Failed to export");
    }
    const blob = await fetch(result.url).then((res) => res.blob());
    return new Uint8Array(await blob.arrayBuffer());
  }
}

export class DOMSVGExportInterfaceProvider
  implements editor.api.IDocumentSVGExportInterfaceProvider
{
  constructor(readonly editor: Editor) {}

  async exportNodeAsSVG(node_id: string): Promise<string> {
    const result = await exportAsImage(node_id, "SVG");
    if (!result) {
      throw new Error("Failed to export");
    }
    const text = await fetch(result.url).then((res) => res.text());
    return text;
  }
}

export class DOMDefaultExportInterfaceProvider
  implements editor.api.IDocumentExporterInterfaceProvider
{
  readonly formats: grida.program.document.NodeExportSettings["format"][] = [
    "PNG",
    "JPEG",
    "SVG",
  ];

  readonly image_export: DOMImageExportInterfaceProvider;
  readonly svg_export: DOMSVGExportInterfaceProvider;

  constructor(readonly editor: Editor) {
    this.image_export = new DOMImageExportInterfaceProvider(editor);
    this.svg_export = new DOMSVGExportInterfaceProvider(editor);
  }

  canExportNodeAs(
    _node_id: string,
    format: grida.program.document.NodeExportSettings["format"] | (string & {})
  ): boolean {
    return this.formats.includes(format as any);
  }

  async exportNodeAs<
    F extends grida.program.document.NodeExportSettings["format"],
  >(
    node_id: string,
    format: F,
    _config?: editor.api.ExportConfigOf<F>
  ): Promise<F extends "SVG" ? string : Uint8Array> {
    assert(this.formats.includes(format as any), "non supported format");

    switch (format) {
      case "PNG":
      case "JPEG": {
        return this.image_export.exportNodeAsImage(
          node_id,
          format as "PNG" | "JPEG"
        ) as Promise<F extends "SVG" ? string : Uint8Array>;
      }
      case "SVG": {
        return this.svg_export.exportNodeAsSVG(node_id) as Promise<
          F extends "SVG" ? string : Uint8Array
        >;
      }
      case "PDF": {
        // PDF export not supported in DOM backend
        throw new Error("PDF export not supported in DOM backend");
      }
      case "WEBP":
      case "BMP": {
        // WEBP and BMP export not supported in DOM backend
        throw new Error(`${format} export not supported in DOM backend`);
      }
    }

    throw new Error(`Non supported format: ${format}`);
  }
}
