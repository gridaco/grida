import { describe, expect, it } from "vitest";
import { catalog } from "@grida/ai/catalogue";
import { NativeChatProfiles } from "./native-chat-profiles";

describe("NativeChatProfiles.outputLimit", () => {
  it("gives an own-key launch the model's catalogue output limit, bounded by the agent", () => {
    const entry = catalog.text.catalog["openai/gpt-6.1-terra"];
    expect(entry.outputLimit).toBeGreaterThan(65_536);
    // A long reply, such as a large file in one tool call, is not cut off at
    // a small fixed allowance.
    expect(NativeChatProfiles.outputLimit("openai/gpt-6.1-terra")).toBe(65_536);
    const models = Object.values(catalog.text.catalog);
    expect(models.map(({ id }) => NativeChatProfiles.outputLimit(id))).toEqual(
      models.map(({ outputLimit }) =>
        outputLimit > 0 ? Math.min(outputLimit, 65_536) : undefined
      )
    );
  });

  it("keeps the agent default for a model the catalogue does not list", () => {
    expect(NativeChatProfiles.outputLimit("fixture")).toBeUndefined();
  });
});
