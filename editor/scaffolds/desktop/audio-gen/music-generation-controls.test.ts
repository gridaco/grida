// GRIDA-GG: desktop — focused renderer recovery tests for hosted music.
import { describe, expect, it, vi } from "vitest";
import type {
  MusicGenerateRequest,
  MusicGenerateResult,
} from "@/lib/desktop/bridge";
import type { GridaGatewaySessionState } from "@/lib/desktop/gg-session";
import {
  generateMusicWithGgRecovery,
  musicModelChoices,
} from "./music-generation-controls";
import { catalog } from "@grida/ai/catalogue";
import type { CurrentGGModel } from "@/lib/desktop/gg-models";

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
  it.each([
    Object.assign(new Error("gg_token_expired"), {
      request_id: "req_accepted",
    }),
    new Error("gg_token_expired GG request: req_accepted."),
  ])(
    "recovers an accepted job with the same ID instead of another paid generation",
    async (failure) => {
      const generate = vi.fn<Generate>();
      generate.mockRejectedValueOnce(failure).mockResolvedValueOnce(generated);
      const forceRefresh = vi
        .fn<ForceRefresh>()
        .mockResolvedValue(activeSession);
      await expect(
        generateMusicWithGgRecovery(request, { generate, forceRefresh })
      ).resolves.toBe(generated);
      expect(generate).toHaveBeenCalledTimes(2);
      expect(generate).toHaveBeenNthCalledWith(2, {
        ...request,
        request_id: "req_accepted",
      });
    }
  );
  it("keeps accepted identity visible if free recovery also fails", async () => {
    const generate = vi.fn<Generate>();
    generate
      .mockRejectedValueOnce(
        new Error("gg_token_expired GG request: req_accepted.")
      )
      .mockRejectedValueOnce(new Error("network unavailable"));
    const forceRefresh = vi.fn<ForceRefresh>().mockResolvedValue(activeSession);
    await expect(
      generateMusicWithGgRecovery(request, { generate, forceRefresh })
    ).rejects.toMatchObject({
      request_id: "req_accepted",
      message: "network unavailable GG request: req_accepted.",
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("retains the accepted ID when session recovery cannot sign in", async () => {
    const generate = vi
      .fn<Generate>()
      .mockRejectedValueOnce(
        new Error("gg_token_expired GG request: req_accepted.")
      );
    const forceRefresh = vi
      .fn<ForceRefresh>()
      .mockResolvedValue({ kind: "signed_out" });
    await expect(
      generateMusicWithGgRecovery(request, { generate, forceRefresh })
    ).rejects.toMatchObject({ request_id: "req_accepted" });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("music offerings across released Desktop bridges", () => {
  it("keeps the previous preset UI only for a binary without discovery", () => {
    const installed = catalog.audio.music.listed_models();
    expect(musicModelChoices(null)).toEqual(installed);
    const selected = installed[0]!;
    expect(musicModelChoices(null, [selected.id])).toEqual([selected]);
    expect(musicModelChoices(null, [])).toEqual([]);
  });
  it("does not restore installed music after a new bridge reports no offering", () => {
    expect(musicModelChoices([])).toEqual([]);
  });
  it("allows a current compatible GG music ID without a preset entry", () => {
    const current: CurrentGGModel = {
      id: "fixture/new-music",
      label: "New music",
      kind: "music",
      created: 0,
      owned_by: "fixture",
      interfaces: ["endpoints"],
      input_modalities: ["text"],
      output_modalities: ["audio"],
      operation_ids: ["music.fixture.new-music.generate"],
      capabilities: {},
      limits: {},
    };
    expect(musicModelChoices([current])).toEqual([current]);
  });
});
