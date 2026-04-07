#!/usr/bin/env node
/**
 * @fileoverview fig2grida — CLI entrypoint
 *
 * Converts Figma files to .grida archives.
 *
 * Supported input formats:
 *   .fig          Figma native binary (Kiwi/ZIP)
 *   .deck         Figma Deck/Slides binary (same format as .fig)
 *   .json         Figma REST API JSON response
 *   .json.gz      Gzip-compressed REST API JSON
 *   .zip          REST API archive ZIP (contains document.json + images)
 *
 * Usage:
 *   fig2grida <input> [output.grida]
 *   fig2grida <input> --out <output.grida>
 *   fig2grida <input> --pages 0,2,3
 *
 * Options:
 *   --out, -o       Output path (default: input with .grida extension)
 *   --pages, -p     Comma-separated page indices to include (default: all)
 *   --info          Print file info (pages, node counts) — .fig only
 *   --prefer-fixed-text-sizing  Use fixed width/height for text nodes
 *   --verbose       Print progress details
 *   --help          Show help
 */
import { readFileSync, writeFileSync } from "fs";
import { gunzipSync } from "zlib";
import { resolve, basename, dirname, join } from "path";
import { fig2grida, type Fig2GridaOptions } from "./fig2grida-core";
import { iofigma } from "./lib";

function printHelp(): void {
  console.log(`
fig2grida — Convert Figma files to .grida archives

Supported inputs: .fig, .deck, .json, .json.gz, .zip

Usage:
  fig2grida <input> [output.grida]
  fig2grida <input> --out <output.grida>
  fig2grida <input> --pages 0,2,3

Options:
  --out, -o       Output path (default: input with .grida extension)
  --pages, -p     Comma-separated page indices to include (default: all)
  --info          Print file info (pages, node counts) — .fig only
  --prefer-fixed-text-sizing  Use fixed width/height for text nodes
  --verbose       Print progress details
  --help          Show help

Examples:
  fig2grida design.fig
  fig2grida presentation.deck
  fig2grida api-response.json.gz output.grida
  fig2grida design.fig --pages 0,2 --verbose
  fig2grida design.fig --info
`);
}

interface CliArgs {
  input?: string;
  output?: string;
  pages?: number[];
  info: boolean;
  verbose: boolean;
  help: boolean;
  prefer_fixed_text_sizing: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    info: false,
    verbose: false,
    help: false,
    prefer_fixed_text_sizing: false,
  };

  const positional: string[] = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--info":
        args.info = true;
        break;
      case "--verbose":
      case "-v":
        args.verbose = true;
        break;
      case "--out":
      case "-o":
        i++;
        args.output = argv[i];
        break;
      case "--prefer-fixed-text-sizing":
        args.prefer_fixed_text_sizing = true;
        break;
      case "--pages":
      case "-p":
        i++;
        if (argv[i]) {
          args.pages = argv[i]
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n));
        }
        break;
      default:
        if (arg && !arg.startsWith("-")) {
          positional.push(arg);
        } else {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }

    i++;
  }

  if (positional.length >= 1) {
    args.input = positional[0];
  }
  if (positional.length >= 2 && !args.output) {
    args.output = positional[1];
  }

  return args;
}

function printInfo(inputPath: string, verbose: boolean): void {
  const absPath = resolve(inputPath);
  const data = readFileSync(absPath);
  const input = new Uint8Array(data);

  if (verbose) {
    console.log(`File: ${absPath}`);
    console.log(`Size: ${(input.byteLength / 1024).toFixed(1)} KB`);
  }

  const figFile = iofigma.kiwi.parseFile(input);

  console.log(`Kiwi version: ${figFile.metadata.version}`);
  console.log(`Pages: ${figFile.pages.length}`);

  // Sort pages by sortkey to show them in Figma order
  const sortedPages = [...figFile.pages].sort((a, b) =>
    a.sortkey.localeCompare(b.sortkey)
  );

  sortedPages.forEach((page, idx) => {
    const rootCount = page.rootNodes.length;
    console.log(`  [${idx}] "${page.name}" — ${rootCount} root node(s)`);
  });

  // Check for images
  const images = iofigma.kiwi.extractImages(figFile.zip_files);
  if (images.size > 0) {
    console.log(`Images: ${images.size}`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.input) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = resolve(args.input);
  const lower = inputPath.toLowerCase();

  const isFigLike = lower.endsWith(".fig") || lower.endsWith(".deck");

  // Reject .fig/.deck-only flags for REST-format inputs
  if (!isFigLike) {
    if (args.info) {
      console.error("--info is only supported for .fig/.deck input.");
      process.exit(1);
    }
    if (args.pages) {
      console.error(
        "--pages is currently only supported for .fig/.deck input."
      );
      process.exit(1);
    }
  }

  // --info mode: print file info and exit (.fig only)
  if (args.info) {
    printInfo(inputPath, args.verbose);
    return;
  }

  // Strip known extensions to derive the default output name
  const stripExt = (name: string): string => {
    for (const ext of [".json.gz", ".json", ".fig", ".deck", ".zip"]) {
      if (name.toLowerCase().endsWith(ext)) {
        return name.slice(0, -ext.length);
      }
    }
    return name;
  };

  const outputPath = args.output
    ? resolve(args.output)
    : join(dirname(inputPath), stripExt(basename(inputPath)) + ".grida");

  if (args.verbose) {
    console.log(`Input:  ${inputPath}`);
    console.log(`Output: ${outputPath}`);
  }

  // Read and decompress input
  let data: Buffer = readFileSync(inputPath);
  if (lower.endsWith(".gz")) {
    if (args.verbose) {
      console.log(
        `Decompressing gzip (${(data.byteLength / 1024).toFixed(1)} KB)...`
      );
    }
    data = gunzipSync(data);
  }

  // Detect input type: object (JSON) or bytes (.fig / .zip)
  let input: Uint8Array | object;
  if (lower.endsWith(".json.gz") || lower.endsWith(".json")) {
    input = JSON.parse(data.toString("utf-8"));
  } else {
    input = new Uint8Array(data);
  }

  if (args.verbose) {
    const kind = input instanceof Uint8Array ? "binary" : "JSON";
    const size =
      input instanceof Uint8Array ? input.byteLength : data.byteLength;
    console.log(`Input: ${kind}, ${(size / 1024).toFixed(1)} KB`);
  }

  // Build options
  const options: Fig2GridaOptions = {
    prefer_fixed_text_sizing: args.prefer_fixed_text_sizing || undefined,
  };
  if (args.pages) {
    options.pages = args.pages;
    if (args.verbose) {
      console.log(`Page filter: [${args.pages.join(", ")}]`);
    }
  }

  // Convert
  const startTime = performance.now();
  const result = fig2grida(input, options);
  const elapsed = performance.now() - startTime;

  // Write output
  writeFileSync(outputPath, result.bytes);

  // Summary
  console.log(
    `Converted ${result.pageNames.length} page(s), ${result.nodeCount} nodes, ${result.imageCount} images`
  );

  if (args.verbose) {
    console.log(`Pages: ${result.pageNames.join(", ")}`);
    console.log(
      `Output size: ${(result.bytes.byteLength / 1024).toFixed(1)} KB`
    );
    console.log(`Time: ${elapsed.toFixed(0)}ms`);
  }

  console.log(`Output: ${outputPath}`);
}

main();
