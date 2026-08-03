import { describe, expect, it } from "vitest";
import { MediaModelReadiness } from "./media-model-readiness";

const providers = {
  vercel: { id: "vercel-model" },
  openrouter: { id: "openrouter-model" },
};

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
