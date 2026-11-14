import { describe, expect, it } from "vitest";
import { ComposerDraftBinding } from "./composer-draft-binding";

describe("ComposerDraftBinding", () => {
  it("switches drafts when the chat changes outside a send", () => {
    const binding = new ComposerDraftBinding();
    expect(binding.meet("w:a")).toBe("switch");
    binding.restored("w:a");
    expect(binding.meet("w:a")).toBe("held");
    expect(binding.meet("w:b")).toBe("switch");
    expect(binding.held).toBe("w:a");
  });

  it("keeps the draft when a new chat is assigned its id during a send", () => {
    const binding = new ComposerDraftBinding();
    binding.restored("w:new");
    binding.send("w:new");
    expect(binding.meet("w:chat")).toBe("renamed");
    expect(binding.held).toBe("w:chat");
    expect(binding.meet("w:chat")).toBe("held");
    // A refused send leaves the draft under the chat's key; an accepted one
    // clears it wherever it is kept now.
    expect(binding.settle("w:new")).toEqual(["w:new", "w:chat"]);
    expect(binding.settle("w:new")).toEqual(["w:new"]);
    expect(binding.meet("w:other")).toBe("switch");
  });
});
