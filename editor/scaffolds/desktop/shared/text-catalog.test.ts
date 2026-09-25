import { catalog } from "@grida/ai-models/grida";
import { describe, expect, it } from "vitest";
import { desktop_text_catalog } from "./text-catalog";

describe("desktop_text_catalog", () => {
  it.each([undefined, false])(
    "keeps legacy admission and tiers without an affirmative capability (%s)",
    (capability) => {
      const view = desktop_text_catalog.view(capability);
      expect(view).toBe(catalog.snapshot.view());
      expect(view.has("openai/gpt-6-sol")).toBe(false);
      expect(view.has("openai/gpt-6-luna")).toBe(false);
      expect(view.has("anthropic/claude-opus-5.5")).toBe(false);
      expect(view.tier_model_ids.pro).toBe("openai/gpt-5.6-sol");
      expect(view.default_id).toBe("openai/gpt-5.6-terra");
    }
  );

  it("uses the current service view only for a capable runtime", () => {
    const view = desktop_text_catalog.view(true);
    expect(view).toBe(catalog.snapshot.v2.view());
    expect(view.has("openai/gpt-6-sol")).toBe(true);
    expect(view.has("openai/gpt-6-luna")).toBe(true);
    expect(view.has("anthropic/claude-opus-5.5")).toBe(true);
    expect(view.tier_model_ids).toEqual({
      nano: "openai/gpt-6-luna",
      mini: "openai/gpt-6-sol",
      pro: "openai/gpt-6-sol",
      max: "openai/gpt-6-astra",
    });
    expect(desktop_text_catalog.defaultId(true)).toBe("openai/gpt-6-sol");
  });
});
