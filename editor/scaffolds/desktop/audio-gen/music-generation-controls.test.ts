// GRIDA-GG: desktop — focused renderer recovery tests for hosted music.
import { describe, expect, it, vi } from "vitest";
import type {
  MusicGenerateRequest,
  MusicGenerateResult,
} from "@/lib/desktop/bridge";
import type { GridaGatewaySessionState } from "@/lib/desktop/gg-session";
import { generateMusicWithGgRecovery } from "./music-generation-controls";

type Generate = (req: MusicGenerateRequest) => Promise<MusicGenerateResult>;
type ForceRefresh = () => Promise<GridaGatewaySessionState>;

const request = {
  model_id: "google/lyria-3",
  prompt: "A bright arcade victory theme",
} satisfies MusicGenerateRequest;

const generated = {
  model_id: "google/lyria-3",
  provider_id: "gg",
  audio: {
    base64: "AA==",
    media_type: "audio/mpeg",
    file_name: "victory.mp3",
  },
} satisfies MusicGenerateResult;

const activeSession = {
  kind: "active",
  expires_at: Date.now() + 900_000,
  organization: { id: 7, name: "acme" },
} as const;

describe("generateMusicWithGgRecovery", () => {
  it("returns a successful first attempt without refreshing", async () => {
    const generate = vi.fn<Generate>().mockResolvedValue(generated);
    const forceRefresh = vi.fn<ForceRefresh>().mockResolvedValue(activeSession);

    await expect(
      generateMusicWithGgRecovery(request, { generate, forceRefresh })
    ).resolves.toBe(generated);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(forceRefresh).not.toHaveBeenCalled();
  });

  it("refreshes and retries once for the shared gg_token_expired message", async () => {
    const generate = vi.fn<Generate>();
    generate
      .mockRejectedValueOnce(
        new Error(
          "[grida] /audio/music/generate: gg_token_expired: the pushed session is missing"
        )
      )
      .mockResolvedValueOnce(generated);
    const forceRefresh = vi.fn<ForceRefresh>().mockResolvedValue(activeSession);

    await expect(
      generateMusicWithGgRecovery(request, { generate, forceRefresh })
    ).resolves.toBe(generated);
    expect(forceRefresh).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenNthCalledWith(1, request);
    expect(generate).toHaveBeenNthCalledWith(2, request);
  });

  it("does not retry when refresh cannot restore an active session", async () => {
    const generate = vi
      .fn<Generate>()
      .mockRejectedValueOnce(new Error("gg_token_expired"));
    const forceRefresh = vi
      .fn<ForceRefresh>()
      .mockResolvedValue({ kind: "signed_out" });

    await expect(
      generateMusicWithGgRecovery(request, { generate, forceRefresh })
    ).rejects.toThrow("Sign in to Grida to generate music.");
    expect(forceRefresh).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("never refreshes or retries an unrelated failure", async () => {
    const failure = new Error("provider unavailable");
    const generate = vi.fn<Generate>().mockRejectedValue(failure);
    const forceRefresh = vi.fn<ForceRefresh>().mockResolvedValue(activeSession);

    await expect(
      generateMusicWithGgRecovery(request, { generate, forceRefresh })
    ).rejects.toBe(failure);
    expect(forceRefresh).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("lets a second token failure surface after exactly one retry", async () => {
    const generate = vi.fn<Generate>();
    generate
      .mockRejectedValueOnce(new Error("gg_token_expired: first"))
      .mockRejectedValueOnce(new Error("gg_token_expired: second"));
    const forceRefresh = vi.fn<ForceRefresh>().mockResolvedValue(activeSession);

    await expect(
      generateMusicWithGgRecovery(request, { generate, forceRefresh })
    ).rejects.toThrow("gg_token_expired: second");
    expect(forceRefresh).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
