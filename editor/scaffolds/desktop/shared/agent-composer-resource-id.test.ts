import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerCore } from "@/kits/composer/composer-core";
import { AgentComposerResourceId } from "./agent-composer-resource-id";

describe("AgentComposerResourceId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not reuse ids across remount-equivalent allocations", () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");

    const beforeRemount = new ComposerCore().addAttachment({
      id: AgentComposerResourceId.create("drop"),
      name: "screen.png",
    });
    const afterRemount = new ComposerCore().addAttachment({
      id: AgentComposerResourceId.create("drop"),
      name: "screen.png",
    });

    expect(beforeRemount?.id).toBe("drop-00000000-0000-4000-8000-000000000001");
    expect(afterRemount?.id).toBe("drop-00000000-0000-4000-8000-000000000002");
    expect(afterRemount?.id).not.toBe(beforeRemount?.id);
  });
});
