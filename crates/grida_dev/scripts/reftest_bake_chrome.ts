#!/usr/bin/env -S pnpm --filter @grida/reftest exec tsx
/**
 * Bake Chrome PNGs for every fixture in `resvg-test-suite/tests/`.
 *
 * The output mirrors the input layout under `<suite>/chrome-baseline/`,
 * which is exactly where the reftest harness looks (driven by
 * `[test.oracles].chrome_baseline = "chrome-baseline"` in
 * `reftest.toml`).
 *
 * Why this exists
 * ---------------
 * `expected.png` shipped by resvg-test-suite is the suite author's
 * read of the spec. For 60+ fixtures Chrome diverges from that
 * expected — and Chrome is the engine our renderer ultimately has
 * to be perceptually compatible with. Pre-baking Chrome PNGs lets the
 * harness compare each render against *both* oracles and accept the
 * better match, so we don't lose points for being browser-correct.
 *
 * Determinism
 * -----------
 * Output depends on the host's installed Chrome and font set, so:
 *  - We use the suite's bundled `fonts/` directory by injecting an
 *    `@font-face` stylesheet via `page.evaluate`. Mirrors the
 *    generic-family bindings vdiff configures (Noto Sans, Noto Serif,
 *    Yellowtail, Sedgwick Ave Display, Noto Mono).
 *  - Sandbox is disabled (CI/headless friendly) and `omitBackground`
 *    is true so transparency round-trips into the diff harness.
 *
 * Usage
 * -----
 *   pnpm --filter @grida/reftest exec tsx \
 *     crates/grida_dev/scripts/reftest_bake_chrome.ts \
 *     [--filter <pattern>] [--concurrency N]
 *
 * Defaults
 *   suite       = fixtures/local/resvg-test-suite
 *   out         = <suite>/chrome-baseline
 *   concurrency = 4
 *
 * Re-run cost: ~5-15 min for the full 1679 fixtures depending on
 * machine. The output is deterministic for a given Chrome version, so
 * pin it: see CHROME_VERSION.txt written alongside the baseline.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { argv, exit, stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../..");

function arg(name: string, fallback: string | null): string | null {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

type RenderResult =
  | { rel: string; status: "ok" | "skip" }
  | { rel: string; status: "err"; error: string };

async function main(): Promise<void> {
  const SUITE = resolve(
    arg("--suite", join(REPO_ROOT, "fixtures/local/resvg-test-suite"))!
  );
  const OUT = resolve(arg("--out", join(SUITE, "chrome-baseline"))!);
  const FILTER = arg("--filter", null);
  // File of suite-relative paths (one per line). Wins over --filter when set.
  // Used by `reftest bake --retry-failed` to batch many fixtures into one run.
  const PATHS_FROM = arg("--paths-from", null);
  const CONCURRENCY = Number.parseInt(arg("--concurrency", "4")!, 10);
  const FORCE = argv.includes("--force");

  if (!existsSync(SUITE)) {
    console.error(`suite not found: ${SUITE}`);
    exit(1);
  }

  console.log(`suite       : ${SUITE}`);
  console.log(`out         : ${OUT}`);
  console.log(`concurrency : ${CONCURRENCY}`);
  if (FILTER) console.log(`filter      : ${FILTER}`);

  await mkdir(OUT, { recursive: true });

  async function walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(p)));
      else if (entry.isFile() && entry.name.endsWith(".svg")) out.push(p);
    }
    return out;
  }

  const TESTS_DIR = join(SUITE, "tests");
  const allSvgs = (await walk(TESTS_DIR)).sort();
  let filtered: string[];
  if (PATHS_FROM) {
    const wanted = new Set(
      readFileSync(PATHS_FROM, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    );
    filtered = allSvgs.filter((p) => wanted.has(relative(TESTS_DIR, p)));
  } else if (FILTER) {
    filtered = allSvgs.filter((p) => relative(TESTS_DIR, p).includes(FILTER));
  } else {
    filtered = allSvgs;
  }

  console.log(`fixtures    : ${filtered.length}`);

  // ---- font CSS (matches vdiff/htmlcss-renderer wiring) -------------
  async function buildFontCss(): Promise<string> {
    const fontsDir = join(SUITE, "fonts");
    if (!existsSync(fontsDir)) return "";
    const faces: string[] = [];
    for (const entry of await readdir(fontsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (!lower.endsWith(".ttf") && !lower.endsWith(".otf")) continue;
      const path = join(fontsDir, entry.name);
      const bytes = await readFile(path);
      const b64 = bytes.toString("base64");
      const family = entry.name.replace(/\.(ttf|otf)$/i, "");
      const fmt = lower.endsWith(".otf") ? "opentype" : "truetype";
      faces.push(
        `@font-face{font-family:"${family}";src:url(data:font/${fmt};base64,${b64}) format("${fmt}");}`
      );
    }
    // Generic-family bindings — same as vdiff.
    faces.push(
      `body,svg{font-family:"Noto Sans",sans-serif;}`,
      `[font-family*="serif" i]{font-family:"Noto Serif",serif;}`,
      `[font-family*="sans-serif" i]{font-family:"Noto Sans",sans-serif;}`,
      `[font-family*="monospace" i]{font-family:"Noto Mono",monospace;}`,
      `[font-family*="cursive" i]{font-family:"Yellowtail",cursive;}`,
      `[font-family*="fantasy" i]{font-family:"Sedgwick Ave Display",fantasy;}`
    );
    return faces.join("\n");
  }

  const fontCss = await buildFontCss();

  // ---- expected.png dim sniff --------------------------------------
  // Reads the IHDR chunk of the suite's sibling `<name>.png` to get
  // the canonical render size for this fixture. Cheaper than spinning
  // up a real PNG decoder and avoids pulling in another dep.
  function expectedDimsFor(svgPath: string): {
    renderW: number;
    renderH: number;
  } {
    const png = svgPath.replace(/\.svg$/, ".png");
    if (!existsSync(png)) return { renderW: 500, renderH: 500 };
    const buf = readFileSync(png).subarray(0, 24);
    if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452 /* "IHDR" */) {
      return { renderW: 500, renderH: 500 };
    }
    const renderW = Math.max(1, buf.readUInt32BE(16));
    const renderH = Math.max(1, buf.readUInt32BE(20));
    return { renderW, renderH };
  }

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  console.log(`chrome      : ${browser.version()}`);
  await writeFile(join(OUT, "CHROME_VERSION.txt"), `${browser.version()}\n`);

  const context = await browser.newContext();

  async function renderOne(svgPath: string): Promise<RenderResult> {
    const rel = relative(TESTS_DIR, svgPath);
    const outPng = join(OUT, rel.replace(/\.svg$/, ".png"));
    if (!FORCE && existsSync(outPng)) return { rel, status: "skip" };

    await mkdir(dirname(outPng), { recursive: true });

    const page = await context.newPage();
    try {
      await page.goto("file://" + svgPath, { waitUntil: "domcontentloaded" });
      // Standalone SVG documents have no <head>, so `addStyleTag` fails.
      // Inject a <style> into the SVG root instead. @font-face with
      // data: URIs is synchronous, so we don't need to wait for an
      // async font load.
      if (fontCss) {
        await page.evaluate((css: string) => {
          const root = document.documentElement;
          if (!root) return;
          const SVG_NS = "http://www.w3.org/2000/svg";
          const ns =
            root.namespaceURI === SVG_NS
              ? SVG_NS
              : "http://www.w3.org/1999/xhtml";
          const style = document.createElementNS(ns, "style");
          style.textContent = css;
          root.insertBefore(style, root.firstChild);
        }, fontCss);
      }

      // Always render at the suite's canonical dimensions — i.e. the
      // size of the sibling `expected.png`. That's the size the
      // reftest runner targets for our htmlcss render too, so chrome
      // and current both end up on the same grid for direct compare.
      const { renderW, renderH } = expectedDimsFor(svgPath);

      await page.setViewportSize({ width: renderW, height: renderH });
      // Wait briefly for any web-font/css to settle.
      await new Promise((r) => setTimeout(r, 30));

      await page.screenshot({
        path: outPng,
        clip: { x: 0, y: 0, width: renderW, height: renderH },
        omitBackground: true,
      });
      return { rel, status: "ok" };
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      return { rel, status: "err", error };
    } finally {
      await page.close().catch(() => {});
    }
  }

  let done = 0;
  let ok = 0;
  let skip = 0;
  let err = 0;
  const errors: Array<Extract<RenderResult, { status: "err" }>> = [];
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIdx++;
      if (i >= filtered.length) return;
      const r = await renderOne(filtered[i]);
      done++;
      if (r.status === "ok") ok++;
      else if (r.status === "skip") skip++;
      else {
        err++;
        errors.push(r);
      }
      if (done % 25 === 0 || done === filtered.length) {
        const pct = ((done / filtered.length) * 100).toFixed(1);
        stdout.write(
          `\r${done}/${filtered.length} (${pct}%) ok=${ok} skip=${skip} err=${err}    `
        );
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, worker);
  await Promise.all(workers);
  stdout.write("\n");

  await context.close();
  await browser.close();

  if (errors.length) {
    const errLog = join(OUT, "BAKE_ERRORS.log");
    await writeFile(
      errLog,
      errors.map((e) => `${e.rel}\t${e.error}`).join("\n") + "\n"
    );
    console.log(`errors logged: ${errLog}`);
  }

  console.log(`done. ok=${ok} skip=${skip} err=${err}`);
}

main().catch((e: unknown) => {
  console.error(e);
  exit(1);
});
