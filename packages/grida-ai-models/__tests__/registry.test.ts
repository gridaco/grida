import { describe, expect, it } from "vitest";
import models from "../src";

const registry = models.text.registry;

describe("models.text.registry.normalize", () => {
  it("fills defaults for a bare id", () => {
    const spec = registry.normalize({ id: "llama3.1:8b" });
    expect(spec).toEqual({
      id: "llama3.1:8b",
      label: "llama3.1:8b",
      multimodal: false,
      tool_call: true,
      contextWindow: registry.CUSTOM_MODEL_DEFAULTS.contextWindow,
      outputLimit: registry.CUSTOM_MODEL_DEFAULTS.outputLimit,
      cost: undefined,
      custom: true,
    });
  });

  it("keeps explicit fields, including tool_call: false", () => {
    const spec = registry.normalize({
      id: "qwen3:32b",
      label: "Qwen 3 32B",
      tool_call: false,
      contextWindow: 131_072,
      outputLimit: 8_192,
      multimodal: true,
    });
    expect(spec.label).toBe("Qwen 3 32B");
    expect(spec.tool_call).toBe(false);
    expect(spec.contextWindow).toBe(131_072);
    expect(spec.outputLimit).toBe(8_192);
    expect(spec.multimodal).toBe(true);
  });

  it("treats an empty label as absent", () => {
    expect(registry.normalize({ id: "m", label: "" }).label).toBe("m");
  });
});

describe("models.text.registry.resolve", () => {
  const custom = [
    { id: "llama3.1:8b" },
    { id: "anthropic/claude-sonnet-4.6", label: "shadowed" },
  ];

  it("resolves a catalogue id with custom: false and cost present", () => {
    const spec = registry.resolve("anthropic/claude-opus-4.8", custom);
    expect(spec?.custom).toBe(false);
    expect(spec?.cost).toBeDefined();
    expect(spec?.tool_call).toBe(true);
  });

  it("resolves a registered local id with normalized defaults", () => {
    const spec = registry.resolve("llama3.1:8b", custom);
    expect(spec?.custom).toBe(true);
    expect(spec?.cost).toBeUndefined();
    expect(spec?.contextWindow).toBe(
      registry.CUSTOM_MODEL_DEFAULTS.contextWindow
    );
  });

  it("catalogue wins over a colliding custom entry", () => {
    const spec = registry.resolve("anthropic/claude-sonnet-4.6", custom);
    expect(spec?.custom).toBe(false);
    expect(spec?.label).toBe("Claude Sonnet 4.6");
  });

  it("returns undefined for an unknown id", () => {
    expect(registry.resolve("nope:0b", custom)).toBeUndefined();
    expect(registry.resolve("nope:0b")).toBeUndefined();
  });

  it("does not fuzzy-match custom ids (exact only)", () => {
    // Catalogue lookup tolerates bare/date-suffixed ids; custom must not.
    expect(registry.resolve("llama3.1", custom)).toBeUndefined();
  });
});

describe("catalogue tool_call flags", () => {
  it("every catalogue entry declares tool_call explicitly", () => {
    for (const spec of Object.values(models.text.catalog)) {
      expect(typeof spec.tool_call).toBe("boolean");
    }
  });
});
