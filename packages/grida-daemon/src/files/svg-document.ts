// GRIDA-SEC-004 — fixed source-byte allowance for already admitted SVG documents.
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/** Source-byte admission for SVG documents, including embedded images. */
export namespace SvgDocumentRead {
  export const MAX_BYTES = 8 * 1024 * 1024;

  export function isPath(filename: string): boolean {
    return path.extname(filename).toLowerCase() === ".svg";
  }

  export class TooLarge extends Error {
    constructor(
      filename: string,
      public readonly size: number
    ) {
      const bytes = new Intl.NumberFormat("en-US").format(size);
      const limitMiB = MAX_BYTES / (1024 * 1024);
      super(
        `${path.basename(filename)} is ${bytes} bytes. The SVG limit is ${limitMiB} MiB.`
      );
      this.name = "SvgDocumentTooLarge";
    }
  }

  export function checkSize(filename: string, size: number): void {
    if (size > MAX_BYTES) throw new TooLarge(filename, size);
  }

  export class NotFile extends Error {}

  /** Read from a descriptor for a path that the caller has already admitted. */
  export async function read(
    filename: string
  ): Promise<{ bytes: Buffer; mtime: number }> {
    const handle = await fs.open(
      filename,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new NotFile("The SVG document is not a file.");
      checkSize(filename, stat.size);
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(
          bytes,
          offset,
          bytes.length - offset,
          offset
        );
        if (!bytesRead) break;
        offset += bytesRead;
      }
      const current = await handle.stat();
      checkSize(filename, current.size);
      if (
        offset !== bytes.length ||
        current.size !== stat.size ||
        current.mtimeMs !== stat.mtimeMs
      )
        throw new Error("The SVG document changed while it was being read.");
      return { bytes, mtime: current.mtimeMs };
    } finally {
      await handle.close();
    }
  }
}
