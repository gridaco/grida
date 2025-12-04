import { toByteArray } from "base64-js";
import { deflateSync, inflateSync, unzipSync } from "fflate";
import { decompress } from "fzstd";
import {
  compileSchema,
  decodeBinarySchema,
  encodeBinarySchema,
} from "kiwi-schema";
import defaultSchema, {
  Schema,
  Message,
  NodeChange,
  Paint,
  Color,
  Matrix,
  Vector,
  BlendMode,
  StrokeAlign,
  StrokeCap,
  StrokeJoin,
} from "./schema";

export {
  type Schema,
  type Message,
  type NodeChange,
  type Paint,
  type Color,
  type Matrix,
  type Vector,
  type BlendMode,
  type StrokeAlign,
  type StrokeCap,
  type StrokeJoin,
};

export {
  parseCommandsBlob,
  parseVectorNetworkBlob,
  type VectorNetwork,
} from "./blob-parser";

// --- Constants ---

export type Header = { prelude: string; version: number };

const FIG_KIWI_PRELUDE = "fig-kiwi";
const FIGJAM_KIWI_PRELUDE = "fig-jam.";
const FIG_KIWI_VERSION = 15;

const HTML_MARKERS = {
  metaStart: "<!--(figmeta)",
  metaEnd: "(/figmeta)-->",
  figmaStart: "<!--(figma)",
  figmaEnd: "(/figma)-->",
};

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const ZSTD_SIGNATURE = [0x28, 0xb5, 0x2f, 0xfd];

// --- Interfaces ---

export interface FigmaMeta {
  fileKey: string;
  pasteID: number;
  dataType: "scene";
}

export interface ParsedFigma {
  header: Header;
  schema: any; // Raw schema definitions (from decodeBinarySchema), not compiled
  message: Message;
}

export interface ParsedFigmaHTML extends ParsedFigma {
  meta: FigmaMeta;
}

export interface ParsedFigmaArchive extends ParsedFigma {
  preview: Uint8Array;
}

// --- Archive Handling ---

export class FigmaArchiveParser {
  private data: DataView;
  private offset = 0;

  constructor(private buffer: Uint8Array) {
    this.data = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
  }

  private read(bytes: number): Uint8Array {
    if (this.offset + bytes > this.buffer.length) {
      throw new Error(`read(${bytes}) is past end of data`);
    }
    const d = this.buffer.slice(this.offset, this.offset + bytes);
    this.offset += bytes;
    return d;
  }

  private readUint32(): number {
    const n = this.data.getUint32(this.offset, true);
    this.offset += 4;
    return n;
  }

  static parseArchive(data: Uint8Array) {
    const parser = new FigmaArchiveParser(data);

    // Read Header
    const preludeData = parser.read(FIG_KIWI_PRELUDE.length);
    // @ts-ignore: charCode check
    const prelude = String.fromCharCode.apply(String, preludeData);

    if (prelude !== FIG_KIWI_PRELUDE && prelude !== FIGJAM_KIWI_PRELUDE) {
      throw new Error(`Unexpected prelude: "${prelude}"`);
    }

    const header = { prelude, version: parser.readUint32() };
    const files: Uint8Array[] = [];

    // Read Files
    while (parser.offset + 4 < parser.buffer.length) {
      const size = parser.readUint32();
      files.push(parser.read(size));
    }

    return { header, files };
  }
}

export class FigmaArchiveWriter {
  public header: Header = {
    prelude: FIG_KIWI_PRELUDE,
    version: FIG_KIWI_VERSION,
  };
  public files: Uint8Array[] = [];

  write(): Uint8Array {
    const headerSize = FIG_KIWI_PRELUDE.length + 4;
    const totalSize = this.files.reduce(
      (sz, f) => sz + 4 + f.byteLength,
      headerSize
    );

    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);
    const enc = new TextEncoder();

    let offset = enc.encodeInto(FIG_KIWI_PRELUDE, buffer).written!;
    view.setUint32(offset, this.header.version, true);
    offset += 4;

    for (const file of this.files) {
      view.setUint32(offset, file.byteLength, true);
      offset += 4;
      buffer.set(file, offset);
      offset += file.byteLength;
    }

    return buffer;
  }
}

// --- Helpers ---

function isSignature(data: Uint8Array, signature: number[]) {
  return (
    data.length > signature.length &&
    signature.every((byte, i) => data[i] === byte)
  );
}

function decodeBase64(s: string): Uint8Array {
  return toByteArray(s);
}

function decodeBase64String(s: string): string {
  return new TextDecoder().decode(decodeBase64(s));
}

function extractBetween(html: string, start: string, end: string): string {
  const s = html.indexOf(start);
  const e = html.indexOf(end);
  if (s === -1 || e === -1 || s > e) throw new Error(`Couldn't find ${start}`);
  return html.substring(s + start.length, e);
}

// --- Public API ---

