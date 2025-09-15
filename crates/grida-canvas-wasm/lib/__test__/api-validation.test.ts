/**
 * TODO: WASM API Validation Tests
 *
 * This test suite is currently disabled because the WASM module is only built
 * for web environments and cannot run in Node.js test environment.
 *
 * Once we have a filesystem-compatible version of the WASM module, we can:
 *
 * 1. Validate that all expected functions from main.rs are properly exposed
 * 2. Check function parameter counts match expectations
 * 3. Verify runtime methods (GL, HEAP arrays, UTF8 functions) are available
 * 4. Test basic type safety and function signatures
 * 5. Ensure TypeScript definitions match the actual WASM bindings
 *
 * Expected functions to validate:
 * - Core: _init, _tick, _resize_surface, _redraw
 * - Scene loading: _load_scene_json, _load_dummy_scene, _load_benchmark_scene
 * - Input: _pointer_move
 * - Font management: _add_font, _has_missing_fonts, _list_missing_fonts, etc.
 * - Image: _add_image
 * - Camera: _set_main_camera_transform
 * - Node operations: _get_node_id_from_point, _export_node_as, etc.
 * - Commands: _command
 * - Debug/devtools: _set_debug, _devtools_rendering_set_show_*, etc.
 * - Memory: _allocate, _deallocate
 *
 * Runtime methods to validate:
 * - GL context management
 * - HEAP arrays (HEAP8, HEAP16, HEAP32, HEAPF32, HEAPF64, HEAPU8, HEAPU16, HEAPU32)
 * - UTF8 string conversion (UTF8ToString, stringToUTF8, lengthBytesUTF8)
 * - Memory management (___wbindgen_malloc, ___wbindgen_free, ___wbindgen_realloc)
 */

// import createGridaCanvas from "../bin/grida-canvas-wasm";

// List of expected functions from main.rs with their expected parameter counts
// const EXPECTED_FUNCTIONS = [
//   // Core functions
//   { name: "_init", paramCount: 3 },
//   { name: "_tick", paramCount: 2 },
//   { name: "_resize_surface", paramCount: 3 },
//   { name: "_redraw", paramCount: 1 },

//   // Scene loading
//   { name: "_load_scene_json", paramCount: 3 },
//   { name: "_load_dummy_scene", paramCount: 1 },
//   { name: "_load_benchmark_scene", paramCount: 3 },

//   // Input handling
//   { name: "_pointer_move", paramCount: 3 },

//   // Font management
//   { name: "_add_font", paramCount: 5 },
//   { name: "_has_missing_fonts", paramCount: 1 },
//   { name: "_list_missing_fonts", paramCount: 1 },
//   { name: "_list_available_fonts", paramCount: 1 },
//   { name: "_set_default_fallback_fonts", paramCount: 3 },
//   { name: "_get_default_fallback_fonts", paramCount: 1 },

//   // Image management
//   { name: "_add_image", paramCount: 3 },

//   // Camera and transforms
//   { name: "_set_main_camera_transform", paramCount: 7 },

//   // Node operations
//   { name: "_get_node_id_from_point", paramCount: 3 },
//   { name: "_get_node_ids_from_point", paramCount: 3 },
//   { name: "_get_node_ids_from_envelope", paramCount: 5 },
//   { name: "_get_node_absolute_bounding_box", paramCount: 3 },

//   // Export and conversion
//   { name: "_export_node_as", paramCount: 4 },
//   { name: "_to_vector_network", paramCount: 3 },

//   // Commands
//   { name: "_command", paramCount: 4 },

//   // Debug and devtools
//   { name: "_set_debug", paramCount: 2 },
//   { name: "_toggle_debug", paramCount: 1 },
//   { name: "_set_verbose", paramCount: 2 },
//   { name: "_highlight_strokes", paramCount: 3 },

//   // Devtools rendering
//   { name: "_devtools_rendering_set_show_ruler", paramCount: 2 },
//   { name: "_devtools_rendering_set_show_tiles", paramCount: 2 },
//   { name: "_devtools_rendering_set_show_fps_meter", paramCount: 2 },
//   { name: "_devtools_rendering_set_show_stats", paramCount: 2 },
//   { name: "_devtools_rendering_set_show_hit_testing", paramCount: 2 },

