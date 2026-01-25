// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { createCanvas } from "..";

/**
 * WASM API Validation Tests (Node)
 *
 * This validates that the Emscripten JS glue + WASM can be instantiated in a
 * pure Node test environment, and that the expected C exports (and runtime
 * methods like HEAP/UTF8 helpers) are present with the expected arity.
 *
 * Note: these tests intentionally do NOT call WebGL-dependent APIs.
 */

let module: any;

beforeAll(async () => {
  const pkg = require("../../dist/index.js") as {
    default?: (opts?: unknown) => Promise<any>;
  };

  const factory = await pkg.default!();
  module = factory.module;
}, 30_000);

// List of expected C exports with their expected parameter counts.
// Source of truth: `lib/modules/canvas-bindings.d.ts`
const EXPECTED_FUNCTIONS = [
  // core memory wrapper
  { name: "_allocate", paramCount: 1 },
  { name: "_deallocate", paramCount: 2 },

  // initialization / app lifecycle
  { name: "_init", paramCount: 3 },
  { name: "_init_with_backend", paramCount: 4 },
  { name: "_tick", paramCount: 2 },
  { name: "_destroy", paramCount: 1 },
  { name: "_resize_surface", paramCount: 3 },
  { name: "_redraw", paramCount: 1 },

  // scene
  { name: "_load_scene_json", paramCount: 3 },
  { name: "_apply_scene_transactions", paramCount: 3 },
  { name: "_load_dummy_scene", paramCount: 1 },
  { name: "_load_benchmark_scene", paramCount: 3 },

  // input
  { name: "_pointer_move", paramCount: 3 },

  // fonts
  { name: "_add_font", paramCount: 5 },
  { name: "_has_missing_fonts", paramCount: 1 },
  { name: "_list_missing_fonts", paramCount: 1 },
  { name: "_list_available_fonts", paramCount: 1 },
  { name: "_set_default_fallback_fonts", paramCount: 3 },
  { name: "_get_default_fallback_fonts", paramCount: 1 },

  // images
  { name: "_add_image", paramCount: 3 },
  { name: "_get_image_bytes", paramCount: 3 },
  { name: "_get_image_size", paramCount: 3 },

  // camera and transforms
  { name: "_set_main_camera_transform", paramCount: 7 },

  // node ops
  { name: "_get_node_id_from_point", paramCount: 3 },
  { name: "_get_node_ids_from_point", paramCount: 3 },
  { name: "_get_node_ids_from_envelope", paramCount: 5 },
  { name: "_get_node_absolute_bounding_box", paramCount: 3 },

  // export & conversion
  { name: "_export_node_as", paramCount: 5 },
  { name: "_to_vector_network", paramCount: 3 },

  // commands
  { name: "_command", paramCount: 4 },

  // debug
  { name: "_highlight_strokes", paramCount: 3 },
  { name: "_set_debug", paramCount: 2 },
  { name: "_toggle_debug", paramCount: 1 },
  { name: "_set_verbose", paramCount: 2 },
  { name: "_devtools_rendering_set_show_tiles", paramCount: 2 },
  { name: "_devtools_rendering_set_show_fps_meter", paramCount: 2 },
  { name: "_devtools_rendering_set_show_stats", paramCount: 2 },
  { name: "_devtools_rendering_set_show_hit_testing", paramCount: 2 },
  { name: "_devtools_rendering_set_show_ruler", paramCount: 2 },
  { name: "_runtime_renderer_set_cache_tile", paramCount: 2 },
] as const;

// Expected Emscripten runtime methods
const EXPECTED_RUNTIME_METHODS = [
  "GL",
  "HEAP32",
  "HEAPF32",
  "HEAPU8",
  "HEAPU16",
  "HEAPU32",
  "UTF8ToString",
  "stringToUTF8",
  "lengthBytesUTF8",
] as const;

describe("WASM API Validation", () => {
  it("instantiates module in Node", () => {
    expect(module).toBeTruthy();
  });

  it("dispose guard: throws after dispose (raster)", async () => {
    expect(typeof createCanvas).toBe("function");

    const canvas = await createCanvas({
      backend: "raster",
      width: 64,
      height: 64,
      useEmbeddedFonts: true,
    });

    const doc = readFileSync(resolve(process.cwd(), "example/rectangle.grida1"), "utf8");
    canvas.loadScene(doc);
    canvas.dispose();

    expect(() =>
      canvas.exportNodeAs("rectangle", {
        format: "PNG",
        constraints: { type: "none", value: 1 },
      })
    ).toThrow(/disposed/i);
  });

  describe("C exports", () => {
    EXPECTED_FUNCTIONS.forEach(({ name, paramCount }) => {
      it(`exposes ${name}`, () => {
        expect(module).toHaveProperty(name);
        expect(typeof module[name]).toBe("function");
      });

      it(`${name} has arity ${paramCount}`, () => {
        expect(module[name].length).toBe(paramCount);
      });
    });
  });

  describe("Runtime methods", () => {
    EXPECTED_RUNTIME_METHODS.forEach((methodName) => {
      it(`exposes runtime method ${methodName}`, () => {
        expect(module).toHaveProperty(methodName);
      });
    });

    it("has HEAP arrays", () => {
      expect(module.HEAP32).toBeInstanceOf(Int32Array);
      expect(module.HEAPF32).toBeInstanceOf(Float32Array);
      expect(module.HEAPU8).toBeInstanceOf(Uint8Array);
      expect(module.HEAPU16).toBeInstanceOf(Uint16Array);
      expect(module.HEAPU32).toBeInstanceOf(Uint32Array);
    });

    it("has UTF8 helpers", () => {
      expect(typeof module.UTF8ToString).toBe("function");
      expect(typeof module.stringToUTF8).toBe("function");
      expect(typeof module.lengthBytesUTF8).toBe("function");
    });

    it("has GL API surface (presence only)", () => {
      // We don't call these in Node (no WebGL context), but the runtime surface should exist.
      expect(module.GL).toBeTruthy();
      expect(typeof module.GL.registerContext).toBe("function");
      expect(typeof module.GL.makeContextCurrent).toBe("function");
    });
  });
});
