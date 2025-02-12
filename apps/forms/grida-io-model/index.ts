import type { grida } from "@/grida";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { encode, decode } from "fast-png";

export namespace io {
  /**
   * Grida Document File model
   * .grida file is a JSON file that contains the document structure and metadata.
   */
  export interface DocumentFileModel {
    version: "2025-02-12";
    document: grida.program.document.IDocumentDefinition;
  }

  export interface ArchiveFileModel {
    document: DocumentFileModel;
    images?: Record<string, Uint8Array>;
  }

  export namespace json {
    export function parse(content: string): DocumentFileModel {
      const json = JSON.parse(content);

      const images = json.document.images ?? {};

      // serialize by type
      // url    | string
      // texture | Array => Uint8ClampedArray
      for (const key of Object.keys(images)) {
        const entry = images[key];
        if (entry.type === "texture" && Array.isArray(entry.data)) {
          entry.data = new Uint8ClampedArray(entry.data);
        }
      }

      return {
        version: json.version,
        document: {
          root_id: json.document.root_id,
          nodes: json.document.nodes,
          textures: images,
          properties: json.document.properties ?? {},
          backgroundColor: json.document.backgroundColor,
        },
      } satisfies DocumentFileModel;
    }

    export function stringify(model: DocumentFileModel): string {
      return JSON.stringify(model, (key, value) => {
        if (value instanceof Uint8ClampedArray) {
          return Array.from(value);
        }
        return value;
      });
    }
  }

  export namespace archive {
    export function pack(mem: DocumentFileModel): Uint8Array {
      console.log(mem);
      const files: Record<string, Uint8Array> = {
        "document.json": strToU8(io.json.stringify(mem)),
        "images/": new Uint8Array(), // ensures images folder exists
      };
      if (mem.document.textures) {
        for (const [key, texture] of Object.entries(mem.document.textures)) {
          console.log(key, texture);
          files[`images/${key}.png`] = new Uint8Array(
            encode({
              data: texture.data,
              width: texture.width,
              height: texture.height,
            })
          );
        }
      }
      return zipSync(files);
    }

    // export function unpack(zipData: Uint8Array): io.ArchiveFileModel {
    //   const files = unzipSync(zipData);
    //   const documentJson = strFromU8(files["document.json"]);
    //   const images: Record<string, Uint8ClampedArray> = {};
    //   for (const key in files) {
    //     if (key.startsWith("images/") && key !== "images/") {
    //       const filename = key.substring("images/".length);
    //       images[filename] = new Uint8ClampedArray(
    //         files[key].buffer,
    //         files[key].byteOffset,
    //         files[key].byteLength
    //       );
    //     }
    //   }
    //   return { document: io.json.parse(documentJson), images };
    // }
  }
}