//   // Runtime settings
//   { name: "_runtime_renderer_set_cache_tile", paramCount: 2 },

//   // Memory management
//   { name: "_allocate", paramCount: 1 },
//   { name: "_deallocate", paramCount: 2 },
// ] as const;

// Expected runtime methods from Emscripten
// const EXPECTED_RUNTIME_METHODS = [
//   "GL",
//   "HEAP8",
//   "HEAP16",
//   "HEAP32",
//   "HEAPF32",
//   "HEAPF64",
//   "HEAPU8",
//   "HEAPU16",
//   "HEAPU32",
//   "UTF8ToString",
//   "stringToUTF8",
//   "lengthBytesUTF8",
//   "___wbindgen_malloc",
//   "___wbindgen_free",
//   "___wbindgen_realloc",
// ] as const;

describe("WASM API Validation", () => {
  it("TODO: Enable tests once filesystem-compatible WASM build is available", () => {
    // This test is a placeholder until we have a Node.js-compatible WASM build
    expect(true).toBe(true);
  });

  // describe("Core Functions", () => {
  //   EXPECTED_FUNCTIONS.forEach(({ name, paramCount }) => {
  //     it(`should expose function ${name}`, () => {
  //       expect(module).toHaveProperty(name);
  //       expect(typeof (module as any)[name]).toBe("function");
  //     });

  //     it(`should have correct parameter count for ${name}`, () => {
  //       const fn = (module as any)[name];
  //       expect(fn.length).toBe(paramCount);
  //     });
  //   });
  // });

  // describe("Runtime Methods", () => {
  //   EXPECTED_RUNTIME_METHODS.forEach((methodName) => {
  //     it(`should expose runtime method ${methodName}`, () => {
  //       expect(module).toHaveProperty(methodName);
  //     });
  //   });

  //   it("should have GL object with required methods", () => {
  //     expect(module.GL).toBeDefined();
  //     expect(typeof module.GL.registerContext).toBe("function");
  //     expect(typeof module.GL.makeContextCurrent).toBe("function");
  //   });

  //   it("should have HEAP arrays", () => {
  //     expect(module.HEAP8).toBeInstanceOf(Int8Array);
  //     expect(module.HEAP16).toBeInstanceOf(Int16Array);
  //     expect(module.HEAP32).toBeInstanceOf(Int32Array);
  //     expect(module.HEAPF32).toBeInstanceOf(Float32Array);
  //     expect(module.HEAPF64).toBeInstanceOf(Float64Array);
  //     expect(module.HEAPU8).toBeInstanceOf(Uint8Array);
  //     expect(module.HEAPU16).toBeInstanceOf(Uint16Array);
  //     expect(module.HEAPU32).toBeInstanceOf(Uint32Array);
  //   });

  //   it("should have UTF8 string conversion functions", () => {
  //     expect(typeof module.UTF8ToString).toBe("function");
  //     expect(typeof module.stringToUTF8).toBe("function");
  //     expect(typeof module.lengthBytesUTF8).toBe("function");
  //   });
  // });

  // describe("Function Signatures", () => {
  //   it("should be able to call _init with correct parameters", () => {
  //     // This should not throw
  //     expect(() => {
  //       const app = module._init(800, 600, true);
  //       expect(typeof app).toBe("number");
  //     }).not.toThrow();
  //   });

  //   it("should be able to call _has_missing_fonts", () => {
  //     const app = module._init(800, 600, true);
  //     const result = module._has_missing_fonts(app);
  //     expect(typeof result).toBe("boolean");
  //   });

  //   it("should be able to call _list_missing_fonts", () => {
  //     const app = module._init(800, 600, true);
  //     const result = module._list_missing_fonts(app);
  //     expect(typeof result).toBe("number");
  //   });
  // });

  // describe("Type Safety", () => {
  //   it("should have correct return types for key functions", () => {
  //     const app = module._init(800, 600, true);

  //     // Test return types
  //     expect(typeof module._has_missing_fonts(app)).toBe("boolean");
  //     expect(typeof module._list_missing_fonts(app)).toBe("number");
  //     expect(typeof module._list_available_fonts(app)).toBe("number");
  //     expect(typeof module._get_default_fallback_fonts(app)).toBe("number");
  //   });
  // });
});
