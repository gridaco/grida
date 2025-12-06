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
 *   deno run --allow-read --allow-write --allow-net fig2kiwi.ts <input.fig> [output-name] [--produce-cpp]
 *
 *   Or make it executable:
 *   chmod +x fig2kiwi.ts
 *   ./fig2kiwi.ts <input.fig> [output-name] [--produce-cpp]
 *
 * EXAMPLES:
 *   # Extract schema, output to fig.kiwi and fig.kiwi.d.ts (default)
 *   deno run --allow-read --allow-write --allow-net fig2kiwi.ts file.fig
 *
 *   # Extract schema to custom name
 *   deno run --allow-read --allow-write --allow-net fig2kiwi.ts file.fig schema
 *   # Outputs: schema.kiwi and schema.kiwi.d.ts
 *
 *   # Include C++ header (optional, produces large file ~1.8MB)
 *   deno run --allow-read --allow-write --allow-net fig2kiwi.ts file.fig schema --produce-cpp
 *   # Outputs: schema.kiwi, schema.kiwi.d.ts, and schema.kiwi.h
 *
 * WHAT IT DOES:
 *   1. Parses the .fig file (handles both raw archives and ZIP-wrapped files)
 *   2. Extracts the schema from the first chunk
 *   3. Converts it to human-readable Kiwi schema format
 *   4. Generates TypeScript definitions from the schema
 *   5. Optionally generates C++ definitions (with --produce-cpp flag)
 *
 * OUTPUT FILES:
 *   - [name].kiwi - Human-readable Kiwi schema definition (enums, structs, messages)
 *   - [name].kiwi.d.ts - TypeScript type definitions for the schema
 *   - [name].kiwi.h - C++ header definitions (only with --produce-cpp flag)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, unzipSync } from "npm:fflate@0.8.2";
import {
  decodeBinarySchema,
  prettyPrintSchema,
  compileSchemaTypeScript,
  compileSchemaCPP,
} from "npm:kiwi-schema@0.5.0";

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
      "Usage: deno run --allow-read --allow-write --allow-net fig2kiwi.ts <input.fig> [output-name] [--produce-cpp]"
    );
    console.error("");
    console.error("Examples:");
    console.error(
      "  deno run --allow-read --allow-write --allow-net fig2kiwi.ts file.fig"
    );
    console.error(
      "  deno run --allow-read --allow-write --allow-net fig2kiwi.ts file.fig schema"
    );
    console.error(
      "  deno run --allow-read --allow-write --allow-net fig2kiwi.ts file.fig schema --produce-cpp"
    );
    Deno.exit(1);
  }

  const inputFile = args[0];
  const outputName = args[1] && !args[1].startsWith("--") ? args[1] : "fig";
  const produceCpp = args.includes("--produce-cpp");

  try {
    console.log(`Reading ${inputFile}...`);
    const figData = readFileSync(inputFile);

    console.log(`Parsing .fig file...`);
    const parsed = readFigFile(figData);

    console.log(`Extracting schema (version ${parsed.header.version})...`);
    const schemaText = prettyPrintSchema(parsed.schema);
    const schemaTypescript = compileSchemaTypeScript(parsed.schema);

    const kiwiFile = `${outputName}.kiwi`;
    const dtsFile = `${outputName}.kiwi.d.ts`;

    console.log(`Writing schema to ${kiwiFile}...`);
    writeFileSync(kiwiFile, schemaText, "utf8");

    console.log(`Writing TypeScript definitions to ${dtsFile}...`);
    writeFileSync(dtsFile, schemaTypescript, "utf8");

    const outputs = [kiwiFile, dtsFile];

    if (produceCpp) {
      console.log(`Generating C++ definitions...`);
      const schemaCpp = compileSchemaCPP(parsed.schema);
      const cppFile = `${outputName}.kiwi.h`;

      console.log(`Writing C++ definitions to ${cppFile}...`);
      writeFileSync(cppFile, schemaCpp, "utf8");

      outputs.push(cppFile);
      console.log(`  C++ definitions: ${schemaCpp.length} characters`);
    }

    console.log(`✓ Schema extracted successfully!`);
    console.log(`  Input:  ${inputFile}`);
    console.log(`  Output: ${outputs.join(", ")}`);
    console.log(`  Schema version: ${parsed.header.version}`);
    console.log(`  Schema size: ${schemaText.length} characters`);
    console.log(
      `  TypeScript definitions: ${schemaTypescript.length} characters`
    );
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
