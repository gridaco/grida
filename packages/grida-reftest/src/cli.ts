#!/usr/bin/env node
import * as path from "node:path";
import * as fs from "node:fs";
import { Command, Option } from "commander";
import { compareFiles } from "./compare.js";
import { loadSuiteConfig } from "./config.js";
import { runSuite } from "./runner.js";
import { sanitizeDirName } from "./fs-utils.js";
import { serializeReport, summarizeReport } from "./report.js";
import type { BgColor, ScoringMask, SuiteConfig } from "./types.js";

const program = new Command();

program
  .name("reftest")
  .description(
    "General-purpose image-based visual reference-test tool. Compares a directory of actual PNGs against expected PNGs, scores the difference, and writes a JSON report."
  )
  .version("0.0.0");

program
  .command("compare <actual> <expected>")
  .description("Compare two PNG files and print the similarity score")
  .option(
    "-t, --threshold <number>",
    "pixelmatch YIQ threshold per pixel",
    "0.1"
  )
  .option(
    "--aa",
    "ignore anti-aliased edges (pixelmatch includeAA=false)",
    false
  )
  .option(
    "--bg <color>",
    "alpha composite background before diff: white|black",
    "white"
  )
  .option("--mask <mode>", "scoring denominator: alpha|none", "alpha")
  .option("--diff-out <path>", "if set, write a diff PNG to this path")
  .option("--json", "emit machine-readable JSON to stdout", false)
  .action(async (actual: string, expected: string, opts: CompareCmdOpts) => {
    const threshold = parseNumber(opts.threshold, "--threshold", 0, 1);
    const bg = parseBg(opts.bg);
    const mask = parseMask(opts.mask);

    const result = await compareFiles(actual, expected, {
      threshold,
      aa: Boolean(opts.aa),
      bg,
      mask,
      diffOutputPath: opts.diffOut,
    });

    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            similarity: result.similarity,
            diff_percentage: result.diffPercentage,
            diff_pixels: result.diffPixels,
            total_pixels: result.totalPixels,
            width: result.width,
            height: result.height,
            error: result.error,
          },
          null,
          2
        ) + "\n"
      );
    } else if (result.error) {
      console.error(`error: ${result.error}`);
    } else {
      console.log(
        `similarity=${result.similarity.toFixed(4)} diff=${result.diffPercentage.toFixed(2)}% pixels=${result.diffPixels}/${result.totalPixels}`
      );
    }

    // compare subcommand exits non-zero when similarity is below (1 - threshold),
    // or on error. The suite runner is a scoring tool and always exits 0.
    if (result.error) process.exit(1);
    const floor = 1 - threshold;
    process.exit(result.similarity >= floor ? 0 : 1);
  });

