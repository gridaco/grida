import { describe, expect, it } from "vitest";
import { MediaModelReadiness } from "./media-model-readiness";

const providers = {
  vercel: { id: "vercel-model" },
  openrouter: { id: "openrouter-model" },
};

// GRIDA-GG: desktop — funded Tripo readiness is feature-capability gated.
describe("MediaModelReadiness.tripo", () => {
  it("admits either ready lane and keeps unresolved lanes pending", () => {
    expect(MediaModelReadiness.tripo(false, true, true)).toBe(true);
    expect(MediaModelReadiness.tripo(true, false, true)).toBe(true);
    expect(MediaModelReadiness.tripo(null, true, true)).toBe(true);
    expect(MediaModelReadiness.tripo(false, null, true)).toBeNull();
    expect(MediaModelReadiness.tripo(false, false, true)).toBe(false);
  });
  it("does not infer hosted Tripo from an older host's unrelated GG session", () => {
    expect(MediaModelReadiness.tripo(false, true, false)).toBe(false);
    expect(MediaModelReadiness.tripo(false, null, false)).toBe(false);
    expect(MediaModelReadiness.tripo(true, null, false)).toBe(true);
  });
});

describe("MediaModelReadiness.visual", () => {
  it("requires a connected BYOK provider bound to the exact model", () => {
    expect(
      MediaModelReadiness.visual({ providers }, new Set(["openrouter"]), false)
    ).toBe(true);
    expect(
      MediaModelReadiness.visual({ providers }, new Set(["fal"]), false)
    ).toBe(false);
  });

  it("admits hosted media only for a Vercel-backed model", () => {
    expect(MediaModelReadiness.visual({ providers }, new Set(), true)).toBe(
      true
    );
    expect(
      MediaModelReadiness.visual(
        { providers: { fal: { id: "fal-model" } } },
        new Set(),
        true
      )
    ).toBe(false);
  });

  it("stays pending until both unresolved sources have settled", () => {
    expect(MediaModelReadiness.visual({ providers }, null, false)).toBeNull();
    expect(
      MediaModelReadiness.visual({ providers }, new Set(), null)
    ).toBeNull();
    expect(MediaModelReadiness.visual({ providers }, null, true)).toBe(true);
  });
});
