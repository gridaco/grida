import type { grida } from "@/grida";
import type { cmath } from "@grida/cmath";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { encode, decode, type PngDataArray } from "fast-png";

export namespace io {
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

      // convert images to blob URLs
      // for (const key in images) {
      //   const image = images[key];
      //   const blob = new Blob([image], { type: "image/png" });
      //   const url = URL.createObjectURL(blob);
      // }

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
        document: { ...document, bitmaps: bitmaps },
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
          scenes: json.document.scenes,
          bitmaps: bitmaps,
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
    export function pack(mem: JSONDocumentFileModel): Uint8Array {
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
        }
      }

      return {
        version: document.version,
        document: document,
        images: {}, // TODO: image archive support
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
