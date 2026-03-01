#!/usr/bin/env node
/**
 * refig CLI — headless Figma renderer
 */

import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdtempSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { program } from "commander";
import {
  FigmaDocument,
  FigmaRenderer,
  collectExportsFromDocument,
  exportSettingToRenderOptions,
  figFileToRestLikeDocument,
  type ExportItem,
  type RefigRenderFormat,
} from "./lib";
import Typr from "@grida/fonts/typr";
import { iofigma } from "@grida/io-figma";

const FORMAT_SET = new Set<string>(["png", "jpeg", "webp", "pdf", "svg"]);

/** Conventional name for REST API response when using a project directory. */
const DOCUMENT_JSON = "document.json";
/** Subdirectory name for images when using a project directory. */
const IMAGES_SUBDIR = "images";
/** Subdirectory name for fonts when using a project directory. */
const FONTS_SUBDIR = "fonts";

const FONT_EXTENSIONS = new Set<string>([".ttf", ".otf"]);

function formatFromOutFile(outPath: string): string {
  const ext = path.extname(outPath).replace(/^\./, "").toLowerCase();
  if (ext === "jpg") return "jpeg";
  return FORMAT_SET.has(ext) ? ext : "png";
}

const EXT_BY_FORMAT: Record<string, string> = {
  png: "png",
  jpeg: "jpeg",
  jpg: "jpeg",
  webp: "webp",
  svg: "svg",
  pdf: "pdf",
};

/** Sanitize for use in filenames: replace : / \ with _. */
function sanitizeForFilename(s: string): string {
  return (
    String(s)
      .replace(/[:/\\]/g, "_")
      .replace(/\s+/g, "_") || "_"
  );
}

/**
 * Resolve CLI input to document path and optional images/fonts directories.
 * - If input is a directory: document at <input>/document.json; images at <input>/images/; fonts at <input>/fonts/ if present.
 * - If input is a file: document is that file; images/fonts only if --images/--fonts provided.
 */
function resolveInput(
  inputPath: string,
  explicitImagesDir: string | undefined,
  explicitFontsDir: string | undefined
): {
  documentPath: string;
  imagesDir: string | undefined;
  fontsDir: string | undefined;
  /** True when document is REST API JSON (file path ending in .json or directory with document.json). */
  isRestJson: boolean;
} {
  const resolved = path.resolve(inputPath);
  const stat = statSync(resolved);

  if (stat.isDirectory()) {
    const documentPath = path.join(resolved, DOCUMENT_JSON);
    if (!existsSync(documentPath)) {
      throw new Error(
        `Input directory must contain ${DOCUMENT_JSON}; not found: ${documentPath}`
      );
    }
    const imagesDir = path.join(resolved, IMAGES_SUBDIR);
    const useImagesDir =
      existsSync(imagesDir) && statSync(imagesDir).isDirectory()
        ? imagesDir
        : undefined;
    const fontsDir = path.join(resolved, FONTS_SUBDIR);
    const useFontsDir =
      existsSync(fontsDir) && statSync(fontsDir).isDirectory()
        ? fontsDir
        : undefined;
    return {
      documentPath,
      imagesDir: explicitImagesDir
        ? path.resolve(explicitImagesDir)
        : useImagesDir,
      fontsDir: explicitFontsDir ? path.resolve(explicitFontsDir) : useFontsDir,
      isRestJson: true,
    };
  }

  return {
    documentPath: resolved,
    imagesDir: explicitImagesDir ? path.resolve(explicitImagesDir) : undefined,
    fontsDir: explicitFontsDir ? path.resolve(explicitFontsDir) : undefined,
    isRestJson: resolved.toLowerCase().endsWith(".json"),
  };
}

/**
 * Read image files from a directory.
 * Uses filename (without extension) as ref for lookup.
 * @returns Record of ref -> image bytes
 */
function readImagesFromDir(dirPath: string): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const file of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, file);
    if (!statSync(fullPath).isFile()) continue;
    const ref = path.basename(file).replace(/\.[^.]+$/, "");
    if (!ref) continue;
    const buf = readFileSync(fullPath);
    out[ref] = new Uint8Array(buf);
  }
  return out;
}

/**
 * Recursively walk directory for .ttf and .otf files.
 */
function* walkFontFiles(dirPath: string): Generator<string> {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      yield* walkFontFiles(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (FONT_EXTENSIONS.has(ext)) {
        yield fullPath;
      }
    }
  }
}

/**
 * Read font files from a directory (recursively).
 * Parses each .ttf/.otf to get family from name table; groups multiple files per family.
 * Fallback: basename without extension if parse fails.
 * @returns Record of family -> bytes or bytes[]
 */
