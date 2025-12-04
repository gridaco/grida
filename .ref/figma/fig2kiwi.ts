#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net

/**
 * fig2kiwi.ts - Standalone CLI script to extract Kiwi schema from .fig files
 *
 * This script is completely independent - no package.json or other files needed.
 * Just run it with Deno and it will download dependencies on first use.
 * Can be moved to any repository and run standalone.
 *
 * REQUIREMENTS:
 *   - Deno runtime (https://deno.land)
 *   - No package.json or dependencies to manage - Deno downloads them automatically
 *
 * USAGE:
 *   deno run --allow-read --allow-write --allow-net fig2kiwi.ts <input.fig> [output.kiwi]
 *
 *   Or make it executable:
 *   chmod +x fig2kiwi.ts
 *   ./fig2kiwi.ts <input.fig> [output.kiwi]
 *
 * EXAMPLES:
 *   # Extract schema, output to input.kiwi (default)
 *   deno run --allow-read --allow-write --allow-net fig2kiwi.ts file.fig
 *
 *   # Extract schema to specific file
 *   deno run --allow-read --allow-write --allow-net fig2kiwi.ts file.fig schema.kiwi
 *
 * WHAT IT DOES:
 *   1. Parses the .fig file (handles both raw archives and ZIP-wrapped files)
 *   2. Extracts the schema from the first chunk
 *   3. Converts it to human-readable Kiwi schema format
 *   4. Saves it as a .kiwi text file (or your specified extension)
 *
 * OUTPUT FORMAT:
 *   The output format is the same as the schema text format used in kiwi-schema.
 *   It's a human-readable Kiwi schema definition with enums, structs, and messages.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, unzipSync } from "npm:fflate@0.8.2";
import { decodeBinarySchema, prettyPrintSchema } from "npm:kiwi-schema@0.5.0";

// --- Constants ---

const FIG_KIWI_PRELUDE = "fig-kiwi";
const FIGJAM_KIWI_PRELUDE = "fig-jam.";
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

// --- Archive Parser (duplicated from main source) ---

class FigmaArchiveParser {
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
    const prelude = String.fromCharCode.apply(String, Array.from(preludeData));

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

// --- Helpers (duplicated from main source) ---

function isSignature(data: Uint8Array, signature: number[]): boolean {
  return (
    data.length > signature.length &&
    signature.every((byte, i) => data[i] === byte)
  );
}

function readFigFile(data: Uint8Array) {
  let archiveData = data;

  // Handle ZIP archives (newer .fig files)
  if (isSignature(data, ZIP_SIGNATURE)) {
    const unzipped = unzipSync(data);
    const keys = Object.keys(unzipped);

    // Find main figma file
    const mainFile =
      keys.find((key) => {
        const fileData = unzipped[key];
        if (fileData.length <= 8) return false;
        // Check prelude
        const prelude = String.fromCharCode.apply(
          String,
          Array.from(fileData.slice(0, 8))
        );
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

function parseFigData(data: Uint8Array) {
  const { header, files } = FigmaArchiveParser.parseArchive(data);
  const [schemaFile] = files;

  if (!schemaFile) {
    throw new Error("No schema file found in archive");
  }

  // Decompress and decode the schema
  const fileSchema = decodeBinarySchema(inflateSync(schemaFile));

  return { schema: fileSchema, header };
}

// --- Main CLI ---

function main() {
  const args = Deno.args;

  if (args.length === 0) {
    console.error(
      "Usage: deno run --allow-read --allow-write --allow-net scripts/fig2kiwi.ts <input.fig> [output.kiwi]"
    );
    console.error("");
    console.error("Examples:");
    console.error(
      "  deno run --allow-read --allow-write --allow-net scripts/fig2kiwi.ts file.fig"
    );
    console.error(
      "  deno run --allow-read --allow-write --allow-net scripts/fig2kiwi.ts file.fig schema.kiwi"
    );
    Deno.exit(1);
  }

  const inputFile = args[0];
  const outputFile = args[1] || inputFile.replace(/\.fig$/, ".kiwi");

  try {
    console.log(`Reading ${inputFile}...`);
    const figData = readFileSync(inputFile);

    console.log(`Parsing .fig file...`);
    const parsed = readFigFile(figData);

    console.log(`Extracting schema (version ${parsed.header.version})...`);
    const schemaText = prettyPrintSchema(parsed.schema);

    console.log(`Writing schema to ${outputFile}...`);
    writeFileSync(outputFile, schemaText, "utf8");

    console.log(`✓ Schema extracted successfully!`);
    console.log(`  Input:  ${inputFile}`);
    console.log(`  Output: ${outputFile}`);
    console.log(`  Schema version: ${parsed.header.version}`);
    console.log(`  Schema size: ${schemaText.length} characters`);
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    Deno.exit(1);
  }
}

main();
