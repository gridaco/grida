import { catalog, TIER_MODEL_IDS } from "../../src/grida";
import { models } from "../../src";
import { schema1 } from "../../src/grida/compatibility";

const snapshot = catalog.snapshot;
const additions = [
  "openai/gpt-6-sol",
  "openai/gpt-6-luna",
  "anthropic/claude-opus-5.5",
];
const compatibleIds = [
  "openai/gpt-5.5",
  "openai/gpt-5.5-pro",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "openai/gpt-6-astra",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-fable-5.1",
  "anthropic/claude-fable-5",
  "anthropic/claude-opus-5",
  "anthropic/claude-opus-4.8",
  "google/gemini-3.8-flash",
  "google/gemini-3.7-flash",
  "google/gemini-3.1-pro-preview",
];

describe("catalog.snapshot versioned admission", () => {
  it("retains the complete schema-1 membership and admits exactly three new current models", () => {
    const old = snapshot.seed();
    const current = snapshot.v2.seed();
    expect(Object.keys(old.text.catalog).sort()).toEqual(compatibleIds.sort());
    expect(Object.keys(current.text.catalog).sort()).toEqual(
      [...compatibleIds, ...additions].sort()
    );
    for (const id of compatibleIds) {
      expect(current.text.catalog[id]).toEqual(old.text.catalog[id]);
    }
    expect(current.text.catalog).toEqual(catalog.text.catalog);
    expect(current.text.tier_model_ids).toEqual(TIER_MODEL_IDS);
    expect(snapshot.v2.view().default_id).toBe("openai/gpt-6-sol");
    expect(snapshot.view().default_id).toBe("openai/gpt-5.6-terra");
    expect(snapshot.v2.view()).toBe(snapshot.v2.view());
  });

  it("rejects current admission in the old reader and round trips both versions in the new reader", () => {
    const current = snapshot.v2.seed({ version: "release" });
    expect(current.schema).toBe(2);
    expect(current.version).toBe("release");
    expect(snapshot.parse(current)).toBeNull();
    for (const seeded of [snapshot.seed(), current]) {
      const parsed = snapshot.v2.parse(JSON.parse(JSON.stringify(seeded)))!;
      expect(parsed).toEqual(seeded);
      expect(snapshot.v2.view(parsed).catalog).toEqual(seeded.text.catalog);
    }
    const fallback = snapshot.v2.view(snapshot.v2.parse(snapshot.seed())!);
    expect(fallback.has("openai/gpt-6-sol")).toBe(false);
    expect(fallback.default_id).toBe("openai/gpt-5.6-terra");
  });

  it.each([null, [], {}, { schema: 3 }, { schema: "2" }])(
    "rejects malformed or unsupported current envelopes: %j",
    (data) => expect(snapshot.v2.parse(data)).toBeNull()
  );

  it("rejects dangling current tiers and recommendations", () => {
    const current = snapshot.v2.seed();
    delete current.text.catalog["openai/gpt-6-sol"];
    expect(snapshot.v2.parse(current)).toBeNull();
    current.text.tier_model_ids.mini = current.text.tier_model_ids.nano;
    current.text.tier_model_ids.pro = current.text.tier_model_ids.nano;
    expect(snapshot.v2.parse(current)).toBeNull();
    delete current.preferences!.text;
    const view = snapshot.v2.view(snapshot.v2.parse(current)!);
    expect(view.has("openai/gpt-6-sol")).toBe(false);
    expect(view.default_id).toBeUndefined();
  });

  it("shares media payloads and preserves independent rejection and fallback", () => {
    const old = snapshot.seed();
    const current = snapshot.v2.seed();
    expect(current.image).toEqual(old.image);
    expect(current.video).toEqual(old.video);
    current.image = { models: {} };
    current.preferences!.image = { default_id: "unknown/image" };
    const parsed = snapshot.v2.parse(current)!;
    expect(parsed).not.toBeNull();
    expect(parsed.image).toBeUndefined();
    expect(parsed.preferences!.image).toBeUndefined();
    const view = snapshot.v2.view(parsed);
    expect(view.image.models).toEqual(catalog.image.models);
    expect(view.default_id).toBe("openai/gpt-6-sol");
    expect(parsed.video).toEqual(old.video);
  });
});

describe("schema-1 compatibility policy", () => {
  it("projects fresh prices and inherited lifecycle from current admitted cards", () => {
    const current = snapshot.v2.seed();
    const id = "anthropic/claude-opus-5";
    expect(current.text.catalog[id].cost).toEqual(models.text.catalog[id].cost);
    current.text.catalog[id].cost.input = 123;
    current.text.catalog[id].deprecated = true;
    const old = schema1.project(current);
    expect(old.text.catalog[id].cost.input).toBe(123);
    expect(old.text.catalog[id].deprecated).toBe(true);
    expect(snapshot.parse(old)).not.toBeNull();
  });

  it("cannot restore withdrawn membership, including a former tier and recommendation", () => {
    const current = snapshot.v2.seed();
    delete current.text.catalog["anthropic/claude-opus-5"];
    delete current.text.catalog["openai/gpt-5.6-terra"];
    const old = schema1.project(current);
    expect(old.text.catalog["anthropic/claude-opus-5"]).toBeUndefined();
    expect(old.text.catalog["openai/gpt-5.6-terra"]).toBeUndefined();
    expect(old.text.tier_model_ids.mini).toBe("openai/gpt-5.6-sol");
    expect(old.preferences!.text).not.toHaveProperty("default_id");
    expect(snapshot.parse(old)).not.toBeNull();
  });

  it("omits the old recommendation when it becomes legacy without withdrawing its membership", () => {
    const current = snapshot.v2.seed();
    current.text.catalog["openai/gpt-5.6-terra"].deprecated = true;
    const old = schema1.project(current);
    expect(old.preferences!.text).not.toHaveProperty("default_id");
    expect(old.text.catalog["openai/gpt-5.6-terra"]).toBeDefined();
  });

  it("refuses publication when every declared compatible tier target is withdrawn", () => {
    const current = snapshot.v2.seed();
    for (const id of [
      "openai/gpt-5.6-luna",
      "openai/gpt-5.6-terra",
      "openai/gpt-5.6-sol",
      "openai/gpt-6-astra",
    ])
      delete current.text.catalog[id];
    expect(() => schema1.project(current)).toThrow(
      "No schema-1-compatible tier model"
    );
  });
});
