// Tests for the keynote preset (`@grida/svg-editor/presets`).
//
// The preset is ~30 LOC of pure composition over primitives that are each
// independently unit-tested:
//   - `attach_dom_surface` — internal-surface.test.ts
//   - `camera.constraints` (cover) — camera.test.ts ("Camera — constraints (cover)")
//   - `editor.state.load_version` — load-version.test.ts
//   - `editor.subscribe_with_selector(s => s.load_version)` — load-version.test.ts
//
// What this file covers: the namespace shape + signature smoke test
// (compile-time guarantees that the public surface is what the README
// promises). The end-to-end DOM-mounting integration runs in the browser
// dogfood at `/svg/examples/keynote` because jsdom in this monorepo carries
// a broken `canvas` peer dependency and the build wars aren't worth it.

import { describe, expect, it } from "vitest";
import { keynote, type KeynoteAttachOptions } from "../src/presets";

describe("presets.keynote namespace", () => {
  it("exposes attach()", () => {
    expect(typeof keynote.attach).toBe("function");
  });

  it("attach() signature accepts a container + optional padding + surface options", () => {
    // Compile-time check via type assignment.
    const opts: KeynoteAttachOptions = {
      container: undefined as unknown as HTMLElement,
      padding: 80,
      surface: { gestures: false },
    };
    expect(opts.padding).toBe(80);
    expect(opts.surface?.gestures).toBe(false);
  });

  it("attach() options accept pan_overshoot", () => {
    // Compile-time check via type assignment.
    const opts: KeynoteAttachOptions = {
      container: undefined as unknown as HTMLElement,
      padding: 80,
      pan_overshoot: 60,
    };
    expect(opts.pan_overshoot).toBe(60);
  });
});
