// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — model listing never initializes a provider or billing seam.
import { describe, expect, it, vi } from "vitest";
import { models, TIER_MODEL_IDS } from "@grida/ai-models";

vi.mock("../models", () => {
  throw new Error("provider seam must not initialize");
});
vi.mock("ai", () => {
  throw new Error("provider SDK must not initialize");
});
vi.mock("@ai-sdk/openai-compatible", () => {
  throw new Error("provider SDK must not initialize");
});

import { hostedModelList, isHostedTextModel } from "./hosted-models";

describe("hosted catalog", () => {
  it("loads the existing text catalog directly without initializing provider code", () => {
    const listed = hostedModelList();
    const text = listed.filter((entry) => entry.grida.modality === "text");
    expect(text.map((entry) => entry.id)).toEqual(
      Object.keys(models.text.catalog)
    );
    for (const spec of Object.values(models.text.catalog)) {
      expect(isHostedTextModel(spec.id)).toBe(true);
      expect(text.find((entry) => entry.id === spec.id)).toMatchObject({
        id: spec.id,
        grida: { label: spec.label, deprecated: spec.deprecated === true },
      });
    }
    expect(isHostedTextModel("toString")).toBe(false);
    expect(hostedModelList()).toBe(listed);
    expect(
      text.find((entry) => entry.id === TIER_MODEL_IDS.nano)?.grida.tier
    ).toBe("nano");
  });

  it("preserves image/video Vercel availability and the pricing-free public shape", () => {
    const list = hostedModelList();
    expect(
      list
        .filter((entry) => entry.grida.modality === "image")
        .map((entry) => entry.id)
    ).toEqual(
      models.image
        .listed_models()
        .filter((card) => models.image.binding(card, "vercel"))
        .map((card) => card.id)
    );
    expect(
      list
        .filter((entry) => entry.grida.modality === "video")
        .map((entry) => entry.id)
    ).toEqual(
      models.video
        .listed_models()
        .filter((card) => models.video.binding(card, "vercel"))
        .map((card) => card.id)
    );
    for (const entry of list) {
      expect(Object.keys(entry)).toEqual([
        "id",
        "object",
        "created",
        "owned_by",
        "grida",
      ]);
      expect(Object.keys(entry.grida)).toEqual([
        "modality",
        "tier",
        "label",
        "deprecated",
      ]);
    }
  });
});
