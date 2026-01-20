// @vitest-environment node

import { describe, expect, it } from "vitest";

describe("node smoke", () => {
  it("can import dist and initialize wasm module in Node", async () => {
    // NOTE: this package is CommonJS (no `"type": "module"`), so avoid `import.meta`.
    const pkg = require("../../dist/index.js") as {
      default?: (opts?: unknown) => Promise<unknown>;
    };

    expect(typeof pkg.default).toBe("function");

    const factory: any = await pkg.default!();
    expect(factory).toBeTruthy();
    expect(factory.module).toBeTruthy();

    // Basic sanity: core exports + runtime methods should exist after instantiation.
    expect(typeof factory.module._init).toBe("function");
    expect(factory.module.HEAPU8).toBeInstanceOf(Uint8Array);
    expect(typeof factory.module.UTF8ToString).toBe("function");
  }, 30_000);
});