export function parseHTMLString(html: string): {
  meta: FigmaMeta;
  figma: Uint8Array;
} {
  const metaB64 = extractBetween(
    html,
    HTML_MARKERS.metaStart,
    HTML_MARKERS.metaEnd
  );
  const figB64 = extractBetween(
    html,
    HTML_MARKERS.figmaStart,
    HTML_MARKERS.figmaEnd
  );

  return {
    meta: JSON.parse(decodeBase64String(metaB64)),
    figma: decodeBase64(figB64),
  };
}

export function composeHTMLString(data: {
  meta: FigmaMeta;
  figma: Uint8Array;
}): string {
  const metaStr = Buffer.from(JSON.stringify(data.meta) + "\n").toString(
    "base64"
  );
  const figStr = Buffer.from(data.figma).toString("base64");

  return `<meta charset="utf-8" /><span data-metadata="${HTML_MARKERS.metaStart}${metaStr}${HTML_MARKERS.metaEnd}"></span><span data-buffer="${HTML_MARKERS.figmaStart}${figStr}${HTML_MARKERS.figmaEnd}"></span><span style="white-space: pre-wrap"></span>`;
}

export function readHTMLMessage(html: string): ParsedFigmaHTML {
  const { figma, meta } = parseHTMLString(html);
  return { ...parseFigData(figma), meta };
}

export function writeHTMLMessage(m: {
  meta: FigmaMeta;
  schema: Schema;
  header?: Header;
  message: Message;
}): string {
  return composeHTMLString({
    meta: m.meta,
    figma: writeFigFile(m),
  });
}

export function readFigFile(data: Uint8Array): ParsedFigmaArchive {
  let archiveData = data;

  if (isSignature(data, ZIP_SIGNATURE)) {
    const unzipped = unzipSync(data);
    const keys = Object.keys(unzipped);

    // Find main figma file
    const mainFile =
      keys.find((key) => {
        const fileData = unzipped[key];
        if (fileData.length <= 8) return false;
        // Check prelude
        // @ts-ignore: charCode check
        const prelude = String.fromCharCode.apply(String, fileData.slice(0, 8));
        return prelude === FIG_KIWI_PRELUDE || prelude === FIGJAM_KIWI_PRELUDE;
      }) || keys.find((k) => k.endsWith(".fig"));

    if (!mainFile) {
      throw new Error(
        `ZIP archive found but no valid Figma file inside. Files: ${keys.join(
          ", "
        )}`
      );
    }
    archiveData = unzipped[mainFile];
  }

  return parseFigData(archiveData);
}

function parseFigData(data: Uint8Array): ParsedFigmaArchive {
  const { header, files } = FigmaArchiveParser.parseArchive(data);
  const [schemaFile, dataFile, preview] = files;

  const fileSchema = decodeBinarySchema(inflateSync(schemaFile));
  const compiledSchema = compileSchema(fileSchema) as Schema;

  const decompressedData = isSignature(dataFile, ZSTD_SIGNATURE)
    ? decompress(dataFile)
    : inflateSync(dataFile);

  const message = compiledSchema.decodeMessage(decompressedData);
  // Return raw schema definitions so consumers can compile/pretty-print as needed
  return { message, schema: fileSchema, header, preview };
}

export function writeFigFile(settings: {
  schema?: Schema;
  header?: Header;
  message: Message;
  preview?: Uint8Array;
}): Uint8Array {
  const { schema = defaultSchema, message, preview } = settings;
  // @ts-ignore
  const compiledSchema = compileSchema(schema);
  // @ts-ignore
  const binSchema = encodeBinarySchema(schema);

  const writer = new FigmaArchiveWriter();
  writer.files = [
    deflateSync(binSchema),
    deflateSync((compiledSchema as Schema).encodeMessage(message)),
  ];
  if (preview) writer.files.push(preview);

  return writer.write();
}

/**
 * Get blob data by blob ID from Message.blobs array
 *
 * Resolves a blob reference (e.g., from vectorNetworkBlob, commandsBlob)
 * to the actual blob bytes using the blobBaseIndex offset.
 *
 * @param blobId - Blob reference ID (from vectorNetworkBlob, commandsBlob, etc.)
 * @param message - Parsed Message containing blobs array
 * @returns Blob bytes, or null if not found
 *
 * @example
 * ```typescript
 * const parsed = readFigFile(data);
 * const vectorNode = parsed.message.nodeChanges.find(nc => nc.type === "VECTOR");
 *
 * if (vectorNode?.vectorData?.vectorNetworkBlob) {
 *   const blobBytes = getBlobBytes(vectorNode.vectorData.vectorNetworkBlob, parsed.message);
 *   const vectorNetwork = parseVectorNetworkBlob(blobBytes);
 * }
 * ```
 */
export function getBlobBytes(
  blobId: number,
  message: Message
): Uint8Array | null {
  const index = blobId - (message.blobBaseIndex ?? 0);
  const blob = message.blobs?.[index];
  return blob?.bytes ?? null;
}
