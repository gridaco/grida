import type grida from "@grida/schema";
import type cmath from "@grida/cmath";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { encode, decode, type PngDataArray } from "fast-png";
import { XMLParser } from "fast-xml-parser";
import { imageSize } from "image-size";

const IMAGE_TYPE_TO_MIME_TYPE: Record<
  string,
  grida.program.document.ImageType
> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export namespace io {
  export namespace clipboard {
    const __data_grida_io_prefix = "data-grida-io-";
    const __data_grida_clipboard = "data-grida-io-clipboard";

    interface ClipboardPayloadBase {
      payload_id: string;
    }

    export type PrototypesClipboardPayload = ClipboardPayloadBase & {
      type: "prototypes";
      prototypes: grida.program.nodes.NodePrototype[];
      ids: string[];
    };

    export type PropertiesClipboardPayload = ClipboardPayloadBase & {
      type: "properties";
      properties: grida.program.nodes.UnknownNodeProperties;
    };

    type SerializedImagePaint = {
      type: "image";
      [key: string]: unknown;
    };

    export type PropertyFillImagePaintClipboardPayload =
      ClipboardPayloadBase & {
        type: "property/fill-image-paint";
        paint: SerializedImagePaint;
        paint_target: "fill" | "stroke";
        paint_index: number;
        node_id: string;
        document_key?: string;
      };

    export type ClipboardPayload =
      | PrototypesClipboardPayload
      | PropertiesClipboardPayload
      | PropertyFillImagePaintClipboardPayload;

    export function encode(
      payload: ClipboardPayload
    ): Record<string, string | Blob> | null {
      if (payload.type !== "prototypes") {
        return null;
      }
      const result: Record<string, string | Blob> = {};

      if (payload.prototypes.length === 0) {
        return null;
      }

      // text/html (grida)
      const __main_html = encodeClipboardHtml(payload);
      const utf8Html = new TextEncoder().encode(__main_html);
      result["text/html"] = new Blob([utf8Html], {
        type: "text/html;charset=utf-8",
      });

      // text/plain (universal)
      const __text_plain = encodeClipboardText(payload);
      if (__text_plain) {
        const utf8 = new TextEncoder().encode(__text_plain);
        result["text/plain"] = new Blob([utf8], {
          type: "text/plain;charset=utf-8",
        });
      }

      return result;
    }

    export function encodeClipboardText(
      payload: ClipboardPayload
    ): string | null {
      if (payload.type !== "prototypes") {
        return null;
      }
      let __text_plain = "";
      for (const p of payload.prototypes) {
        if (p.type === "text") {
          __text_plain += p.text + "\n";
        }
      }

      if (__text_plain.trim().length > 0) {
        return __text_plain;
      }

      return null;
    }

    export function encodeClipboardHtml(payload: ClipboardPayload): string {
      const json = JSON.stringify(payload);
      const utf8Bytes = new TextEncoder().encode(json);
      const base64 = btoa(String.fromCharCode(...Array.from(utf8Bytes)));
      return `<span ${__data_grida_clipboard}="b64:${base64}"></span>`;
    }

    /**
     * Decodes clipboard HTML content into a ClipboardPayload object.
     *
     * This function is designed to be resilient against browser modifications to the clipboard HTML.
     * When content is copied to the clipboard, browsers often wrap the content with additional HTML tags
     * like <meta>, <html>, <head>, and <body>. This function handles such cases by:
     *
     * 1. Using XMLParser to parse the HTML structure
     * 2. Looking for the clipboard data in both possible locations:
     *    - Under html.body.span (when browser adds wrapper tags)
     *    - Directly under span (when no wrapper tags are present)
     *
     * @param html - The HTML string from the clipboard, which may contain browser-appended tags
     * @returns The decoded ClipboardPayload object, or null if the data is invalid or missing
     *
     * @example
     * // Original clipboard data
     * const html = '<span data-grida-io-clipboard="b64:..."></span>';
     *
     * // Browser-modified clipboard data
     * const browserHtml = '<meta charset="utf-8"><html><head></head><body><span data-grida-io-clipboard="b64:..."></span></body></html>';
     *
     * // Both will work correctly
     * const payload1 = decodeClipboardHtml(html);
     * const payload2 = decodeClipboardHtml(browserHtml);
     */
    export function decodeClipboardHtml(html: string): ClipboardPayload | null {
      try {
        const parser = new XMLParser({
          ignoreAttributes: (key) => !key.startsWith(__data_grida_io_prefix),
          attributeNamePrefix: "@",
          unpairedTags: ["meta"],
        });
        const parsed = parser.parse(html);
        const span = parsed.html?.body?.span || parsed.span;
        const data = span?.[`@${__data_grida_clipboard}`];
        if (!data || !data.startsWith("b64:")) return null;
        const base64 = data.slice(4);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const json = new TextDecoder().decode(bytes);
        return JSON.parse(json) as ClipboardPayload;
      } catch {
        return null;
      }
    }

    /**
     * Detects if HTML payload is Figma clipboard format.
     *
     * Figma uses a custom HTML format with base64-encoded metadata and binary data:
     * ```html
     * <meta charset="utf-8" />
     * <span data-metadata="<!--(figmeta)BASE64_METADATA(/figmeta)-->"></span>
     * <span data-buffer="<!--(figma)BASE64_KIWI_DATA(/figma)-->"></span>
     * ```
     *
     * This function only checks for Figma-specific markers without parsing the payload.
     * Actual parsing happens in the editor layer where @grida/io-figma is available.
     *
     * @param html - The HTML string from clipboard
     * @returns true if the HTML contains Figma clipboard markers, false otherwise
     */
    export function isFigmaClipboard(html: string): boolean {
      // Check for Figma-specific HTML markers
      // Based on spec: fixtures/test-fig/clipboard/README.md
      return (
        html.includes("data-metadata") &&
        html.includes("data-buffer") &&
        html.includes("<!--(figmeta)") &&
        html.includes("<!--(figma)")
      );
    }

    export function filetype(
      file: File
    ): [true, ValidFileType] | [false, string] {
      const type = file.type || file.name.split(".").pop() || file.name;
      if (type === "image/svg+xml") {
        return [true, "image/svg+xml" as const];
      } else if (type === "image/png") {
        return [true, "image/png" as const];
      } else if (type === "image/jpeg") {
        return [true, "image/jpeg" as const];
      } else if (type === "image/gif") {
        return [true, "image/gif" as const];
      } else {
        return [false, type];
      }
    }

    export type ValidFileType =
      | "image/svg+xml"
      | "image/png"
      | "image/jpeg"
      | "image/gif";

    export type DecodedItem =
      | {
          type: "image/svg+xml" | "image/png" | "image/jpeg" | "image/gif";
          file: File;
        }
      | { type: "text"; text: string }
      | { type: "clipboard"; clipboard: ClipboardPayload }
      | { type: "canbe-figma-clipboard"; html: string };

    /**
     * Decodes a DataTransferItem from the clipboard into a structured payload.
     *
     * This function supports three types of clipboard data:
     * - File: Returns a payload with type 'file' and the File object.
     * - Plain Text: Returns a payload with type 'text' and the text string.
     * - Grida Clipboard HTML: Returns a payload with type 'clipboard' and the decoded ClipboardPayload object.
     *
     * The function automatically detects the kind and type of the DataTransferItem and resolves the appropriate payload.
     *
     * @param item The DataTransferItem from the clipboard event to decode.
     * @returns A Promise that resolves to one of the following payloads:
     *   - `{ type: "file", file: File }` if the item is a file
     *   - `{ type: "text", text: string }` if the item is plain text
     *   - `{ type: "clipboard", clipboard: ClipboardPayload }` if the item is Grida clipboard HTML
     *
     * @throws If the item cannot be decoded or is of an unknown/unsupported type.
     *
     * @example
     * // Usage inside a paste event handler:
     * for (const item of event.clipboardData.items) {
     *   const payload = await io.clipboard.decode(item);
     *   switch (payload.type) {
     *     case 'file':
     *       // handle file
     *       break;
     *     case 'text':
     *       // handle text
     *       break;
     *     case 'clipboard':
     *       // handle Grida clipboard payload
     *       break;
     *   }
     * }
     */
    export function decode(
      item: DataTransferItem,
      config: {
        noEmptyText: boolean;
      } = { noEmptyText: true }
    ): Promise<DecodedItem | null> {
      return new Promise((resolve, reject) => {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            const [valid, type] = filetype(file);

            if (valid) {
              return resolve({ type: type, file });
            } else {
              return reject(new Error(`Unsupported file type: ${type}`));
            }
          } else {
            return reject(new Error("File is not a valid file"));
          }
        } else if (item.kind === "string" && item.type === "text/plain") {
          item.getAsString((data) => {
            if (config.noEmptyText && data.trim().length === 0) {
              return resolve(null);
            }
            return resolve({ type: "text", text: data });
          });
        } else if (item.kind === "string" && item.type === "text/html") {
          item.getAsString((html) => {
            // Try Grida clipboard first
            const data = io.clipboard.decodeClipboardHtml(html);
            if (data) {
              return resolve({ type: "clipboard", clipboard: data });
            }

            // Check if it's Figma clipboard format (without parsing)
            if (io.clipboard.isFigmaClipboard(html)) {
              return resolve({ type: "canbe-figma-clipboard", html });
            }

            return reject(new Error("Unknown HTML payload"));
          });
        } else {
          return resolve(null);
        }
      });
    }
  }

  export interface LoadedDocument {
    version: typeof grida.program.document.SCHEMA_VERSION;
    document: grida.program.document.Document;
  }

  /**
   * Grida Document File model
   * .grida file is a JSON file that contains the document structure and metadata.
   *
   * used for web usage
   */
  export interface JSONDocumentFileModel {
    version: typeof grida.program.document.SCHEMA_VERSION;
    document: grida.program.document.Document;
  }

  /**
   * Archive File model
   * .grida file is a ZIP archive that contains the JSON document file and resources.
   *
   * used for archives & desktop usage
   */
  export interface ArchiveFileModel {
    version: typeof grida.program.document.SCHEMA_VERSION;
    document: JSONDocumentFileModel;

    /**
     * raw images, uploaded by the user
     */
    images: Record<string, Uint8ClampedArray>;

    /**
     * bitmaps modified by the user
     */
    bitmaps: Record<string, cmath.raster.Bitmap>;
  }

  /**
   * Checks if a given File is a ZIP file by verifying its magic number.
   *
   * ZIP files start with the following bytes:
   *   0x50 ('P'), 0x4B ('K'), 0x03, 0x04
   *
   * Spec reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
   *
   * @param file - The file to check.
   * @returns A Promise that resolves to true if the file is a ZIP file.
   */
  export async function is_zip(file: File): Promise<boolean> {
    const buffer = await file.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    return (
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    );
  }

  /**
   * Checks if a File contains valid JSON.
   *
   * This function performs a two-step validation:
   * 1. Reads a 1KB sample and verifies it starts with "{" or "[".
   * 2. If the sample passes the heuristic, reads the full file and attempts to parse it with JSON.parse.
   *
   * @param file - The File to validate.
   * @returns A Promise that resolves to the parsed JSON object if the file contains valid JSON,
   * or `false` if the file is not valid JSON.
   */
  export async function is_json(file: File): Promise<false | any> {
    try {
      // Step 1: Heuristic check with a 1KB sample.
      const sample = await file.slice(0, 1024).text();
      if (!sample.trim().startsWith("{") && !sample.trim().startsWith("[")) {
        return false;
      }

      // Step 2: Read the full file and validate JSON structure.
      const fullText = await file.text();
      return JSON.parse(fullText);
    } catch {
      return false;
    }
  }

  export async function load(file: File): Promise<LoadedDocument> {
    if (await is_zip(file)) {
      const buffer = await file.arrayBuffer();
      const unpacked = archive.unpack(new Uint8Array(buffer));
      const {
        version,
        document: { document },
        images: _x_images,
        bitmaps: _x_bitmaps,
      } = unpacked;

      // convert images to blob URLs and create ImageRef objects
      const images: Record<string, grida.program.document.ImageRef> = {};
      for (const [key, imageData] of Object.entries(_x_images)) {
        // Get image dimensions using image-size package
        const dimensions = imageSize(new Uint8Array(imageData));
        if (!dimensions || !dimensions.width || !dimensions.height) {
          throw new Error(`Failed to get dimensions for image: ${key}`);
        }

        const { width, height, type } = dimensions;

        const mimeType = IMAGE_TYPE_TO_MIME_TYPE[type || "png"] || "image/png";
        const blob = new Blob([imageData as BlobPart], { type: mimeType });
        const url = URL.createObjectURL(blob);

        images[url] = {
          url,
          width,
          height,
          bytes: imageData.byteLength,
          type: mimeType,
        };
      }

      // load bitmaps
      const bitmaps: LoadedDocument["document"]["bitmaps"] = {};
      for (const key in _x_bitmaps) {
        const bitmap = _x_bitmaps[key];
        bitmaps[key] = {
          version: 0,
          data: bitmap.data,
          width: bitmap.width,
          height: bitmap.height,
        };
      }

      return {
        version,
        document: { ...document, bitmaps: bitmaps, images: images },
      } satisfies LoadedDocument;
    }

    const maybe_json = await is_json(file);
    if (maybe_json) {
      return json.parse(maybe_json);
    }

    throw new Error(`Unsupported file type: ${file.type}`);
  }

  export namespace json {
    export function parse(content: string | any): JSONDocumentFileModel {
      const json: JSONDocumentFileModel =
        typeof content === "string" ? JSON.parse(content) : content;

      const bitmaps = json.document.bitmaps ?? {};

      // serialize by type
      // url    | string
      // bitmap | Array => Uint8ClampedArray
      for (const key of Object.keys(bitmaps)) {
        const entry = bitmaps[key];
        if (Array.isArray(entry.data)) {
          entry.data = new Uint8ClampedArray(entry.data);
        }
      }

      return {
        version: json.version,
        document: {
          nodes: json.document.nodes,
          links: json.document.links,
          scenes_ref: json.document.scenes_ref,
          entry_scene_id: json.document.entry_scene_id,
          bitmaps: bitmaps,
          images: json.document.images ?? {},
          properties: json.document.properties ?? {},
        },
      } satisfies JSONDocumentFileModel;
    }

    export function stringify(model: JSONDocumentFileModel): string {
      return JSON.stringify(model, (key, value) => {
        if (value instanceof Uint8ClampedArray) {
          return Array.from(value);
        }
        return value;
      });
    }
  }

  export namespace archive {
    export function pack(
      mem: JSONDocumentFileModel,
      images?: Record<string, Uint8ClampedArray>
    ): Uint8Array {
      const archive_targeted_document = {
        version: mem.version,
        document: {
          ...mem.document,
          // remove bitmaps from document
          // TODO: in the future, reduce this to zip-local path references
          bitmaps: {},
        },
      } satisfies ArchiveFileModel["document"];

      const files: Record<string, Uint8Array> = {
        "document.json": strToU8(io.json.stringify(archive_targeted_document)),
        "images/": new Uint8Array(), // ensures images folder exists
        "bitmaps/": new Uint8Array(), // ensures bitmaps folder exists
      };

      // Add raw images to archive
      if (images) {
        for (const [key, imageData] of Object.entries(images)) {
          files[`images/${key}`] = new Uint8Array(imageData);
        }
      }

      if (mem.document.bitmaps) {
        for (const [key, bitmap] of Object.entries(mem.document.bitmaps)) {
          files[`bitmaps/${key}.png`] = new Uint8Array(
            encode({
              data: bitmap.data,
              width: bitmap.width,
              height: bitmap.height,
            })
          );
        }
      }
      return zipSync(files);
    }

    export function unpack(zipData: Uint8Array): io.ArchiveFileModel {
      const files = unzipSync(zipData);
      const documentJson = strFromU8(files["document.json"]);
      const document = io.json.parse(documentJson);
      const bitmaps: Record<string, cmath.raster.Bitmap> = {};
      const images: Record<string, Uint8ClampedArray> = {};

      for (const key in files) {
        if (
          key.startsWith("bitmaps/") &&
          key.endsWith(".png") &&
          key !== "bitmaps/"
        ) {
          const filename = key.substring("bitmaps/".length); // e.g "bitmaps/ref.png" => "ref.png"
          const filekey = filename.substring(0, filename.length - 4); // e.g. "ref.png" => "ref"
          const pngd = decode(files[key]);
          bitmaps[filekey] = {
            width: pngd.width,
            height: pngd.height,
            data: __norm_png_data(pngd.data),
          };
        } else if (key.startsWith("images/") && key !== "images/") {
          const filename = key.substring("images/".length); // e.g "images/photo.jpg" => "photo.jpg"
          images[filename] = new Uint8ClampedArray(files[key]);
        }
      }

      return {
        version: document.version,
        document: document,
        images: images,
        bitmaps: bitmaps,
      } satisfies io.ArchiveFileModel;
    }
  }

  function __norm_png_data(data: PngDataArray): Uint8ClampedArray {
    return data instanceof Uint8ClampedArray
      ? data
      : new Uint8ClampedArray(data);
  }
}
