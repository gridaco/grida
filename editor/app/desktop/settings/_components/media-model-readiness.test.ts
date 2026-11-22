import {
  mediaModelChoices,
  newestMediaModels,
  type CurrentGGModel,
} from "@/lib/desktop/gg-models";
import { DesktopMediaTool } from "@/scaffolds/desktop/tools/media-tool-registry";
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
  it("lists a hosted-only image with no installed card and opens its exact model", () => {
    const image: CurrentGGModel = {
      ...model,
      id: "fixture/new-image",
      label: "New image",
      kind: "image",
      interfaces: ["images.generations"],
      output_modalities: ["image"],
    };
    const [choice] = mediaModelChoices([], [model, image], "image");
    expect(choice).toMatchObject({
      id: image.id,
      label: image.label,
      vendor: image.owned_by,
    });
    expect(mediaModelChoices([], [model, image], "image")).toHaveLength(1);
    const hosted = MediaModelReadiness.hosted(choice.id, "image", [image]);
    expect(MediaModelReadiness.visual(choice, new Set(), true, hosted)).toBe(
      true
    );
    expect(
      MediaModelReadiness.visual(choice, new Set(), null, hosted)
    ).toBeNull();
    const href = DesktopMediaTool.href("image-generator", choice.id);
    const { searchParams } = new URL(href, "http://localhost");
    expect(
      DesktopMediaTool.resolveSelection(
        searchParams.get("tool"),
        searchParams.get("model")
      ).initialModelId
    ).toBe(image.id);
  });

  it("merges two ways to run the same model into one row with its installed binding", () => {
    const installed = { id: model.id, label: "Bundled label", providers };
    const [choice] = mediaModelChoices([installed], [model], "video");
    expect(mediaModelChoices([installed], [model], "video")).toHaveLength(1);
    expect(choice).toMatchObject({
      id: model.id,
      label: model.label,
      providers,
    });
    expect(
      MediaModelReadiness.visual(choice, new Set(["openrouter"]), false, false)
    ).toBe(true);
    expect(mediaModelChoices([installed], [], "video")).toEqual([installed]);
  });

  it("sorts hosted and installed dates newest first, with ID ties and unknown dates last", () => {
    const installed = [
      { id: "fixture/old", label: "Old", release: { date: "2025-01-01" } },
      { id: "fixture/undated", label: "Undated", release: { date: null } },
      {
        id: "fixture/same-day",
        label: "Same date",
        release: { date: "2026-11-04" },
      },
    ];
    const offered = [
      { ...model, id: "fixture/a-new", release_date: "2026-11-04" },
      { ...model, id: "fixture/latest", release_date: "2026-11-17" },
    ];
    const choices = mediaModelChoices(installed, offered, "video");
    expect(newestMediaModels(choices).map(({ id }) => id)).toEqual([
      "fixture/latest",
      "fixture/a-new",
      "fixture/same-day",
      "fixture/old",
      "fixture/undated",
    ]);
    expect(choices[0].id).toBe("fixture/old");
  });

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
