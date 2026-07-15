import models, { TIER_MODEL_IDS } from "..";

describe("models.text.modelSpecById", () => {
  it.each([
    {
      id: "openai/gpt-5.6-sol",
      label: "GPT-5.6 Sol",
    },
    {
      id: "openai/gpt-5.6-terra",
      label: "GPT-5.6 Terra",
    },
    {
      id: "openai/gpt-5.6-luna",
      label: "GPT-5.6 Luna",
    },
    {
      id: "anthropic/claude-fable-5",
      label: "Claude Fable 5",
    },
  ])("resolves the exact $id gateway id", ({ id, label }) => {
    const spec = models.text.modelSpecById(id);
    expect(spec?.id).toBe(id);
    expect(spec?.label).toBe(label);
  });

  it("resolves a bare provider id", () => {
    const spec = models.text.modelSpecById("gpt-5.4-mini");
    expect(spec?.id).toBe("openai/gpt-5.4-mini");
  });

  it("tolerates a snapshot date suffix on a bare id", () => {
    // Providers often append a snapshot date to the model id in
    // streaming response payloads.
    const spec = models.text.modelSpecById("gpt-5.4-mini-2025-08-07");
    expect(spec?.id).toBe("openai/gpt-5.4-mini");
  });

  it("returns undefined for an unknown id", () => {
    expect(models.text.modelSpecById("foo/bar-baz")).toBeUndefined();
  });

  it("returns undefined for a bare suffix without leading -<digit>", () => {
    // `gpt-5.4-miniature` is not a snapshot suffix — must not match
    // `openai/gpt-5.4-mini`.
    expect(models.text.modelSpecById("gpt-5.4-miniature")).toBeUndefined();
  });

  it("resolves every tier-mapped id to a real spec", () => {
    for (const tier of ["nano", "mini", "pro", "max"] as const) {
      const spec = models.text.modelSpecById(TIER_MODEL_IDS[tier]);
      expect(spec).toBeDefined();
      expect(spec?.id).toBe(TIER_MODEL_IDS[tier]);
    }
  });
});