function readFontsFromDir(
  dirPath: string
): Record<string, Uint8Array | Uint8Array[]> {
  const out: Record<string, Uint8Array | Uint8Array[]> = {};
  for (const fullPath of walkFontFiles(dirPath)) {
    const file = path.basename(fullPath);
    const buf = readFileSync(fullPath);
    const bytes = new Uint8Array(buf);
    const basenameNoExt = file.replace(/\.[^.]+$/, "") || file;
    let family: string;
    try {
      const [font] = Typr.parse(bytes);
      family =
        (font?.name as { fontFamily?: string } | undefined)?.fontFamily ??
        basenameNoExt;
    } catch {
      family = basenameNoExt;
    }
    if (!family) continue;
    const existing = out[family];
    if (existing === undefined) {
      out[family] = bytes;
    } else {
      out[family] = Array.isArray(existing)
        ? [...existing, bytes]
        : [existing, bytes];
    }
  }
  return out;
}

function exportAllOutputBasename(
  nodeId: string,
  suffix: string,
  format: string
): string {
  const ext = EXT_BY_FORMAT[format] ?? "png";
  const safeId = sanitizeForFilename(nodeId);
  const safeSuffix = sanitizeForFilename(suffix);
  const name = safeSuffix ? `${safeId}_${safeSuffix}` : safeId;
  return `${name}.${ext}`;
}

async function runExportAll(
  documentPath: string,
  outDir: string,
  imagesDir?: string,
  fontsDir?: string,
  skipDefaultFonts?: boolean
): Promise<void> {
  const isFig = documentPath.toLowerCase().endsWith(".fig");
  let document: FigmaDocument;
  let items: ExportItem[];
  let rendererOptions: {
    images?: Record<string, Uint8Array>;
    fonts?: Record<string, Uint8Array | Uint8Array[]>;
    loadFigmaDefaultFonts?: boolean;
  } = {};

  if (isFig) {
    const bytes = new Uint8Array(readFileSync(documentPath));
    const figFile = iofigma.kiwi.parseFile(bytes);
    const restDoc = figFileToRestLikeDocument(figFile);
    items = collectExportsFromDocument(restDoc as Record<string, unknown>);
    document = new FigmaDocument(bytes);
    const imagesMap = iofigma.kiwi.extractImages(figFile.zip_files);
    const images: Record<string, Uint8Array> = {};
    imagesMap.forEach((imgBytes, ref) => {
      images[ref] = imgBytes;
    });
    if (Object.keys(images).length > 0) {
      rendererOptions = { images };
    }
  } else {
    const json = JSON.parse(readFileSync(documentPath, "utf8"));
    document = new FigmaDocument(json);
    items = collectExportsFromDocument(
      document.payload as Record<string, unknown>
    );
    if (imagesDir) {
      rendererOptions = {
        ...rendererOptions,
        images: readImagesFromDir(imagesDir),
      };
    }
  }
  if (fontsDir) {
    rendererOptions = {
      ...rendererOptions,
      fonts: readFontsFromDir(fontsDir),
    };
  }
  if (skipDefaultFonts || process.env.REFIG_SKIP_DEFAULT_FONTS === "1") {
    rendererOptions = { ...rendererOptions, loadFigmaDefaultFonts: false };
  }

  if (items.length === 0) {
    process.stdout.write("No nodes with export settings found.\n");
    return;
  }

  const renderer = new FigmaRenderer(document, rendererOptions);
  try {
    for (const { nodeId: nid, node, setting } of items) {
      const options = exportSettingToRenderOptions(node, setting);
      const result = await renderer.render(nid, options);
      const basename = exportAllOutputBasename(
        nid,
        setting.suffix,
        result.format
      );
      const filePath = path.join(outDir, basename);
      writeFileSync(filePath, Buffer.from(result.data));
      process.stdout.write(
        `wrote ${filePath} (${result.mimeType}, ${result.data.byteLength} bytes)\n`
      );
    }
    process.stdout.write(`Exported ${items.length} file(s) to ${outDir}\n`);
  } finally {
    renderer.dispose();
  }
}

async function runSingleNode(
  documentPath: string,
  nodeId: string,
  outPath: string,
  opts: {
    format?: string;
    width: number;
    height: number;
    scale: number;
    imagesDir?: string;
    fontsDir?: string;
    skipDefaultFonts?: boolean;
  }
): Promise<void> {
  const format = (opts.format ?? formatFromOutFile(outPath)).toLowerCase();
  if (!FORMAT_SET.has(format)) {
    throw new Error(`Unsupported --format "${format}"`);
  }

  const isJson = documentPath.toLowerCase().endsWith(".json");
  const document = isJson
    ? new FigmaDocument(JSON.parse(readFileSync(documentPath, "utf8")))
    : new FigmaDocument(new Uint8Array(readFileSync(documentPath)));

  const rendererOptions: {
    images?: Record<string, Uint8Array>;
    fonts?: Record<string, Uint8Array | Uint8Array[]>;
    loadFigmaDefaultFonts?: boolean;
  } = {};
  if (isJson && opts.imagesDir) {
    rendererOptions.images = readImagesFromDir(opts.imagesDir);
  }
  if (opts.fontsDir) {
    rendererOptions.fonts = readFontsFromDir(opts.fontsDir);
  }
  if (opts.skipDefaultFonts || process.env.REFIG_SKIP_DEFAULT_FONTS === "1") {
    rendererOptions.loadFigmaDefaultFonts = false;
  }
  const renderer = new FigmaRenderer(document, rendererOptions);
  try {
    const result = await renderer.render(nodeId, {
      format: format as RefigRenderFormat,
      width: opts.width,
      height: opts.height,
      scale: opts.scale,
    });
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.from(result.data));
    process.stdout.write(
      `wrote ${outPath} (${result.mimeType}, ${result.data.byteLength} bytes)\n`
    );
  } finally {
    renderer.dispose();
  }
}

