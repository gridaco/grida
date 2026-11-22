import { describe, expect, it } from "vitest";
import { ComposerDraftBinding } from "./composer-draft-binding";

describe("ComposerDraftBinding", () => {
  it("switches drafts when the chat changes without a promotion", () => {
    const binding = new ComposerDraftBinding();
    expect(binding.meet("w:a")).toBe("switch");
    binding.restored("w:a");
    expect(binding.meet("w:a")).toBe("held");
    expect(binding.meet("w:b")).toBe("switch");
    expect(binding.held).toBe("w:a");
  });

  it("recognizes only a promotion from the held draft", () => {
    const binding = new ComposerDraftBinding();
    binding.restored("w:new");
    expect(binding.meet("w:other")).toBe("switch");
    expect(binding.meet("w:chat", "w:some-other-draft")).toBe("switch");
    expect(binding.meet("w:chat", "w:new")).toBe("promoted");
    binding.restored("w:chat");
    expect(binding.meet("w:chat")).toBe("held");
  });
});
