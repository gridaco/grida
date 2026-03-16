#!/usr/bin/env node
/**
 * @fileoverview fig2grida — CLI entrypoint
 *
 * Converts a .fig file to a .grida archive.
 *
 * Usage:
 *   fig2grida <input.fig> [output.grida]
 *   fig2grida <input.fig> --out <output.grida>
 *   fig2grida <input.fig> --pages 0,2,3
 *
 * Options:
 *   --out, -o       Output path (default: input with .grida extension)
 *   --pages, -p     Comma-separated page indices to include (default: all)
 *   --info          Print file info (pages, node counts) without converting
 *   --verbose       Print progress details
 *   --help          Show help
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, basename, dirname, join } from "path";
import { fig2grida, type Fig2GridaOptions } from "./fig2grida-core";
import { iofigma } from "./lib";

function printHelp(): void {
  console.log(`
fig2grida — Convert .fig files to .grida archives

Usage:
  fig2grida <input.fig> [output.grida]
  fig2grida <input.fig> --out <output.grida>
  fig2grida <input.fig> --pages 0,2,3

Options:
  --out, -o       Output path (default: input with .grida extension)
  --pages, -p     Comma-separated page indices to include (default: all)
  --info          Print file info (pages, node counts) without converting
  --verbose       Print progress details
  --help          Show help

Examples:
  fig2grida design.fig
  fig2grida design.fig output.grida
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
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    info: false,
    verbose: false,
    help: false,
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

  // --info mode: print file info and exit
  if (args.info) {
    printInfo(inputPath, args.verbose);
    return;
  }

  // Determine output path
  const outputPath = args.output
    ? resolve(args.output)
    : join(dirname(inputPath), basename(inputPath, ".fig") + ".grida");

  if (args.verbose) {
    console.log(`Input:  ${inputPath}`);
    console.log(`Output: ${outputPath}`);
  }

  // Read input
  const data = readFileSync(inputPath);
  const input = new Uint8Array(data);

  if (args.verbose) {
    console.log(`File size: ${(input.byteLength / 1024).toFixed(1)} KB`);
    console.log("Parsing .fig file...");
  }

  // Build options
  const options: Fig2GridaOptions = {};
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
