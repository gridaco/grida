import models, { TIER_MODEL_IDS } from "..";

describe("models.text.modelSpecById", () => {
  it.each([
    {
      id: "openai/gpt-6-astra",
      label: "GPT-6 Astra",
    },
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
    {
      id: "google/gemini-3.8-flash",
      label: "Gemini 3.8 Flash",
    },
  ])("resolves the exact $id gateway id", ({ id, label }) => {
    const spec = models.text.modelSpecById(id);
    expect(spec?.id).toBe(id);
    expect(spec?.label).toBe(label);
  });

  it("resolves a bare provider id", () => {
    const spec = models.text.modelSpecById("gpt-5.6-luna");
    expect(spec?.id).toBe("openai/gpt-5.6-luna");
  });

  it("tolerates a snapshot date suffix on a bare id", () => {
    // Providers often append a snapshot date to the model id in
    // streaming response payloads.
    const spec = models.text.modelSpecById("gpt-5.6-luna-2026-07-30");
    expect(spec?.id).toBe("openai/gpt-5.6-luna");
  });

  it("returns undefined for an unknown id", () => {
    expect(models.text.modelSpecById("foo/bar-baz")).toBeUndefined();
  });

  it("returns undefined for a bare suffix without leading -<digit>", () => {
    // `gpt-5.6-lunatic` is not a snapshot suffix — must not match
    // `openai/gpt-5.6-luna`.
    expect(models.text.modelSpecById("gpt-5.6-lunatic")).toBeUndefined();
  });

  it("resolves every tier-mapped id to a real spec", () => {
    for (const tier of ["nano", "mini", "pro", "max"] as const) {
      const spec = models.text.modelSpecById(TIER_MODEL_IDS[tier]);
      expect(spec).toBeDefined();
      expect(spec?.id).toBe(TIER_MODEL_IDS[tier]);
    }
  });
});
