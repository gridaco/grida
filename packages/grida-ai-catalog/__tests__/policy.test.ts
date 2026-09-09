import { catalog } from "../src";
import { models as facts } from "@grida/ai-models";

const cards = {
  c: { id: "c", label: "Alpha", cost: { usd: 3 } },
  a: { id: "a", label: "Same", cost: { usd: 1 } },
  b: { id: "b", label: "Same", cost: { usd: 2 } },
  d: { id: "d", label: "Last", cost: { usd: 4 } },
};

describe("service policy", () => {
  it("allows two services to select and deprecate identical facts independently", () => {
    const left = catalog.policy.resolve(cards, {
      members: {
        a: { status: "listed", legacy: true },
        b: { status: "listed" },
      },
      default_id: "b",
    });
    const right = catalog.policy.resolve(cards, {
      members: { a: { status: "listed" }, c: { status: "staged" } },
      default_id: "a",
    });
    expect(left.listed().map((c) => c.id)).toEqual(["b", "a"]);
    expect(right.listed().map((c) => c.id)).toEqual(["a"]);
    expect(right.staged().map((c) => c.id)).toEqual(["c"]);
    expect(right.models.a.legacy).toBeUndefined();
    expect(cards.a).not.toHaveProperty("legacy");
  });

  it("orders default first, active before legacy, partial order before label and id", () => {
    const view = catalog.policy.resolve(cards, {
      members: {
        b: { status: "listed" },
        a: { status: "listed" },
        c: { status: "listed" },
        d: { status: "listed", legacy: true },
      },
      default_id: "b",
      order: ["d", "a"],
    });
    expect(view.all().map((c) => c.id)).toEqual(["b", "a", "c", "d"]);
    const fallback = catalog.policy.resolve(cards, {
      members: {
        b: { status: "listed" },
        a: { status: "listed" },
        c: { status: "listed" },
      },
    });
    expect(fallback.all().map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(fallback).not.toHaveProperty("default_id");
  });

  it("uses the same partial order within legacy members", () => {
    const view = catalog.policy.resolve(cards, {
      members: {
        a: { status: "listed", legacy: true },
        b: { status: "listed", legacy: true },
        c: { status: "listed" },
      },
      order: ["b"],
    });
    expect(view.all().map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it.each([
    { members: { missing: { status: "listed" } } },
    { members: { a: { status: "listed" } }, order: ["a", "a"] },
    { members: { a: { status: "listed" } }, order: ["b"] },
    { members: { a: { status: "listed" } }, default_id: "b" },
    { members: { a: { status: "staged" } }, default_id: "a" },
    { members: { a: { status: "listed", legacy: true } }, default_id: "a" },
  ])("rejects inconsistent references: %j", (definition) => {
    expect(() =>
      catalog.policy.resolve(cards, definition as catalog.policy.Definition)
    ).toThrow(
      /Unknown model id|Duplicate order id|Order id is not a member|Default must be a listed, active member/
    );
  });

  it("copies producer facts and policy before freezing every resolved value", () => {
    const input: typeof cards = JSON.parse(JSON.stringify(cards));
    const definition: catalog.policy.Definition = {
      members: { a: { status: "listed" } },
      order: ["a"],
    };
    const view = catalog.policy.resolve(input, definition);
    input.a.cost.usd = 99;
    expect(view.models.a.cost.usd).toBe(1);
    expect(() => {
      view.models.a.cost.usd = 7;
    }).toThrow(TypeError);
    expect(Object.isFrozen(view.listed())).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(definition)).toBe(false);
  });

  it("never accepts policy fields as replacement factual capabilities or prices", () => {
    const view = catalog.policy.resolve(cards, {
      members: { a: { status: "listed", cost: { usd: 0 }, id: "changed" } },
    });
    expect(view.models.a.id).toBe("a");
    expect(view.models.a.cost.usd).toBe(1);
  });

  it("selects Flare for new image choices while preserving full service membership", () => {
    expect(catalog.image.default_id).toBe("openai/gpt-image-2.5-flare");
    expect(catalog.image.listed_models()[0].id).toBe(catalog.image.default_id);
    expect(catalog.image.ordered_models().some((card) => !card.listed)).toBe(
      true
    );
    const legacy = catalog.image
      .listed_models()
      .findIndex((card) => card.deprecated);
    expect(
      catalog.image
        .listed_models()
        .slice(legacy)
        .every((card) => card.deprecated)
    ).toBe(true);
    expect(facts.image.models["openai/gpt-image-2"]).not.toHaveProperty(
      "deprecated"
    );
  });
});

describe("schema-1 recommendations", () => {
  it.each(["image", "video"] as const)(
    "discards a rejected %s section's recommendations without rejecting valid text",
    (family) => {
      const seed = catalog.snapshot.seed();
      (seed as unknown as Record<string, unknown>)[family] = {
        models: { "fresh/model": { id: "fresh/model" } },
      };
      seed.preferences![family] = { default_id: "fresh/model" };
      const parsed = catalog.snapshot.parse(seed)!;
      expect(parsed).not.toBeNull();
      expect(parsed[family]).toBeUndefined();
      expect(parsed.preferences![family]).toBeUndefined();
      const view = catalog.snapshot.view(parsed);
      expect(view.has(catalog.text.default_id!)).toBe(true);
      expect(view[family].default_id).toBeUndefined();
    }
  );

  it("preserves non-image initial choices and exposes every staged or listed member in full views", () => {
    expect(catalog.video.default_id).toBe("google/veo-3.1");
    expect(catalog.audio.music.default_id).toBe("google/lyria-3");
    expect(catalog.three_d.default_id).toBeUndefined();
    expect(catalog.three_d.ordered_models()[0].id).toBe(
      "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d"
    );
    expect(
      catalog.three_d
        .ordered_models()
        .filter((c) => c.input.type === "image")[0].id
    ).toBe("fal-ai/hunyuan-3d/v3.1/pro/image-to-3d");
    expect(catalog.audio.sound_effects.ordered_models()).toHaveLength(1);
    expect(catalog.audio.text_to_speech.ordered_models()).toHaveLength(1);
    expect(catalog.image.ordered_models()[1].id).toBe(
      "openai/gpt-image-2.5-sunburst"
    );
  });
  it("round trips preferences and resolves the default from the same snapshot as membership", () => {
    const seed = catalog.snapshot.seed();
    seed.preferences!.image = {
      default_id: "bfl/flux-2-pro",
      order: ["bfl/flux-2-max"],
    };
    const parsed = catalog.snapshot.parse(JSON.parse(JSON.stringify(seed)))!;
    const view = catalog.snapshot.view(parsed);
    expect(view.image.default_id).toBe("bfl/flux-2-pro");
    expect(
      view.image
        .listed()
        .slice(0, 2)
        .map((card) => card.id)
    ).toEqual(["bfl/flux-2-pro", "bfl/flux-2-max"]);
    expect(view.default_id).toBe(catalog.text.default_id);
  });

  it("leaves omitted defaults absent on older snapshots", () => {
    const seed = catalog.snapshot.seed();
    delete seed.preferences;
    const view = catalog.snapshot.view(catalog.snapshot.parse(seed)!);
    expect(view).not.toHaveProperty("default_id");
    expect(view.image).not.toHaveProperty("default_id");
  });

  it.each([
    { default_id: "unknown/model" },
    { default_id: "openai/gpt-image-2" },
    { default_id: "black-forest-labs/flux-schnell" },
    { order: ["bfl/flux-2-pro", "bfl/flux-2-pro"] },
    { order: ["unknown/model"] },
  ])("rejects invalid recommendations without applying them: %j", (image) => {
    const seed = catalog.snapshot.seed();
    seed.preferences = { image };
    expect(catalog.snapshot.parse(seed)).toBeNull();
  });

  it("does not let callers mutate a snapshot view or change it through the input", () => {
    const seed = catalog.snapshot.seed();
    const view = catalog.snapshot.view(seed);
    const id = catalog.text.default_id!;
    seed.text.catalog[id].cost.input = 999;
    expect(view.catalog[id].cost.input).not.toBe(999);
    expect(() => {
      view.catalog[id].cost.input = 999;
    }).toThrow(TypeError);
    expect(() => {
      view.image.models[
        catalog.image.default_id!
      ].providers.vercel!.pricing.type = "invalid" as never;
    }).toThrow(TypeError);
    expect(catalog.snapshot.seed().text.catalog[id].cost.input).not.toBe(999);
  });
});