program
  .option(
    "--suite-dir <dir>",
    "directory containing reftest.toml / reftest.json"
  )
  .option("--actual-dir <dir>", "directory of actual (rendered) PNGs")
  .option("--expected-dir <dir>", "directory of expected (oracle) PNGs")
  .option("--pattern <glob>", "input glob pattern relative to --actual-dir")
  .option("--output-dir <dir>", "bucket + report destination")
  .option("--filter <pattern>", "subset of test names (e.g. '1_5*')")
  .addOption(
    new Option("--threshold <number>", "pixelmatch YIQ threshold per pixel")
  )
  .option("--aa", "ignore anti-aliased edges")
  .option("--bg <color>", "composite background: white|black")
  .option("--mask <mode>", "scoring denominator: alpha|none")
  .option("--overwrite", "clear output dir on start")
  .option("--no-overwrite", "do not clear output dir")
  .option("--quiet", "reduce log verbosity")
  .option("--verbose", "increase log verbosity")
  .option("--json", "emit report to stdout (suppresses progress)", false)
  .action(async (opts: SuiteCmdOpts) => {
    if (!opts.suiteDir && !opts.actualDir) {
      program.help();
      return;
    }

    // Load config first; CLI flags override.
    let config: SuiteConfig | null = null;
    if (opts.suiteDir) {
      try {
        config = loadSuiteConfig(path.resolve(opts.suiteDir));
      } catch (e) {
        console.error(`failed to load suite config: ${(e as Error).message}`);
        process.exit(1);
      }
    }

    // Resolve directories.
    const suiteDir = opts.suiteDir ? path.resolve(opts.suiteDir) : undefined;
    let actualDir: string | undefined;
    let expectedDir: string | undefined;
    let pattern = opts.pattern;

    if (opts.actualDir) {
      actualDir = path.resolve(opts.actualDir);
    } else if (suiteDir && config?.inputs) {
      // Config `inputs` is a glob under suite-dir. We split it into a
      // base dir + pattern by taking everything up to the first wildcard
      // as the base and the rest as the glob pattern.
      const { base, rest } = splitGlob(config.inputs);
      actualDir = path.resolve(suiteDir, base);
      if (!pattern) pattern = rest || "**/*.png";
    }

    if (opts.expectedDir) {
      expectedDir = path.resolve(opts.expectedDir);
    } else if (suiteDir && config?.expects) {
      expectedDir = path.resolve(suiteDir, config.expects);
    }

    if (!actualDir || !expectedDir) {
      console.error(
        "missing --actual-dir / --expected-dir (and config did not supply inputs/expects)"
      );
      process.exit(2);
    }

    // Name resolution: CLI can't set name; suite config or suite-dir basename.
    const name =
      config?.name ??
      (suiteDir ? path.basename(suiteDir) : path.basename(actualDir)) ??
      "reftest";

    // Output dir: --output-dir wins; otherwise target/reftests/<sanitized-name>.
    const outputDir = opts.outputDir
      ? path.resolve(opts.outputDir)
      : path.resolve("target/reftests", sanitizeDirName(name));

    // Effective diff settings. CLI > config > defaults.
    const threshold =
      opts.threshold !== undefined
        ? parseNumber(opts.threshold, "--threshold", 0, 1)
        : (config?.diff?.threshold ?? 0.1);
    const aa =
      opts.aa !== undefined ? Boolean(opts.aa) : (config?.diff?.aa ?? false);
    const bg = opts.bg ? parseBg(opts.bg) : (config?.bg ?? "white");
    const mask = opts.mask
      ? parseMask(opts.mask)
      : (config?.scoring?.mask ?? "alpha");
    const overwrite =
      opts.overwrite !== undefined ? Boolean(opts.overwrite) : true;

    if (!fs.existsSync(actualDir)) {
      console.error(`actual-dir does not exist: ${actualDir}`);
      process.exit(1);
    }
    if (!fs.existsSync(expectedDir)) {
      console.error(`expected-dir does not exist: ${expectedDir}`);
      process.exit(1);
    }

    const quiet = Boolean(opts.quiet) || Boolean(opts.json);

    const report = await runSuite({
      name,
      suiteDir: suiteDir ?? actualDir,
      actualDir,
      expectedDir,
      outputDir,
      pattern,
      filter: opts.filter,
      threshold,
      aa,
      bg,
      mask,
      overwrite,
      onProgress: quiet
        ? undefined
        : (e) => {
            const pct = (e.similarity * 100).toFixed(2);
            const label = e.error
              ? `err (${e.error})`
              : `${pct}% → ${e.bucket}`;
            process.stderr.write(
              `[${e.index + 1}/${e.total}] ${e.name}: ${label}\n`
            );
          },
    });

    const reportPath = path.join(outputDir, "report.json");
    if (opts.json) {
      process.stdout.write(
        JSON.stringify(serializeReport(report), null, 2) + "\n"
      );
    } else {
      console.log("");
      console.log(summarizeReport(report, reportPath));
    }

    // Reported, not asserted. Always exit 0 on completion.
    process.exit(0);
  });

interface CompareCmdOpts {
  threshold: string;
  aa: boolean;
  bg: string;
  mask: string;
  diffOut?: string;
  json: boolean;
}

interface SuiteCmdOpts {
  suiteDir?: string;
  actualDir?: string;
  expectedDir?: string;
  pattern?: string;
  outputDir?: string;
  filter?: string;
  threshold?: string;
  aa?: boolean;
  bg?: string;
  mask?: string;
  overwrite?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
}

function parseBg(v: string): BgColor {
  if (v === "white" || v === "black") return v;
  console.error(`invalid --bg: ${v} (expected white|black)`);
  process.exit(2);
}

function parseMask(v: string): ScoringMask {
  if (v === "alpha" || v === "none") return v;
  console.error(`invalid --mask: ${v} (expected alpha|none)`);
  process.exit(2);
}

function parseNumber(
  v: string,
  label: string,
  min: number,
  max: number
): number {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    console.error(`invalid ${label}: ${v} (expected ${min}..${max})`);
    process.exit(2);
  }
  return n;
}

/**
 * Split a glob like `renders/**\/*.png` into `{ base: "renders", rest: "**\/*.png" }`.
 * Matches `config.resolve_inputs` + `config.input_pattern` from Rust, where
 * the inputs string is both a directory anchor and a glob.
 */
function splitGlob(pattern: string): { base: string; rest: string } {
  const segments = pattern.split("/");
  const baseParts: string[] = [];
  let i = 0;
  for (; i < segments.length; i++) {
    const s = segments[i]!;
    if (/[*?[\]{}]/.test(s)) break;
    baseParts.push(s);
  }
  return {
    base: baseParts.join("/") || ".",
    rest: segments.slice(i).join("/"),
  };
}

await program.parseAsync(process.argv);
