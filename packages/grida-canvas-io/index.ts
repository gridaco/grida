import grida from "@grida/schema";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { encode, decode, type PngDataArray } from "fast-png";
import { XMLParser } from "fast-xml-parser";
import { imageSize } from "image-size";
import { format } from "./format";

// Type alias to avoid namespace shadowing inside io namespace
type GridaDocument = grida.program.document.Document;

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
        if (p.type === "tspan") {
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
    /**
     * Optional raw assets extracted from an archive.
     *
     * Keys are canonical image hash ids (hex16), values are encoded image bytes.
     */
    assets?: {
      images: Record<string, Uint8Array>;
    };
  }

  /**
   * Snapshot model (JSON)
   *
   * This is NOT a supported `.grida` file format. It's intended for tests and
   * legacy conversion only.
   */
  export interface SnapshotDocumentModel {
    version: string;
    document: grida.program.document.Document;
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
   * Checks if bytes are a raw FlatBuffers .grida buffer by verifying the file
   * identifier ("GRID") at bytes[4..7].
   */
  export function is_grid(bytes: Uint8Array): boolean {
    return (
      bytes.length >= 8 &&
      bytes[4] === 0x47 && // G
      bytes[5] === 0x52 && // R
      bytes[6] === 0x49 && // I
      bytes[7] === 0x44 // D
    );
  }

  export namespace fileformat {
    export type Kind = "grida" | "zip" | "unknown";

    export type Detected =
      | { kind: "grida"; bytes: Uint8Array }
      | {
          kind: "zip";
          bytes: Uint8Array;
          archive: {
            manifest: io.archive.Manifest;
            document: Uint8Array;
            images: Record<string, Uint8Array>;
            bitmaps: Record<string, io.Bitmap>;
          };
        }
      | { kind: "unknown"; bytes?: Uint8Array };

    /**
     * Detects the .grida file format and returns a processed result so callers
     * don't repeat expensive work (unzip).
     */
    export async function detect(file: File): Promise<Detected> {
      // ZIP? (cheap: reads 4 bytes)
      const head4 = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const isZip =
        head4.length >= 4 &&
        head4[0] === 0x50 &&
        head4[1] === 0x4b &&
        (head4[2] === 0x03 || head4[2] === 0x05);

      if (isZip) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        try {
          const files = unzipSync(bytes);

          // FlatBuffers container manifest?
          if (files["manifest.json"]) {
            const manifestJson = strFromU8(files["manifest.json"]);
            const manifest = JSON.parse(manifestJson) as io.archive.Manifest;

            const document = files["document.grida"] ?? null;

            if (manifest.document_file === "document.grida" && document) {
              if (!document) return { kind: "unknown", bytes };

              const images: Record<string, Uint8Array> = {};
              const prefix = "images/";
              for (const [path, data] of Object.entries(files)) {
                if (path.startsWith(prefix) && path !== prefix) {
                  images[path.slice(prefix.length)] = data;
                }
              }

              const bitmaps: Record<string, io.Bitmap> = {};
              const bmpPrefix = "bitmaps/";
              for (const [path, data] of Object.entries(files)) {
                if (
                  path.startsWith(bmpPrefix) &&
                  path.endsWith(".png") &&
                  path !== bmpPrefix
                ) {
                  const key = path.slice(bmpPrefix.length, -4);
                  try {
                    const pngd = decode(data);
                    bitmaps[key] = {
                      version: 0,
                      width: pngd.width,
                      height: pngd.height,
                      data: __norm_png_data(pngd.data),
                    };
                  } catch {
                    // ignore invalid bitmap
                  }
                }
              }

              return {
                kind: "zip",
                bytes,
                archive: { manifest, document, images, bitmaps },
              };
            }
          }
        } catch {
          // Invalid ZIP; fall through
        }

        return { kind: "unknown", bytes };
      }

      // Raw FlatBuffers? (cheap: reads 8 bytes)
      const head8 = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (io.is_grid(head8)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        return { kind: "grida", bytes };
      }

      return { kind: "unknown" };
    }
  }

  export async function load(file: File): Promise<LoadedDocument> {
    const detected = await fileformat.detect(file);

    // Handle FlatBuffers ZIP container
    if (detected.kind === "zip") {
      const {
        document: fbBytes,
        images: _x_images,
        bitmaps: _x_bitmaps,
      } = detected.archive;

      // Decode FlatBuffers document
      const document = format.document.decode.fromFlatbuffer(fbBytes);

      // Convert images into a hash-addressed asset map, and populate a minimal images repository
      // keyed by hash (persisted identifier). Runtime should resolve/register and rewrite refs.
      const imagesRepo: Record<string, grida.program.document.ImageRef> = {};
      const assets: Record<string, Uint8Array> = {};

      for (const [key, imageData] of Object.entries(_x_images)) {
        const base = key.split("/").pop() ?? key;
        const hashHex = base.includes(".") ? base.split(".")[0]! : base;

        const dimensions = imageSize(new Uint8Array(imageData));
        if (!dimensions || !dimensions.width || !dimensions.height) {
          throw new Error(`Failed to get dimensions for image: ${key}`);
        }
        const { width, height, type } = dimensions;
        const mimeType = IMAGE_TYPE_TO_MIME_TYPE[type || "png"] || "image/png";

        assets[hashHex] = imageData;
        imagesRepo[hashHex] = {
          url: hashHex,
          width,
          height,
          bytes: imageData.byteLength,
          type: mimeType,
        };
      }

      return {
        version: grida.program.document.SCHEMA_VERSION,
        document: { ...document, images: imagesRepo, bitmaps: _x_bitmaps },
        assets: { images: assets },
      } satisfies LoadedDocument;
    }

    // Handle raw FlatBuffers binary
    if (detected.kind === "grida") {
      const document = format.document.decode.fromFlatbuffer(detected.bytes);
      return {
        version: grida.program.document.SCHEMA_VERSION,
        document: { ...document, images: {}, bitmaps: {} },
      } satisfies LoadedDocument;
    }

    throw new Error(`Unsupported file type: ${file.type}`);
  }

  /**
   * Snapshot (JSON) helpers.
   *
   * This is intentionally "as-is" JSON:
   * - no ZIP container
   * - no normalization/conversion
   */
  export namespace snapshot {
    export function parse(content: string | any): any {
      return typeof content === "string" ? JSON.parse(content) : content;
    }

    export function stringify(model: unknown): string {
      return JSON.stringify(model);
    }

    /**
     * Internal snapshot ZIP format (`.grida1.zip`).
     *
     * This is a test-only format that stores snapshot JSON in a ZIP archive.
     * It's used for fixtures and internal testing purposes only.
     * Not part of the public `.grida` file format specification.
     */
    export namespace grida1zip {
      /**
       * Packs a snapshot document model into a `.grida1.zip` file.
       *
       * @param model - The snapshot document model to pack
       * @returns Uint8Array containing the ZIP archive with `document.grida1` inside
       */
      export function pack(model: SnapshotDocumentModel): Uint8Array {
        const json = stringify(model);
        return zipSync({
          "document.grida1": strToU8(json),
        });
      }

      /**
       * Unpacks a `.grida1.zip` file into a snapshot document model.
       *
       * @param zipData - The ZIP archive bytes
       * @returns The parsed snapshot document model
       * @throws If the ZIP is invalid or missing `document.grida1`
       */
      export function unpack(zipData: Uint8Array): SnapshotDocumentModel {
        const files = unzipSync(zipData);
        const snapshotJson = strFromU8(files["document.grida1"]);
        if (!snapshotJson) {
          throw new Error("Missing document.grida1 in zip file");
        }
        return parse(snapshotJson) as SnapshotDocumentModel;
      }
    }
  }

  export type Bitmap = {
    version: number;
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };

  export namespace archive {
    /**
     * Grida `.grida` archive (ZIP) format.
     *
     * A `.grida` file can be:
     * - raw FlatBuffers (starts with file identifier "GRID")
     * - ZIP archive containing:
     *   - `manifest.json`
     *   - `document.grida`
     *   - `document.grida1` (legacy JSON snapshot for migration purposes)
     *   - optional `images/*`
     */
    export interface Manifest {
      document_file: "document.grida";
      /**
       * Optional schema version string associated with the document.
       *
       * This is not used for routing; it's informational/diagnostic only.
       */
      version?: string;
      /**
       * Optional images index for hash-addressed image assets stored under `images/`.
       *
       * Key is the canonical SeaHash hex16 (lowercase, big-endian) used for filenames.
       * Value includes metadata needed to reconstruct `document.images` and/or to
       * register resources into WASM.
       */
      images?: Record<
        string,
        {
          ext?: string;
          mime?: string;
          bytes?: number;
          width?: number;
          height?: number;
        }
      >;
    }

    /**
     * Packs a `.grida` ZIP archive from a Grida document.
     *
     * The function:
     * 1. Encodes the document to FlatBuffers binary format (`document.grida`)
     * 2. Generates a JSON snapshot (`document.grida1`) for migration purposes
     * 3. Packages everything into a ZIP archive with optional images and bitmaps
     *
     * @param document - The Grida document to pack
     * @param images - Optional image assets to include in the archive
     * @param schemaVersion - Optional schema version (defaults to current)
     * @param bitmaps - Optional bitmap assets to include in the archive
     * @returns Uint8Array containing the ZIP archive
     */
    export function pack(
      document: grida.program.document.Document,
      images?: Record<string, Uint8Array>,
      schemaVersion: string = grida.program.document.SCHEMA_VERSION,
      bitmaps?: Record<string, io.Bitmap>
    ): Uint8Array {
      // Extract bitmaps from document if not provided
      const inferredBitmaps: Record<string, io.Bitmap> | undefined =
        bitmaps ?? document.bitmaps;

      // Encode document to FlatBuffers binary
      const fbBytes = format.document.encode.toFlatbuffer(
        {
          ...document,
          images: {},
          bitmaps: {},
        },
        schemaVersion
      );

      // Generate document.grida1 (JSON snapshot) from document (for migration purposes)
      const {
        images: _images,
        bitmaps: _bitmaps,
        ...persistedDocument
      } = document;
      const snapshotJson = io.snapshot.stringify({
        version: schemaVersion,
        document: persistedDocument,
      });

      const manifest: Manifest = {
        document_file: "document.grida",
        version: schemaVersion,
      };

      // Optional image index (best-effort).
      if (images && Object.keys(images).length > 0) {
        const index: NonNullable<Manifest["images"]> = {};
        for (const [key, imageData] of Object.entries(images)) {
          const name = key.split("/").pop() ?? key;
          const ext = name.includes(".") ? name.split(".").pop() : undefined;
          index[name.split(".")[0] ?? name] = {
            ext,
            bytes: imageData.byteLength,
          };
        }
        manifest.images = index;
      }

      const files: Record<string, Uint8Array> = {
        "manifest.json": strToU8(JSON.stringify(manifest)),
        "document.grida": fbBytes,
        "document.grida1": strToU8(snapshotJson),
        ...(images &&
          Object.keys(images).length > 0 && { "images/": new Uint8Array() }), // Ensure folder exists
      };

      // Add images
      if (images && Object.keys(images).length > 0) {
        // TODO(resources): stop hardcoding `images/`.
        //
        // The long-term contract should treat `res://<dir>/<id>` as the cross-boundary identifier,
        // and the archive should store files under `<dir>/<id>` (directory-local), not only under
        // `images/<hash>.<ext>`.
        //
        // Today we only persist image assets and only under `images/`.
        for (const [key, imageData] of Object.entries(images)) {
          files[`images/${key}`] = imageData;
        }
      }

      // Add bitmaps (PNG)
      if (inferredBitmaps && Object.keys(inferredBitmaps).length > 0) {
        files["bitmaps/"] = new Uint8Array(); // ensure folder exists
        for (const [key, bitmap] of Object.entries(inferredBitmaps)) {
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

    /**
     * Unpacks a ZIP `.grida` archive into its components.
     */
    export function unpack(zipData: Uint8Array): {
      document: Uint8Array;
      manifest: Manifest;
      images: Record<string, Uint8Array>;
      bitmaps: Record<string, io.Bitmap>;
    } {
      const files = unzipSync(zipData);

      // Parse manifest
      const manifestJson = strFromU8(files["manifest.json"]);
      const manifest = JSON.parse(manifestJson) as Manifest;

      // Extract document
      const document = files["document.grida"];
      if (!document) {
        throw new Error("Missing document file: document.grida");
      }

      // Extract images
      const images: Record<string, Uint8Array> = {};
      const prefix = "images/";
      for (const [path, data] of Object.entries(files)) {
        if (path.startsWith(prefix) && path !== prefix) {
          const key = path.slice(prefix.length);
          images[key] = data;
        }
      }

      const bitmaps: Record<string, io.Bitmap> = {};
      const bmpPrefix = "bitmaps/";
      for (const [path, data] of Object.entries(files)) {
        if (
          path.startsWith(bmpPrefix) &&
          path.endsWith(".png") &&
          path !== bmpPrefix
        ) {
          const key = path.slice(bmpPrefix.length, -4);
          const pngd = decode(data);
          bitmaps[key] = {
            version: 0,
            width: pngd.width,
            height: pngd.height,
            data: __norm_png_data(pngd.data),
          };
        }
      }

      return { document, manifest, images, bitmaps };
    }
  }

  export namespace GRID {
    /**
     * Encodes a Grida document to raw FlatBuffers bytes.
     *
     * This is a minimal API for persisting documents without ZIP containers.
     * Non-persisted fields (images, bitmaps) are stripped before encoding.
     *
     * @param document - The Grida document to encode
     * @param schemaVersion - Optional schema version (defaults to current)
     * @returns Uint8Array containing raw FlatBuffers bytes
     *
     * @example
     * ```typescript
     * const bytes = io.grida.encode(document);
     * await opfs.writeBytes(bytes);
     * ```
     */
    export function encode(
      document: GridaDocument,
      schemaVersion: string = grida.program.document.SCHEMA_VERSION
    ): Uint8Array {
      // Strip non-persisted fields (images, bitmaps) before encoding
      const { images, bitmaps, ...persistedDocument } = document;
      return format.document.encode.toFlatbuffer(
        persistedDocument as GridaDocument,
        schemaVersion
      );
    }

    /**
     * Decodes raw FlatBuffers bytes to a Grida document.
     *
     * @param bytes - Raw FlatBuffers bytes (must start with "GRID" magic)
     * @returns Decoded Grida document (with empty images/bitmaps)
     *
     * @example
     * ```typescript
     * const bytes = await opfs.readBytes();
     * const document = io.grida.decode(bytes);
     * ```
     */
    export function decode(bytes: Uint8Array): GridaDocument {
      const document = format.document.decode.fromFlatbuffer(bytes);
      // Ensure images and bitmaps are empty (they're not persisted)
      return {
        ...document,
        images: {},
        bitmaps: {},
      };
    }
  }

  /**
   * Grida-specific OPFS (Origin Private File System) adapter.
   *
   * Provides utilities for persisting Grida documents and assets to the browser's
   * Origin Private File System. This is a Grida-specific adapter that works with
   * a fixed file structure within a configurable directory path.
   *
   * **Fixed Structure:**
   * - `document.grida` - Raw FlatBuffers bytes of the Grida document
   * - `thumbnail.png` - Document thumbnail (reserved for future)
   * - `images/` - Image assets directory (reserved for future)
   *
   * **Usage:**
   * ```typescript
   * const handle = new io.opfs.Handle({
   *   directory: ["playground", "current"]
   * });
   *
   * // Read document
   * const bytes = await handle.get('document.grida').read();
   * const document = io.GRID.decode(bytes);
   *
   * // Write document
   * const encoded = io.GRID.encode(document);
   * await handle.get('document.grida').write(encoded);
   *
   * // Delete document
   * await handle.get('document.grida').delete();
   * ```
   *
   * @remarks
   * - All methods throw errors on failure (no silent failures)
   * - OPFS is only available in secure contexts (HTTPS or localhost)
   * - Directory path segments are created automatically if they don't exist
   */
  export namespace opfs {
    /**
     * Configuration for Grida OPFS storage.
     * Defines the directory path where Grida files are stored.
     *
     * Fixed structure within the directory:
     * - document.grida (raw FlatBuffers bytes)
     * - document.grida1 (legacy JSON snapshot for migration purposes)
     * - thumbnail.png (reserved for future)
     * - images/ (reserved for future)
     */
    export interface Config {
      /**
       * Directory path segments (e.g., ["playground", "current"])
       * Will be created if they don't exist.
       */
      directory: string[];
    }

    /**
     * Strongly-typed file keys for Grida OPFS structure.
     */
    export type FileKey =
      // NOTE: images are stored under a directory and addressed by filename.
      // We keep these as methods (not union keys) because OPFS directory entries
      // are not single files.
      "document.grida" | "document.grida1" | "thumbnail.png";

    /**
     * File handle interface for OPFS file operations.
     */
    export interface FileHandle {
      /**
       * Reads the file from OPFS.
       * @returns Raw bytes
       * @throws If file not found or read fails
       */
      read(): Promise<Uint8Array>;

      /**
       * Writes bytes to the file in OPFS.
       * @param bytes - Raw bytes to write
       * @throws If write fails
       */
      write(bytes: Uint8Array): Promise<void>;

      /**
       * Deletes the file from OPFS.
       * @throws If delete fails (except if file doesn't exist)
       */
      delete(): Promise<void>;
    }

    /**
     * OPFS handle for accessing Grida files.
     *
     * Provides strongly-typed access to files in the Grida OPFS structure.
     * Directory is created automatically on first access.
     *
     * @example
     * ```typescript
     * const handle = new io.opfs.Handle({
     *   directory: ["playground", "current"]
     * });
     *
     * // Read document
     * const bytes = await handle.get('document.grida').read();
     * const document = io.GRID.decode(bytes);
     *
     * // Write document
     * const encoded = io.GRID.encode(document);
     * await handle.get('document.grida').write(encoded);
     *
     * // Delete document
     * await handle.get('document.grida').delete();
     * ```
     */
    export class Handle {
      private _dirHandle: FileSystemDirectoryHandle | null = null;
      private _dirHandlePromise: Promise<FileSystemDirectoryHandle> | null =
        null;
      private _fileHandles = new Map<FileKey, FileHandle>();

      constructor(private readonly config: Config) {
        if (!Handle.isSupported()) {
          throw new Error("OPFS is not supported in this environment");
        }
      }

      /**
       * Checks if OPFS is supported in the current environment.
       */
      static isSupported(): boolean {
        return (
          typeof window !== "undefined" &&
          "storage" in navigator &&
          "getDirectory" in navigator.storage &&
          window.isSecureContext
        );
      }

      /**
       * Gets or creates the directory handle (cached).
       */
      private async getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
        if (this._dirHandle) {
          return this._dirHandle;
        }

        if (this._dirHandlePromise) {
          return this._dirHandlePromise;
        }

        this._dirHandlePromise = (async () => {
          try {
            const root = await navigator.storage.getDirectory();
            let currentDir = root;

            for (const segment of this.config.directory) {
              currentDir = await currentDir.getDirectoryHandle(segment, {
                create: true,
              });
            }

            this._dirHandle = currentDir;
            return currentDir;
          } catch (error) {
            this._dirHandlePromise = null;
            throw new Error(
              `Failed to get OPFS directory: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        })();

        return this._dirHandlePromise;
      }

      /**
       * Creates a file handle for the given filename.
       */
      private createFileHandle(filename: FileKey): FileHandle {
        return {
          read: async (): Promise<Uint8Array> => {
            const dir = await this.getDirectoryHandle();

            try {
              const fileHandle = await dir.getFileHandle(filename);
              const file = await fileHandle.getFile();
              const bytes = new Uint8Array(await file.arrayBuffer());
              return bytes;
            } catch (error) {
              if (
                error instanceof DOMException &&
                (error.name === "NotFoundError" ||
                  error.name === "TypeMismatchError")
              ) {
                throw new Error(`${filename} not found in OPFS`);
              }
              throw new Error(
                `Failed to read OPFS ${filename}: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          },

          write: async (bytes: Uint8Array): Promise<void> => {
            const dir = await this.getDirectoryHandle();

            try {
              const fileHandle = await dir.getFileHandle(filename, {
                create: true,
              });
              const writable = await fileHandle.createWritable();
              await writable.write(
                bytes as unknown as FileSystemWriteChunkType
              );
              await writable.close();
            } catch (error) {
              throw new Error(
                `Failed to write OPFS ${filename}: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          },

          delete: async (): Promise<void> => {
            const dir = await this.getDirectoryHandle();

            try {
              await dir.removeEntry(filename);
            } catch (error) {
              // File doesn't exist - this is not an error
              if (
                error instanceof DOMException &&
                error.name === "NotFoundError"
              ) {
                return;
              }
              throw new Error(
                `Failed to delete OPFS ${filename}: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          },
        };
      }

      /**
       * Strongly-typed file accessor.
       * @example
       * ```typescript
       * const bytes = await handle.get('document.grida').read();
       * await handle.get('document.grida').write(bytes);
       * ```
       */
      get(key: FileKey): FileHandle {
        if (!this._fileHandles.has(key)) {
          this._fileHandles.set(key, this.createFileHandle(key));
        }
        return this._fileHandles.get(key)!;
      }

      /**
       * Writes an image blob into `images/<filename>` under this handle directory.
       */
      async writeImage(filename: string, bytes: Uint8Array): Promise<void> {
        // TODO(resources): stop hardcoding the OPFS `images/` directory.
        // Once `res://<dir>/<id>` is the cross-boundary identifier, OPFS should store
        // assets under `<dir>/...` accordingly (general-purpose directory-local layout).
        const dir = await this.getDirectoryHandle();
        const imagesDir = await dir.getDirectoryHandle("images", {
          create: true,
        });
        const fileHandle = await imagesDir.getFileHandle(filename, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(bytes as unknown as FileSystemWriteChunkType);
        await writable.close();
      }

      /**
       * Lists image filenames under `images/`.
       */
      async listImages(): Promise<string[]> {
        const dir = await this.getDirectoryHandle();
        try {
          const imagesDir = await dir.getDirectoryHandle("images");
          const names: string[] = [];
          // NOTE: TypeScript's lib.dom typing for the File System Access API varies by TS/lib config.
          // We avoid `as any`, but still need a narrow typing bridge for `entries()` in some configs.
          const entries = (
            imagesDir as unknown as {
              entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
            }
          ).entries();
          for await (const [name, handle] of entries) {
            if (handle && handle.kind === "file") names.push(name);
          }
          return names;
        } catch {
          return [];
        }
      }

      /**
       * Reads `images/<filename>` bytes.
       */
      async readImage(filename: string): Promise<Uint8Array> {
        const dir = await this.getDirectoryHandle();
        const imagesDir = await dir.getDirectoryHandle("images");
        const fileHandle = await imagesDir.getFileHandle(filename);
        const file = await fileHandle.getFile();
        return new Uint8Array(await file.arrayBuffer());
      }
    }
  }

  export namespace zip {
    /**
     * Ensures export data is a Uint8Array, encoding strings if needed.
     * Used when preparing export data for zip file creation.
     *
     * @param data - The export data, either a string (e.g., SVG) or Uint8Array (e.g., PNG, JPEG)
     * @returns Uint8Array representation of the data
     *
     * @example
     * ```typescript
     * const svgData = "<svg>...</svg>";
     * const bytes = io.zip.ensureUint8Array(svgData);
     *
     * const pngData = new Uint8Array([...]);
     * const bytes = io.zip.ensureUint8Array(pngData);
     * ```
     */
    export function ensureUint8Array(data: string | Uint8Array): Uint8Array {
      if (typeof data === "string") {
        return new TextEncoder().encode(data);
      }
      return data;
    }

    /**
     * Creates a ZIP file from a record of filenames to file data.
     * Each file in the record will be included in the ZIP archive.
     *
     * @param files - Record mapping filenames to their Uint8Array data
     * @returns Uint8Array containing the ZIP file data
     *
     * @example
     * ```typescript
     * const files = {
     *   "image-1x.png": png1xData,
     *   "image-2x.png": png2xData,
     *   "vector.svg": svgData,
     * };
     * const zipData = io.zip.create(files);
     * const blob = new Blob([zipData], { type: "application/zip" });
     * ```
     */
    export function create(files: Record<string, Uint8Array>): Uint8Array {
      return zipSync(files);
    }
  }

  function __norm_png_data(data: PngDataArray): Uint8ClampedArray {
    return data instanceof Uint8ClampedArray
      ? data
      : new Uint8ClampedArray(data);
  }
}
