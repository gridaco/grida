/**
 * refig CLI — headless Figma renderer
 * Shebang is added by the build (tsup banner).
 */

import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { program } from "commander";
import {
  FigmaDocument,
  FigmaRenderer,
  collectExportsFromDocument,
  exportSettingToRenderOptions,
  type RefigRenderFormat,
} from "./lib";

const FORMAT_SET = new Set<string>(["png", "jpeg", "webp", "pdf", "svg"]);

function formatFromOutFile(outPath: string): string {
  const ext = path.extname(outPath).replace(/^\./, "").toLowerCase();
  if (ext === "jpg") return "jpeg";
  return FORMAT_SET.has(ext) ? ext : "png";
}

const EXT_BY_FORMAT: Record<string, string> = {
  png: "png",
  jpeg: "jpeg",
  jpg: "jpeg",
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

async function runExportAll(inputPath: string, outDir: string): Promise<void> {
  const json = JSON.parse(readFileSync(inputPath, "utf8"));
  const document = new FigmaDocument(json);
  const items = collectExportsFromDocument(
    document.payload as Record<string, unknown>
  );
  if (items.length === 0) {
    process.stdout.write("No nodes with export settings found.\n");
    return;
  }

  const renderer = new FigmaRenderer(document);
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
  inputPath: string,
  nodeId: string,
  outPath: string,
  opts: { format?: string; width: number; height: number; scale: number }
): Promise<void> {
  const format = (opts.format ?? formatFromOutFile(outPath)).toLowerCase();
  if (!FORMAT_SET.has(format)) {
    throw new Error(`Unsupported --format "${format}"`);
  }

  const isJson = inputPath.toLowerCase().endsWith(".json");
  const document = isJson
    ? new FigmaDocument(JSON.parse(readFileSync(inputPath, "utf8")))
    : new FigmaDocument(new Uint8Array(readFileSync(inputPath)));

  const renderer = new FigmaRenderer(document);
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
    .argument("<input>", "Path to .fig file or JSON file (REST API response)")
    .requiredOption(
      "--out <path>",
      "Output file path (single node) or output directory (--export-all)"
    )
    .option(
      "--node <id>",
      "Figma node ID to render (required unless --export-all)"
    )
    .option(
      "--export-all",
      "Export every node that has exportSettings (REST JSON only)"
    )
    .option(
      "--format <fmt>",
      "png | jpeg | webp | pdf | svg (single-node only; default: from --out extension)"
    )
    .option("--width <px>", "Viewport width (single-node only)", "1024")
    .option("--height <px>", "Viewport height (single-node only)", "1024")
    .option("--scale <n>", "Raster scale factor (single-node only)", "1")
    .action(
      async (
        input: string,
        options: Record<string, string | boolean | undefined>
      ) => {
        const inputPath = path.resolve(input);
        const outPath = String(options.out ?? "").trim();
        const exportAll = options.exportAll === true;
        const nodeId = String(options.node ?? "").trim();

        if (!outPath) {
          program.error("--out is required");
        }

        if (exportAll) {
          if (nodeId) {
            program.error("--node must not be used with --export-all");
          }
          const isJson = inputPath.toLowerCase().endsWith(".json");
          if (!isJson) {
            program.error(
              "--export-all is only supported for REST API JSON input"
            );
          }
          const outDir = path.resolve(outPath);
          if (existsSync(outDir)) {
            const stat = statSync(outDir);
            if (!stat.isDirectory()) {
              program.error(
                "--out must be a directory when using --export-all"
              );
            }
          } else {
            mkdirSync(outDir, { recursive: true });
          }
          await runExportAll(inputPath, outDir);
          return;
        }

        if (!nodeId) {
          program.error("--node is required (or use --export-all)");
        }

        const width = Number(options.width ?? 1024);
        const height = Number(options.height ?? 1024);
        const scale = Number(options.scale ?? 1);
        await runSingleNode(inputPath, nodeId, path.resolve(outPath), {
          format:
            typeof options.format === "string" ? options.format : undefined,
          width,
          height,
          scale,
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
