import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import type { GridaGatewaySessionStore } from "../../providers/gg-session";
import type {
  GeneratedAudio,
  MusicGenerateRequest,
  MusicGenerateResult,
  SoundEffectGenerateRequest,
} from "../../protocol/audio";

const musicGenerate = vi.hoisted(() =>
  vi.fn<
    (
      request: MusicGenerateRequest,
      signal?: AbortSignal
    ) => Promise<MusicGenerateResult>
  >()
);
const soundEffectGenerate = vi.hoisted(() =>
  vi.fn<
    (
      request: SoundEffectGenerateRequest,
      signal?: AbortSignal
    ) => Promise<GeneratedAudio>
  >()
);
vi.mock("../../providers/gg-media", () => ({
  GridaGatewayMusicProvider: class {
    generate = musicGenerate;
  },
}));
vi.mock("../../providers/audio-byok", () => ({
  ElevenLabsSoundEffectProvider: class {
    generate = soundEffectGenerate;
  },
}));

import { registerAudioRoutes } from "./audio";

function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

function appWith(options: {
  keys?: Record<string, string>;
  hosted?: boolean;
  media?: MediaPersistence;
}) {
  const app = new Hono();
  registerAudioRoutes(app, {
    secrets: fakeSecrets(options.keys ?? {}),
    media: options.media,
    ...(options.hosted
      ? {
          gg: {} as GridaGatewaySessionStore,
          gg_base_url: "https://grida.test",
        }
      : {}),
  });
  return app;
}

function post(app: Hono, path: string, payload: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  musicGenerate.mockReset();
  soundEffectGenerate.mockReset();
});

