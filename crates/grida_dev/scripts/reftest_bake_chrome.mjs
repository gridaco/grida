#!/usr/bin/env node
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
 *    `@font-face` stylesheet via puppeteer's `page.addStyleTag`. Mirrors
 *    the generic-family bindings vdiff configures (Noto Sans, Noto
 *    Serif, Yellowtail, Sedgwick Ave Display, Noto Mono).
 *  - Sandbox is disabled (CI/headless friendly) and `omitBackground`
 *    is true so transparency round-trips into the diff harness.
 *
 * Usage
 * -----
 *   node reftest_bake_chrome.mjs [--filter <pattern>] [--concurrency N]
 *
 * Defaults
 *   suite       = fixtures/local/resvg-test-suite
 *   out         = <suite>/chrome-baseline
 *   concurrency = 4
 *
 * Re-run cost: ~5–15 min for the full 1679 fixtures depending on
 * machine. The output is deterministic for a given Chrome version, so
 * pin it: see CHROME_VERSION.txt written alongside the baseline.
 */

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";

let puppeteer;
try {
  puppeteer = (await import("puppeteer")).default;
} catch {
  console.error(
    "puppeteer not installed. Run: cd crates/grida_dev/scripts && npm install puppeteer"
  );
  exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../..");

// ---- argv -----------------------------------------------------------
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

const SUITE = resolve(
  arg("--suite", join(REPO_ROOT, "fixtures/local/resvg-test-suite"))
);
const OUT = resolve(arg("--out", join(SUITE, "chrome-baseline")));
const FILTER = arg("--filter", null); // substring match against rel path
// File of suite-relative paths (one per line). Wins over --filter when set.
// Used by `reftest bake --retry-failed` to batch many fixtures into one run.
const PATHS_FROM = arg("--paths-from", null);
const CONCURRENCY = Number.parseInt(arg("--concurrency", "4"), 10);
const FORCE = argv.includes("--force"); // re-render even if PNG exists

if (!existsSync(SUITE)) {
  console.error(`suite not found: ${SUITE}`);
  exit(1);
}

console.log(`suite       : ${SUITE}`);
console.log(`out         : ${OUT}`);
console.log(`concurrency : ${CONCURRENCY}`);
if (FILTER) console.log(`filter      : ${FILTER}`);

await mkdir(OUT, { recursive: true });

// ---- fixture discovery ---------------------------------------------
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (entry.isFile() && entry.name.endsWith(".svg")) out.push(p);
  }
  return out;
}

const TESTS_DIR = join(SUITE, "tests");
const allSvgs = (await walk(TESTS_DIR)).sort();
let filtered;
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

// ---- font CSS (matches vdiff/htmlcss-renderer wiring) ---------------
async function buildFontCss() {
  const fontsDir = join(SUITE, "fonts");
  if (!existsSync(fontsDir)) return "";
  const faces = [];
  for (const entry of await readdir(fontsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith(".ttf") && !lower.endsWith(".otf")) continue;
    const path = join(fontsDir, entry.name);
    const bytes = await readFile(path);
    const b64 = bytes.toString("base64");
    // Family name = filename without extension; Chrome's @font-face
    // is happy with a quoted family.
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

// ---- expected.png dim sniff ----------------------------------------
// Reads the IHDR chunk of the suite's sibling `<name>.png` to get
// the canonical render size for this fixture. Cheaper than spinning
// up a real PNG decoder and avoids pulling in another dep.
function expectedDimsFor(svgPath) {
  const png = svgPath.replace(/\.svg$/, ".png");
  if (!existsSync(png)) return { renderW: 500, renderH: 500 };
  const buf = readFileSync(png).subarray(0, 24);
  // PNG signature is 8 bytes; IHDR follows starting at offset 8 with
  // 4-byte length, 4-byte "IHDR", then 4-byte width, 4-byte height
  // big-endian.
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452 /* "IHDR" */) {
    return { renderW: 500, renderH: 500 };
  }
  const renderW = Math.max(1, buf.readUInt32BE(16));
  const renderH = Math.max(1, buf.readUInt32BE(20));
  return { renderW, renderH };
}

// ---- launch browser -------------------------------------------------
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
console.log(`chrome      : ${await browser.version()}`);
await writeFile(
  join(OUT, "CHROME_VERSION.txt"),
  `${await browser.version()}\n`
);

// ---- render one fixture --------------------------------------------
async function renderOne(svgPath) {
  const rel = relative(TESTS_DIR, svgPath);
  const outPng = join(OUT, rel.replace(/\.svg$/, ".png"));
  if (!FORCE && existsSync(outPng)) return { rel, status: "skip" };

  await mkdir(dirname(outPng), { recursive: true });

  const page = await browser.newPage();
  try {
    await page.goto("file://" + svgPath, { waitUntil: "domcontentloaded" });
    // Standalone SVG documents have no <head>, so puppeteer's
    // `addStyleTag` fails. Inject a <style> into the SVG root
    // instead. @font-face with data: URIs is synchronous, so we
    // don't need to wait for an async font load.
    if (fontCss) {
      await page.evaluate((css) => {
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
    // Falling back to SVG intrinsics or a default would force a
    // resize on the diff side and reintroduce the dimension
    // mismatch this script exists to avoid.
    let { renderW, renderH } = expectedDimsFor(svgPath);

    await page.setViewport({ width: renderW, height: renderH });
    // Wait briefly for any web-font/css to settle.
    await new Promise((r) => setTimeout(r, 30));

    await page.screenshot({
      path: outPng,
      clip: { x: 0, y: 0, width: renderW, height: renderH },
      omitBackground: true,
    });
    return { rel, status: "ok" };
  } catch (e) {
    return { rel, status: "err", error: String(e?.message ?? e) };
  } finally {
    await page.close().catch(() => {});
  }
}

// ---- pool runner ----------------------------------------------------
let done = 0;
let ok = 0;
let skip = 0;
let err = 0;
const errors = [];
let nextIdx = 0;

async function worker() {
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
      process.stdout.write(
        `\r${done}/${filtered.length} (${pct}%) ok=${ok} skip=${skip} err=${err}    `
      );
    }
  }
}

const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, worker);
await Promise.all(workers);
process.stdout.write("\n");

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
