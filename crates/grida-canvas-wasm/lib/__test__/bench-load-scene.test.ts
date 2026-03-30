// @vitest-environment node
//
// WASM-on-Node benchmark for load_scene pipeline.
//
// Measures real WASM execution of the scene loading stages:
//   1. loadSceneGrida — FBS decode + SceneGraph construction
//   2. switchScene    — layout + geometry + effects + layers
//
// When `perf` feature is enabled on the cg crate, the Rust side emits
// per-stage timing via eprintln! ([load_scene] line).
// This test measures JS-side wall time for comparison.
//
// Usage:
//   pnpm test bench-load-scene
//   pnpm vitest run bench-load-scene --reporter=verbose
//
// To benchmark a .grida file, place it in:
//   lib/__test__/fixtures/local/
// All .grida files in that directory will be auto-discovered.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Scene } from "../modules/canvas";

/** Directory for local (gitignored) benchmark fixtures. */
const LOCAL_FIXTURES_DIR = resolve(__dirname, "fixtures/local");

let module: any;

beforeAll(async () => {
  const pkg = require("../../dist/index.js") as {
    default: (opts?: unknown) => Promise<any>;
  };
  const factory = await pkg.default();
  module = factory.module;
}, 30_000);

function createRasterScene(width = 1000, height = 1000): Scene {
  const appptr = module._init_with_backend(
    1, // BACKEND_ID.Raster
    width,
    height,
    1, // useEmbeddedFonts = true
    0 // configFlags
  );
  return new Scene(module, appptr);
}

/**
 * Discover .grida files from the local fixtures directory.
 */
function discoverGridaFixtures(): { name: string; path: string }[] {
  if (!existsSync(LOCAL_FIXTURES_DIR)) {
    return [];
  }
  return readdirSync(LOCAL_FIXTURES_DIR)
    .filter((f) => f.endsWith(".grida"))
    .sort()
    .map((f) => ({ name: f, path: resolve(LOCAL_FIXTURES_DIR, f) }));
}

describe("bench: load_scene (WASM-on-Node)", () => {
  it("grida1 JSON (rectangle)", async () => {
    const scene = createRasterScene();
    const doc = readFileSync(
      resolve(process.cwd(), "example/rectangle.grida1"),
      "utf8"
    );

    const t0 = performance.now();
    scene.loadScene(doc);
    const elapsed = performance.now() - t0;

    console.log(`[wasm-bench] rectangle.grida1: ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(5_000);
    scene.dispose();
  });

  it("synthetic 100x100 grid (10k nodes)", async () => {
    const scene = createRasterScene();

    const t0 = performance.now();
    scene.loadBenchmarkScene(100, 100);
    const elapsed = performance.now() - t0;

    console.log(
      `[wasm-bench] synthetic 100x100: ${elapsed.toFixed(0)}ms (10k nodes)`
    );
    expect(elapsed).toBeLessThan(30_000);
    scene.dispose();
  }, 60_000);

  it("synthetic 200x200 grid (40k nodes)", async () => {
    const scene = createRasterScene();

    const t0 = performance.now();
    scene.loadBenchmarkScene(200, 200);
    const elapsed = performance.now() - t0;

    console.log(
      `[wasm-bench] synthetic 200x200: ${elapsed.toFixed(0)}ms (40k nodes)`
    );
    expect(elapsed).toBeLessThan(60_000);
    scene.dispose();
  }, 120_000);

  // Auto-discovered .grida fixtures from fixtures/local/
  const fixtures = discoverGridaFixtures();

  for (const fx of fixtures) {
    it(`grida binary: ${fx.name}`, async () => {
      const data = new Uint8Array(readFileSync(fx.path));
      const scene = createRasterScene();

      // Phase 1: FBS decode
      const t0 = performance.now();
      scene.loadSceneGrida(data);
      const tLoad = performance.now();

      // Phase 2: switch to the first scene
      const sceneIds = scene.loadedSceneIds();
      expect(sceneIds.length).toBeGreaterThan(0);
      const firstSceneId = sceneIds[0];

      scene.switchScene(firstSceneId);
      const tSwitch = performance.now();

      const loadMs = tLoad - t0;
      const switchMs = tSwitch - tLoad;
      const totalMs = tSwitch - t0;

      console.log(
        `[wasm-bench] ${fx.name} (scene=${firstSceneId}): ` +
          `load=${loadMs.toFixed(0)}ms switch=${switchMs.toFixed(0)}ms total=${totalMs.toFixed(0)}ms`
      );

      expect(totalMs).toBeLessThan(120_000);
      scene.dispose();
    }, 120_000);
  }

  if (fixtures.length === 0) {
    it("no .grida fixtures found (skipped)", () => {
      console.log(
        "[wasm-bench] No .grida fixtures in lib/__test__/fixtures/local/. " +
          "Place .grida files there to benchmark real scenes."
      );
    });
  }
});
