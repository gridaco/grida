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
  /**
   * Converts a Uint8Array to a base64-encoded string.
   *
   * Uses a chunked approach to avoid stack overflow when processing large arrays.
   * Processes data in 32KB chunks (0x8000 bytes) which is safe for the spread operator.
   *
   * @param bytes - The Uint8Array to convert to base64
   * @returns The base64-encoded string
   *
   * @example
   * ```typescript
   * const data = new TextEncoder().encode("Hello, World!");
   * const base64 = io.uint8ArrayToBase64(data);
   * console.log(base64); // "SGVsbG8sIFdvcmxkIQ=="
   * ```
   */
  export function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000; // 32 KB - safe for spread operator

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      // Convert Uint8Array chunk to array for spread operator
      binary += String.fromCharCode(...Array.from(chunk));
    }

    return btoa(binary);
  }

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
      const base64 = io.uint8ArrayToBase64(utf8Bytes);

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
     * This function handles Chrome Clipboard API bug where HTML entities are escaped
     * (`&lt;` instead of `<`, `&gt;` instead of `>`). It first checks for the "(figma)" keyword,
     * and if found, normalizes escaped entities before checking for all required markers.
     *
     * This function only checks for Figma-specific markers without parsing the payload.
     * Actual parsing happens in the editor layer where @grida/io-figma is available.
     *
     * @param html - The HTML string from clipboard (may contain escaped entities from Chrome)
     * @returns true if the HTML contains Figma clipboard markers, false otherwise
     */
    export function isFigmaClipboard(html: string): boolean {
      // Check if "(figma)" keyword exists (the core identifier)
      const hasFigmaKeyword = html.includes("(figma)");

      if (!hasFigmaKeyword) {
        return false;
      }

      // If keyword found, normalize HTML entities for Chrome Clipboard API bug
      // Chrome escapes HTML entities: &lt; instead of <, &gt; instead of >
      // Only normalize if we detected the keyword, allowing escaped chars
      const normalized = html
        .replace("&lt;!--(figmeta)", "<!--(figmeta)")
        .replace("(/figmeta)--&gt;", "(/figmeta)-->")
        .replace("&lt;!--(figma)", "<!--(figma)")
        .replace("(/figma)--&gt;", "(/figma)-->");

      // Check for Figma-specific HTML markers
      // Based on spec: fixtures/test-fig/clipboard/README.md
      return (
        normalized.includes("data-metadata") &&
        normalized.includes("data-buffer") &&
        normalized.includes("<!--(figmeta)") &&
        normalized.includes("<!--(figma)")
      );
    }

    /**
     * Detects if text content is SVG markup.
     *
     * Validates SVG by checking for:
     * - SVG namespace (xmlns="http://www.w3.org/2000/svg")
     * - Opening and closing svg tags
     *
     * @param text - The text string to check
     * @returns true if the text contains valid SVG markup, false otherwise
     */
    export function isSvgText(text: string): boolean {
      const trimmed = text.trim();
      return (
        trimmed.includes('xmlns="http://www.w3.org/2000/svg"') &&
        trimmed.includes("<svg") &&
        trimmed.includes("</svg>")
      );
    }

    /**
     * Determines if a file is a valid file type that is directly supported by Grida core.
     *
     * This function only returns `true` for file types that can be directly inserted into the canvas
     * (images and SVG files). Other file types like `.fig` are supported but use their own import
     * pipeline and are not considered "valid file types" by this function.
     *
     * @param file - The File object to check
     * @returns A tuple:
     *   - `[true, ValidFileType]` if the file is a directly supported type (image or SVG)
     *   - `[false, string]` if the file type is not directly supported (includes `.fig` files)
     *
     * @example
     * ```typescript
     * const [valid, type] = io.clipboard.filetype(file);
     * if (valid) {
     *   // File is an image or SVG - can be directly inserted
     *   insertFromFile(type, file);
     * } else {
     *   // File type not directly supported (e.g., .fig files use separate import pipeline)
     *   console.log(`Unsupported type: ${type}`);
     * }
     * ```
     *
     * @remarks
     * - `.fig` files are supported but not returned as valid by this function.
     *   They use their own import pipeline via the File > Import Figma menu.
     * - This function checks both `file.type` (MIME type) and file extension as fallback.
     */
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
      } else if (type === "image/webp") {
        return [true, "image/webp" as const];
      } else {
        return [false, type];
      }
    }

    /**
     * Valid file type that is direcly supported by grida core.
     * e.g. .fig is also supported, but its not treated as valid file type. it uses its own pipeline to be imported.
     */
    export type ValidFileType =
      | "image/svg+xml"
      | "image/png"
      | "image/jpeg"
      | "image/gif"
      | "image/webp";

    export type DecodedItem =
      | {
          type:
            | "image/svg+xml"
            | "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp";
          file: File;
        }
      | { type: "text"; text: string }
      | { type: "svg-text"; svg: string }
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
            // Check if text content is SVG
            if (isSvgText(data)) {
              return resolve({ type: "svg-text", svg: data });
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
            // isFigmaClipboard handles Chrome Clipboard API bug internally
            if (io.clipboard.isFigmaClipboard(html)) {
              // Normalize HTML for Figma clipboard (isFigmaClipboard already checked it's valid)
              const normalized = html
                .replace("&lt;!--(figmeta)", "<!--(figmeta)")
                .replace("(/figmeta)--&gt;", "(/figmeta)-->")
                .replace("&lt;!--(figma)", "<!--(figma)")
                .replace("(/figma)--&gt;", "(/figma)-->");
              return resolve({
                type: "canbe-figma-clipboard",
                html: normalized,
              });
            }

            return reject(new Error("Unknown HTML payload"));
          });
        } else {
          return resolve(null);
        }
      });
    }

    /**
     * Decodes ClipboardItem[] from navigator.clipboard.read() to DecodedItem[].
     *
     * This function converts ClipboardItem[] (from Clipboard API) to the same DecodedItem[]
     * format used by decode(), allowing unified paste handling for both ClipboardEvent and
     * Clipboard API sources.
     *
     * Handles the Chrome bug where HTML entities are escaped in Clipboard API (handled
     * automatically by isFigmaClipboard when detecting Figma clipboard).
     *
     * @param clipboardItems - Array of ClipboardItem from navigator.clipboard.read()
     * @returns Promise resolving to array of DecodedItem
     *
     * @example
     * ```typescript
     * const clipboardItems = await navigator.clipboard.read();
     * const decodedItems = await io.clipboard.decodeFromClipboardItems(clipboardItems);
     * // decodedItems can now be used with the same paste logic as ClipboardEvent
     * ```
     */
    export async function decodeFromClipboardItems(
      clipboardItems: ClipboardItem[]
    ): Promise<DecodedItem[]> {
      const decodedItems: DecodedItem[] = [];

      for (const clipboardItem of clipboardItems) {
        const types = clipboardItem.types;

        // Check for HTML first (Grida/Figma clipboard)
        if (types.includes("text/html")) {
          try {
            const blob = await clipboardItem.getType("text/html");
            const html = await blob.text();

            // Try Grida clipboard first
            const gridaData = decodeClipboardHtml(html);
            if (gridaData) {
              decodedItems.push({ type: "clipboard", clipboard: gridaData });
              continue;
            }

            // Check if it's Figma clipboard format
            // isFigmaClipboard handles Chrome Clipboard API bug internally
            if (isFigmaClipboard(html)) {
              // Normalize HTML for Figma clipboard (isFigmaClipboard already checked it's valid)
              const normalized = html
                .replace("&lt;!--(figmeta)", "<!--(figmeta)")
                .replace("(/figmeta)--&gt;", "(/figmeta)-->")
                .replace("&lt;!--(figma)", "<!--(figma)")
                .replace("(/figma)--&gt;", "(/figma)-->");
              decodedItems.push({
                type: "canbe-figma-clipboard",
                html: normalized,
              });
              continue;
            }
          } catch {}
        }

        // Check for image/svg+xml file
        if (types.includes("image/svg+xml")) {
          try {
            const blob = await clipboardItem.getType("image/svg+xml");
            const file = new File([blob], "clipboard.svg", {
              type: "image/svg+xml",
            });
            decodedItems.push({ type: "image/svg+xml", file });
            continue;
          } catch {}
        }

        // Check for other image types
        let imageFound = false;
        for (const imageType of [
          "image/png",
          "image/jpeg",
          "image/gif",
          "image/webp",
        ] as const) {
          if (types.includes(imageType)) {
            try {
              const blob = await clipboardItem.getType(imageType);
              const file = new File(
                [blob],
                `clipboard.${imageType.split("/")[1]}`,
                {
                  type: imageType,
                }
              );
              decodedItems.push({ type: imageType, file });
              imageFound = true;
              break;
            } catch {}
          }
        }
        if (imageFound) continue;

        // Check for text/plain (may be SVG text or plain text)
        if (types.includes("text/plain")) {
          try {
            const blob = await clipboardItem.getType("text/plain");
            const text = await blob.text();
            if (text.trim().length === 0) continue;

            // Check if text starts with grida:vn: (vector network)
            if (text.startsWith("grida:vn:")) {
              decodedItems.push({ type: "text", text });
              continue;
            }

            // Check if text is SVG
            if (isSvgText(text)) {
              decodedItems.push({ type: "svg-text", svg: text });
              continue;
            }

            // Regular text
            decodedItems.push({ type: "text", text });
          } catch {}
        }
      }

      return decodedItems;
    }

    /**
     * Testing utilities for clipboard functionality.
     * These functions simulate browser-specific behaviors for testing purposes.
     */
    export namespace testing {
      /**
       * Mocks Chrome's attribute escaping behavior in Clipboard API.
       *
       * Chrome's Clipboard API (`navigator.clipboard.read()`) escapes HTML entities,
       * converting `<` to `&lt;` and `>` to `&gt;` in HTML content, particularly in
       * attribute values. This behavior is related to Chrome 138+ changes for preventing
       * mutation XSS (mXSS) vulnerabilities.
       *
       * This function simulates that behavior for testing purposes.
       *
       * @see {@link https://developer.chrome.com/blog/escape-attributes | HTML spec change: escaping < and > in attributes}
       * @see {@link https://developer.chrome.com/docs/web-platform/unsanitized-html-async-clipboard | Unsanitized HTML in the Async Clipboard API}
       *
       * @param html - The HTML string to transform (typically from a clipboard fixture)
       * @returns HTML string with escaped entities matching Chrome's Clipboard API behavior
       *
       * @example
       * ```typescript
       * const original = '<!--comment-->';
       * const chromeMocked = io.clipboard.testing.__testonly_mock_chrome_escape_attributes(original);
       * // chromeMocked: '&lt;!--comment--&gt;'
       * ```
       */
      export function __testonly_mock_chrome_escape_attributes(
        html: string
      ): string {
        // Chrome escapes HTML entities: < becomes &lt; and > becomes &gt;
        return html.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
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
          metadata: json.document.metadata,
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
