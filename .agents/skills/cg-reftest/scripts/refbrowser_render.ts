#!/usr/bin/env -S pnpm dlx tsx
/**
 * refbrowser_render.ts — headless Chromium oracle for HTML/CSS reftests.
 *
 * Renders each fixture in a suite through Playwright's Chromium and
 * writes a PNG per fixture to `--out-dir`. The output is the reference
 * oracle for cg's htmlcss renderer — Chromium is the ground truth.
 *
 *  ┌────────────────┐   ┌─────────────────────┐   ┌──────────────────┐
 *  │ <suite>.json   │ → │ Playwright Chromium │ → │ expected/<n>.png │
 *  │ + helper CSS   │   │ (full-page screen)  │   │                  │
 *  └────────────────┘   └─────────────────────┘   └──────────────────┘
 *
 * Pair with `cargo run -p cg --example golden_htmlcss --suite` on the
 * actual side, then diff via `@grida/reftest`.
 *
 * ## Usage
 *
 * ```sh
 * pnpm --filter @grida/reftest exec tsx \
 *   .agents/skills/cg-reftest/scripts/refbrowser_render.ts \
 *   --suite   fixtures/test-html/suites/L0.exact.json \
 *   --out-dir target/refbrowser/L0.exact/expected
 * ```
 *
 * Ad-hoc single-file render (no suite, defaults only):
 *
 * ```sh
 * pnpm --filter @grida/reftest exec tsx \
 *   .agents/skills/cg-reftest/scripts/refbrowser_render.ts \
 *   --fixture fixtures/test-html/L0/paint-background-solid.html \
 *   --out-dir /tmp/refbrowser-verify
 * ```
 *
 * ## Dependencies
 *
 * - Node 20+.
 * - `@playwright/test` (devDependency of `@grida/reftest`).
 * - Chromium binary (one-time):
 *   `pnpm --filter @grida/reftest exec playwright install chromium`
 *
 * ## Suite JSON shape
 *
 * ```json
 * {
 *   "name": "L0.exact",
 *   "gate":     { "threshold": 0, "aa": false, "floor": 1.0 },
 *   "defaults": {
 *     "viewport":  { "width": 600, "height": 800 },
 *     "wait_for":  ["fonts", "networkidle"],
 *     "extra_css": ["../_reftest/hide-text.css"],
 *     "full_page": true
 *   },
 *   "fixtures": [
 *     { "path": "../L0/box-dimensions.html",
 *       "viewport": { "width": 600, "height": 522 } }
 *   ]
 * }
 * ```
 *
 * Per-fixture entries inherit and override `defaults` field-by-field.
 * All paths (`fixtures[].path`, `extra_css[]`) resolve **relative to
 * the suite file**. `gate` is consumed by the diff step, not here.
 *
 * ## Caveats
 *
 * - `document.fonts.ready` waits for `<link>`/inline `@font-face` loads;
 *   system-font fallbacks still differ from Skia. Inject
 *   `_reftest/hide-text.css` for non-text fixtures.
 * - Each fixture is rendered in a fresh incognito context.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
// `@playwright/test` re-exports `chromium` from `playwright-core` and is
// the package actually installed in this repo (via `editor`). Using it
// here avoids depending on a separate `playwright` package.
import { chromium, type Browser, type BrowserContext } from "@playwright/test";

type FixtureConfig = {
  viewport?: { width?: number; height?: number };
  wait_for?: Array<"fonts" | "networkidle">;
  extra_css?: string[];
  full_page?: boolean;
};

type FixtureEntry = FixtureConfig & { path: string };

type SuiteFile = {
  name?: string;
  description?: string;
  gate?: unknown; // consumed by the diff step, not here
  defaults?: FixtureConfig;
  fixtures: FixtureEntry[];
};

type ResolvedConfig = {
  viewport: { width: number; height: number };
  wait_for: Array<"fonts" | "networkidle">;
  extra_css: string[];
  full_page: boolean;
};

const DEFAULTS: ResolvedConfig = {
  viewport: { width: 600, height: 800 },
  wait_for: ["fonts", "networkidle"],
  extra_css: [],
  full_page: true,
};

function mergeConfig(
  defaults: FixtureConfig | undefined,
  entry: FixtureConfig
): ResolvedConfig {
  const pick = <K extends keyof ResolvedConfig>(key: K): ResolvedConfig[K] => {
    const a = entry[key] as ResolvedConfig[K] | undefined;
    const b = defaults?.[key] as ResolvedConfig[K] | undefined;
    return (a ?? b ?? DEFAULTS[key]) as ResolvedConfig[K];
  };
  const vp = entry.viewport ?? defaults?.viewport ?? DEFAULTS.viewport;
  return {
    viewport: {
      width: vp?.width ?? DEFAULTS.viewport.width,
      height: vp?.height ?? DEFAULTS.viewport.height,
    },
    wait_for: pick("wait_for"),
    extra_css: pick("extra_css"),
    full_page: pick("full_page"),
  };
}

type Resolved = {
  htmlPath: string;
  stem: string;
  config: ResolvedConfig;
};

async function resolveSuite(suitePath: string): Promise<Resolved[]> {
  const raw = await fs.readFile(suitePath, "utf8");
  const suite = JSON.parse(raw) as SuiteFile;
  if (!Array.isArray(suite.fixtures)) {
    throw new Error(`suite ${suitePath}: missing fixtures[]`);
  }
  const suiteDir = path.dirname(path.resolve(suitePath));
  return suite.fixtures.map((entry) => {
    const htmlPath = path.resolve(suiteDir, entry.path);
    const merged = mergeConfig(suite.defaults, entry);
    // Resolve extra_css paths relative to the suite file.
    const extra_css = merged.extra_css.map((rel) =>
      path.resolve(suiteDir, rel)
    );
    const stem = path.basename(entry.path).replace(/\.html?$/i, "");
    return { htmlPath, stem, config: { ...merged, extra_css } };
  });
}

async function loadCssCached(
  cache: Map<string, string>,
  abs: string
): Promise<string | null> {
  const hit = cache.get(abs);
  if (hit !== undefined) return hit;
  try {
    const content = await fs.readFile(abs, "utf8");
    cache.set(abs, content);
    return content;
  } catch (e) {
    console.error(`  warn: failed to read ${abs}: ${(e as Error).message}`);
    return null;
  }
}

async function renderOne(
  ctx: BrowserContext,
  r: Resolved,
  outDir: string,
  cssCache: Map<string, string>
): Promise<{ file: string; cssCount: number }> {
  const { htmlPath, stem, config } = r;

  const page = await ctx.newPage();
  await page.setViewportSize(config.viewport);

  // `file://` URL so relative resources resolve from the fixture's dir.
  const fileUrl = `file://${path.resolve(htmlPath)}`;
  await page.goto(fileUrl, { waitUntil: "load" });

  if (config.wait_for.includes("networkidle")) {
    await page.waitForLoadState("networkidle");
  }
  if (config.wait_for.includes("fonts")) {
    await page.evaluate(() => document.fonts.ready);
  }

  let cssCount = 0;
  for (const abs of config.extra_css) {
    const content = await loadCssCached(cssCache, abs);
    if (content !== null) {
      await page.addStyleTag({ content });
      cssCount++;
    }
  }

  const outPath = path.join(outDir, `${stem}.png`);
  await fs.mkdir(outDir, { recursive: true });

  await page.screenshot({
    path: outPath,
    fullPage: config.full_page,
    animations: "disabled",
    caret: "hide",
  });

  await page.close();
  return { file: outPath, cssCount };
}

function parseArgs(argv: string[]): {
  suite?: string;
  fixture?: string;
  outDir: string;
} {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const val = argv[i + 1];
    if (key && val) args[key] = val;
  }
  if (!args["out-dir"]) {
    throw new Error("--out-dir is required");
  }
  if (!args["suite"] && !args["fixture"]) {
    throw new Error("must pass --suite <path> or --fixture <html>");
  }
  return {
    suite: args["suite"],
    fixture: args["fixture"],
    outDir: path.resolve(args["out-dir"]),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let resolved: Resolved[];
  if (args.suite) {
    resolved = await resolveSuite(args.suite);
    console.log(
      `refbrowser: rendering ${resolved.length} fixture(s) from ${args.suite}`
    );
  } else {
    const htmlPath = path.resolve(args.fixture!);
    const stem = path.basename(htmlPath).replace(/\.html?$/i, "");
    resolved = [{ htmlPath, stem, config: DEFAULTS }];
    console.log(`refbrowser: rendering 1 fixture (ad-hoc, defaults only)`);
  }
  console.log(`  out-dir: ${args.outDir}`);

  let browser: Browser | null = null;
  const cssCache = new Map<string, string>();
  try {
    browser = await chromium.launch();

    for (const r of resolved) {
      const rel = path.relative(process.cwd(), r.htmlPath);
      // Fresh incognito context per fixture — no cookie/storage/SW
      // leakage between fixtures, so order can't mask real renderer
      // changes.
      let ctx: BrowserContext | null = null;
      try {
        ctx = await browser.newContext({
          // Deterministic: force light color-scheme, standard locale/timezone.
          colorScheme: "light",
          locale: "en-US",
          timezoneId: "UTC",
          reducedMotion: "reduce",
        });
        const { file, cssCount } = await renderOne(
          ctx,
          r,
          args.outDir,
          cssCache
        );
        const hint = cssCount > 0 ? ` [+${cssCount} css]` : "";
        console.log(`  ${rel} → ${file}${hint}`);
      } catch (e) {
        console.error(`  ${rel}: FAILED`);
        console.error(e);
        process.exitCode = 1;
      } finally {
        await ctx?.close();
      }
    }
  } finally {
    await browser?.close();
  }
}

// Only run when invoked directly (not when imported).
const invoked =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invoked) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