describe("audio generation routes", () => {
  it("serves hosted music bytes through its distinct route", async () => {
    musicGenerate.mockResolvedValueOnce({
      model_id: "google/lyria-3",
      provider_id: "gg",
      audio: {
        base64: "SUQz",
        media_type: "audio/mpeg",
        file_name: "music.mp3",
      },
    });
    const res = await post(appWith({ hosted: true }), "/audio/music/generate", {
      model_id: "google/lyria-3",
      prompt: "  clockwork percussion  ",
      seed: 4,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).provider_id).toBe("gg");
    expect(musicGenerate).toHaveBeenCalledWith(
      {
        model_id: "google/lyria-3",
        prompt: "clockwork percussion",
        seed: 4,
      },
      expect.any(AbortSignal)
    );
  });

  it("saves music and sound effects into the same format-oriented store", async () => {
    const musicStored: MediaItem = {
      id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
      file_name: "music.mp3",
      media_type: "audio/mpeg",
      byte_size: 3,
      created_at: 1,
    };
    const soundEffectStored: MediaItem = {
      ...musicStored,
      id: "cbb1523d-e740-45fd-bbac-17610609d062",
      file_name: "sound-effect.mp3",
      created_at: 2,
    };
    const save = vi.fn<MediaPersistence["save"]>();
    save
      .mockResolvedValueOnce(musicStored)
      .mockResolvedValueOnce(soundEffectStored);
    musicGenerate.mockResolvedValueOnce({
      model_id: "google/lyria-3",
      provider_id: "gg",
      audio: {
        base64: "SUQz",
        media_type: "audio/mpeg",
        file_name: "music.mp3",
      },
    });
    soundEffectGenerate.mockResolvedValueOnce({
      base64: "SUQz",
      media_type: "audio/mpeg",
      file_name: "sound-effect.mp3",
    });

    const music = await post(
      appWith({ hosted: true, media: { save } }),
      "/audio/music/generate",
      { model_id: "google/lyria-3", prompt: "bells" }
    );
    const soundEffect = await post(
      appWith({
        keys: { elevenlabs: "key" },
        media: { save },
      }),
      "/audio/sound-effects/generate",
      { model_id: "eleven_text_to_sound_v2", prompt: "bell" }
    );

    expect((await music.json()).stored_media).toEqual(musicStored);
    expect((await soundEffect.json()).stored_media).toEqual(soundEffectStored);
    expect(save).toHaveBeenNthCalledWith(1, {
      file_name: "music.mp3",
      media_type: "audio/mpeg",
      bytes: Buffer.from("ID3"),
    });
    expect(save).toHaveBeenNthCalledWith(2, {
      file_name: "sound-effect.mp3",
      media_type: "audio/mpeg",
      bytes: Buffer.from("ID3"),
    });
  });

  it("matches the hosted music prompt boundary of 4,096 characters", async () => {
    musicGenerate.mockResolvedValueOnce({
      model_id: "google/lyria-3",
      provider_id: "gg",
      audio: {
        base64: "SUQz",
        media_type: "audio/mpeg",
        file_name: "music.mp3",
      },
    });
    const app = appWith({ hosted: true });
    const accepted = await post(app, "/audio/music/generate", {
      model_id: "google/lyria-3",
      prompt: "a".repeat(4_096),
    });
    const rejected = await post(app, "/audio/music/generate", {
      model_id: "google/lyria-3",
      prompt: "a".repeat(4_097),
    });

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({
      error: "prompt must not exceed 4096 characters",
    });
    expect(musicGenerate).toHaveBeenCalledTimes(1);
  });

  it("serves ElevenLabs sound effects and enforces duration bounds", async () => {
    soundEffectGenerate.mockResolvedValueOnce({
      base64: "SUQz",
      media_type: "audio/mpeg",
      file_name: "sound-effect.mp3",
    });
    const app = appWith({ keys: { elevenlabs: "key" } });
    const ok = await post(app, "/audio/sound-effects/generate", {
      model_id: "eleven_text_to_sound_v2",
      prompt: "door slam",
      duration_seconds: 2,
    });
    const short = await post(app, "/audio/sound-effects/generate", {
      model_id: "eleven_text_to_sound_v2",
      prompt: "door slam",
      duration_seconds: 0.49,
    });
    const long = await post(app, "/audio/sound-effects/generate", {
      model_id: "eleven_text_to_sound_v2",
      prompt: "door slam",
      duration_seconds: 30.01,
    });

    expect(ok.status).toBe(200);
    expect((await ok.json()).provider_id).toBe("elevenlabs");
    expect(short.status).toBe(400);
    expect(long.status).toBe(400);
  });

  it("rejects unknown model ids, missing keys, and unavailable hosted music", async () => {
    const unknown = await post(
      appWith({ keys: { elevenlabs: "key" } }),
      "/audio/sound-effects/generate",
      { model_id: "not-a-model", prompt: "x" }
    );
    const missingKey = await post(
      appWith({}),
      "/audio/sound-effects/generate",
      { model_id: "eleven_text_to_sound_v2", prompt: "x" }
    );
    const noHosted = await post(appWith({}), "/audio/music/generate", {
      model_id: "google/lyria-3",
      prompt: "x",
    });

    expect(unknown.status).toBe(400);
    expect(missingKey.status).toBe(400);
    expect(noHosted.status).toBe(400);
    expect(soundEffectGenerate).not.toHaveBeenCalled();
    expect(musicGenerate).not.toHaveBeenCalled();
  });

  it("does not reflect upstream provider error bodies", async () => {
    const warning = vi.spyOn(console, "error").mockImplementation(() => {});
    soundEffectGenerate.mockRejectedValueOnce(
      new Error("upstream leaked secret response body")
    );
    const res = await post(
      appWith({ keys: { elevenlabs: "key" } }),
      "/audio/sound-effects/generate",
      { model_id: "eleven_text_to_sound_v2", prompt: "x" }
    );
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("leaked secret response body");
    warning.mockRestore();
  });

  it.each([
    {
      code: "gg_token_expired",
      status: 401,
      expected: "gg_token_expired: Grida session expired",
    },
    {
      code: "insufficient_credits",
      status: 402,
      expected: "insufficient_credits: insufficient AI credits",
    },
  ])(
    "leads hosted $code wire errors with their detectable code",
    async (test) => {
      musicGenerate.mockRejectedValueOnce(
        Object.assign(new Error("typed hosted failure"), { code: test.code })
      );
      const res = await post(
        appWith({ hosted: true }),
        "/audio/music/generate",
        {
          model_id: "google/lyria-3",
          prompt: "x",
        }
      );

      expect(res.status).toBe(test.status);
      expect(await res.json()).toEqual({
        error: test.expected,
        code: test.code,
        provider_id: "gg",
      });
    }
  );
});
