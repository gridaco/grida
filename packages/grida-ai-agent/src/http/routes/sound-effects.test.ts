import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import type { GeneratedMp3 } from "../../protocol/generated-mp3";
import type { SoundEffectGenerateRequest } from "../../protocol/sound-effects";

const soundEffectGenerate = vi.hoisted(() =>
  vi.fn<
    (
      request: SoundEffectGenerateRequest,
      signal?: AbortSignal
    ) => Promise<GeneratedMp3>
  >()
);

vi.mock("../../providers/elevenlabs-sound-effects", () => ({
  ElevenLabsSoundEffectProvider: class {
    generate = soundEffectGenerate;
  },
}));

import { registerSoundEffectsRoutes } from "./sound-effects";

function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

function appWith(options: {
  keys?: Record<string, string>;
  media?: MediaPersistence;
}) {
  const app = new Hono();
  registerSoundEffectsRoutes(app, {
    secrets: fakeSecrets(options.keys ?? {}),
    media: options.media,
  });
  return app;
}

function post(app: Hono, payload: unknown) {
  return app.request("/audio/sound-effects/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  soundEffectGenerate.mockReset();
});

describe("sound-effects generation route", () => {
  it("serves ElevenLabs sound effects and enforces duration bounds", async () => {
    soundEffectGenerate.mockResolvedValueOnce({
      base64: "SUQz",
      media_type: "audio/mpeg",
      file_name: "sound-effect.mp3",
    });
    const app = appWith({ keys: { elevenlabs: "key" } });
    const ok = await post(app, {
      model_id: "eleven_text_to_sound_v2",
      prompt: "door slam",
      duration_seconds: 2,
    });
    const short = await post(app, {
      model_id: "eleven_text_to_sound_v2",
      prompt: "door slam",
      duration_seconds: 0.49,
    });
    const long = await post(app, {
      model_id: "eleven_text_to_sound_v2",
      prompt: "door slam",
      duration_seconds: 30.01,
    });

    expect(ok.status).toBe(200);
    expect((await ok.json()).provider_id).toBe("elevenlabs");
    expect(short.status).toBe(400);
    expect(long.status).toBe(400);
  });

  it("persists the normalized MP3 when the host supplies storage", async () => {
    const stored: MediaItem = {
      id: "cbb1523d-e740-45fd-bbac-17610609d062",
      file_name: "sound-effect.mp3",
      media_type: "audio/mpeg",
      byte_size: 3,
      created_at: 2,
    };
    const save = vi.fn<MediaPersistence["save"]>().mockResolvedValue(stored);
    soundEffectGenerate.mockResolvedValueOnce({
      base64: "SUQz",
      media_type: "audio/mpeg",
      file_name: "sound-effect.mp3",
    });

    const res = await post(
      appWith({ keys: { elevenlabs: "key" }, media: { save } }),
      { model_id: "eleven_text_to_sound_v2", prompt: "bell" }
    );

    expect((await res.json()).stored_media).toEqual(stored);
    expect(save).toHaveBeenCalledWith({
      file_name: "sound-effect.mp3",
      media_type: "audio/mpeg",
      bytes: Buffer.from("ID3"),
    });
  });

  it("rejects unknown model ids and a missing ElevenLabs key", async () => {
    const unknown = await post(appWith({ keys: { elevenlabs: "key" } }), {
      model_id: "not-a-model",
      prompt: "x",
    });
    const missingKey = await post(appWith({}), {
      model_id: "eleven_text_to_sound_v2",
      prompt: "x",
    });

    expect(unknown.status).toBe(400);
    expect(missingKey.status).toBe(400);
    expect(await missingKey.json()).toMatchObject({
      code: "provider_key_required",
      provider_id: "elevenlabs",
    });
    expect(soundEffectGenerate).not.toHaveBeenCalled();
  });

  it("does not reflect upstream provider error bodies", async () => {
    const warning = vi.spyOn(console, "error").mockImplementation(() => {});
    soundEffectGenerate.mockRejectedValueOnce(
      new Error("upstream leaked secret response body")
    );
    const res = await post(appWith({ keys: { elevenlabs: "key" } }), {
      model_id: "eleven_text_to_sound_v2",
      prompt: "x",
    });

    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("leaked secret response body");
    warning.mockRestore();
  });
});