async function main(): Promise<void> {
  program
    .name("refig")
    .description(
      "Headless Figma renderer — render .fig and REST API JSON to PNG/JPEG/WebP/PDF/SVG"
    )
    .argument(
      "<input>",
      "Path to .fig, JSON file (REST API response), or directory containing document.json (and optionally images/, fonts/)"
    )
    .option(
      "--out <path>",
      "Output file path (single node) or output directory (--export-all); when omitted, uses OS temp directory (valid with --export-all or with both --format and --node)"
    )
    .option(
      "--images <dir>",
      "Directory of image files for REST API document (optional; not used if <input> is a dir with images/)"
    )
    .option(
      "--fonts <dir>",
      "Directory of font files (TTF/OTF) for custom fonts (optional; not used if <input> is a dir with fonts/)"
    )
    .option(
      "--node <id>",
      "Figma node ID to render (required unless --export-all)"
    )
    .option(
      "--export-all",
      "Export every node that has exportSettings (REST JSON or .fig)"
    )
    .option(
      "--format <fmt>",
      "png | jpeg | webp | pdf | svg (single-node only; default: from --out extension)"
    )
    .option("--width <px>", "Viewport width (single-node only)", "1024")
    .option("--height <px>", "Viewport height (single-node only)", "1024")
    .option("--scale <n>", "Raster scale factor (single-node only)", "1")
    .option(
      "--skip-default-fonts",
      "Do not load Figma default fonts (same as REFIG_SKIP_DEFAULT_FONTS=1)"
    )
    .action(
      async (
        input: string,
        options: Record<string, string | boolean | undefined>
      ) => {
        const outPath = String(options.out ?? "").trim();
        const exportAll = options.exportAll === true;
        const nodeId = String(options.node ?? "").trim();
        const explicitImagesDir =
          typeof options.images === "string" ? options.images : undefined;
        const explicitFontsDir =
          typeof options.fonts === "string" ? options.fonts : undefined;

        const { documentPath, imagesDir, fontsDir } = resolveInput(
          input.trim(),
          explicitImagesDir,
          explicitFontsDir
        );

        if (exportAll) {
          if (nodeId) {
            program.error("--node must not be used with --export-all");
          }
          const outDir = outPath
            ? (() => {
                const resolved = path.resolve(outPath);
                if (existsSync(resolved)) {
                  const stat = statSync(resolved);
                  if (!stat.isDirectory()) {
                    program.error(
                      "--out must be a directory when using --export-all"
                    );
                  }
                } else {
                  mkdirSync(resolved, { recursive: true });
                }
                return resolved;
              })()
            : mkdtempSync(path.join(tmpdir(), "refig-export-"));
          await runExportAll(
            documentPath,
            outDir,
            imagesDir,
            fontsDir,
            options.skipDefaultFonts === true
          );
          return;
        }

        if (!nodeId) {
          program.error("--node is required (or use --export-all)");
        }

        const width = Number(options.width ?? 1024);
        const height = Number(options.height ?? 1024);
        const scale = Number(options.scale ?? 1);
        const formatOption =
          typeof options.format === "string" ? options.format : undefined;

        let singleOutPath: string;
        if (outPath) {
          singleOutPath = path.resolve(outPath);
        } else {
          if (!formatOption) {
            program.error(
              "When --out is omitted, both --node and --format are required"
            );
          }
          const format = formatOption.toLowerCase();
          if (!FORMAT_SET.has(format)) {
            program.error(`Unsupported --format "${format}"`);
          }
          const ext = EXT_BY_FORMAT[format] ?? "png";
          singleOutPath = path.join(
            tmpdir(),
            `refig-${sanitizeForFilename(nodeId)}.${ext}`
          );
        }

        await runSingleNode(documentPath, nodeId, singleOutPath, {
          format: formatOption,
          width,
          height,
          scale,
          imagesDir,
          fontsDir,
          skipDefaultFonts: options.skipDefaultFonts === true,
        });
      }
    );

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
