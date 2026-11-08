import type { CurrentGGModel } from "@/lib/desktop/gg-models";
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

  it("admits hosted media only for a model served by Vercel AI Gateway", () => {
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

describe("current hosted media readiness", () => {
  it("withdraws a native row when current GG no longer serves it", () => {
    expect(
      MediaModelReadiness.visual({ providers }, new Set(), true, false)
    ).toBe(false);
    expect(
      MediaModelReadiness.visual(
        { providers },
        new Set(["openrouter"]),
        true,
        false
      )
    ).toBe(true);
  });
  it("accepts current GG independently from a Vercel BYOK binding", () => {
    expect(
      MediaModelReadiness.visual(
        { providers: { fal: {} } },
        new Set(),
        true,
        true
      )
    ).toBe(true);
  });
});

describe("Settings current hosted interface readiness", () => {
  const model: CurrentGGModel = {
    id: "fixture/visual",
    label: "Visual",
    kind: "video",
    created: 0,
    owned_by: "fixture",
    interfaces: ["videos"],
    input_modalities: ["text"],
    output_modalities: ["video"],
    operation_ids: [],
    capabilities: {},
    limits: {},
    client_supported_options: { video_text: true },
  };
  it("checks the exact generation interface and kind", () => {
    expect(MediaModelReadiness.hosted(model.id, "video", [model])).toBe(true);
    expect(
      MediaModelReadiness.hosted(model.id, "video", [
        { ...model, kind: "image" },
      ])
    ).toBe(false);
    expect(
      MediaModelReadiness.hosted(model.id, "video", [
        { ...model, interfaces: ["endpoints"] },
      ])
    ).toBe(false);
    expect(
      MediaModelReadiness.hosted(model.id, "image", [
        { ...model, kind: "image", interfaces: ["images.generations"] },
      ])
    ).toBe(true);
    expect(
      MediaModelReadiness.hosted(model.id, "image", [
        { ...model, kind: "image", interfaces: ["endpoints"] },
      ])
    ).toBe(false);
  });
  it("does not mark image-only video operations ready for a text composer", () => {
    expect(
      MediaModelReadiness.hosted(model.id, "video", [
        { ...model, client_supported_options: { video_text: false } },
      ])
    ).toBe(false);
    expect(
      MediaModelReadiness.hosted(model.id, "video", [
        { ...model, client_supported_options: {} },
      ])
    ).toBe(false);
    expect(MediaModelReadiness.hosted(model.id, "video", [])).toBe(false);
    expect(MediaModelReadiness.hosted(model.id, "video", null)).toBeUndefined();
  });
});
