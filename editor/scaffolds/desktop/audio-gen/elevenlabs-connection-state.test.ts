import { describe, expect, it, vi } from "vitest";
import { ElevenLabsConnection } from "./elevenlabs-connection-state";

describe("ElevenLabsConnection", () => {
  it.each([
    [true, "connected"],
    [false, "missing"],
  ] as const)("maps key presence %s to %s", async (present, kind) => {
    const hasKey = vi.fn<ElevenLabsConnection.PresenceProbe>(
      async () => present
    );

    await expect(ElevenLabsConnection.probe(hasKey)).resolves.toEqual({ kind });
    expect(hasKey).toHaveBeenCalledOnce();
  });

  it("keeps a failed probe distinct from a confirmed missing key", async () => {
    const hasKey = vi.fn<ElevenLabsConnection.PresenceProbe>(async () => {
      throw new Error("bridge unavailable");
    });

    await expect(ElevenLabsConnection.probe(hasKey)).resolves.toEqual({
      kind: "error",
    });
  });
});
