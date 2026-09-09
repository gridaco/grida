// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — listed service membership without provider or billing initialization.
import { describe, expect, it, vi } from "vitest";

vi.mock("../models", () => {
  throw new Error("provider seam must not initialize");
});
vi.mock("ai", () => {
  throw new Error("provider SDK must not initialize");
});
vi.mock("@ai-sdk/openai-compatible", () => {
  throw new Error("provider SDK must not initialize");
});

vi.mock("@app/ai-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/ai-catalog")>();
  const base = actual.catalog.text.listed_models()[0]!;
  const active = { ...base, id: "fixture/active" };
  const legacy = { ...base, id: "fixture/legacy", deprecated: true };
  const staged = { ...base, id: "fixture/staged" };
  const members = {
    ...actual.catalog.text.catalog,
    [active.id]: active,
    [legacy.id]: legacy,
    [staged.id]: staged,
  };
  const view = actual.catalog.policy.resolve(members, {
    members: {
      ...actual.catalog.definitions.text.members,
      [active.id]: { status: "listed" },
      [legacy.id]: { status: "listed", legacy: true },
      [staged.id]: { status: "staged" },
    },
  });

  return {
    ...actual,
    catalog: {
      ...actual.catalog,
      text: {
        ...actual.catalog.text,
        catalog: members,
        listed_models: () => view.listed(),
      },
    },
  };
});

import { catalog as models, TIER_MODEL_IDS } from "@app/ai-catalog";
import { hostedModelList, isHostedTextModel } from "./hosted-models";

describe("hosted catalog", () => {
  it("loads listed text members directly without initializing provider code", () => {
    const listed = hostedModelList();
    const text = listed.filter((entry) => entry.grida.modality === "text");
    expect(text.map((entry) => entry.id)).toEqual(
      models.text.listed_models().map((spec) => spec.id)
    );
    for (const spec of models.text.listed_models()) {
      expect(isHostedTextModel(spec.id)).toBe(true);
      expect(text.find((entry) => entry.id === spec.id)).toMatchObject({
        id: spec.id,
        grida: { label: spec.label, deprecated: spec.deprecated === true },
      });
    }
    expect(hostedModelList()).toBe(listed);
    expect(
      text.find((entry) => entry.id === TIER_MODEL_IDS.nano)?.grida.tier
    ).toBe("nano");
  });

  it("accepts exact listed active and legacy members", () => {
    expect(isHostedTextModel("fixture/active")).toBe(true);
    expect(isHostedTextModel("fixture/legacy")).toBe(true);
    expect(
      hostedModelList().find((entry) => entry.id === "fixture/legacy")?.grida
        .deprecated
    ).toBe(true);
  });

  it("rejects a staged reference even when its facts remain in the service catalog", () => {
    expect(Object.hasOwn(models.text.catalog, "fixture/staged")).toBe(true);
    expect(isHostedTextModel("fixture/staged")).toBe(false);
  });

  it("rejects bare, date-suffixed, unknown, and prototype-property ids", () => {
    for (const id of [
      "active",
      "fixture/active-2026-09-09",
      "unknown",
      "toString",
    ]) {
      expect(isHostedTextModel(id)).toBe(false);
    }
  });

  it("enforces the same membership advertised by the hosted text listing", () => {
    const text = hostedModelList().filter(
      (entry) => entry.grida.modality === "text"
    );
    for (const id of Object.keys(models.text.catalog)) {
      expect(isHostedTextModel(id)).toBe(text.some((entry) => entry.id === id));
    }
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
