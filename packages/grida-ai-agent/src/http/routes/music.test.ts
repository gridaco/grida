import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence } from "@grida/daemon/server";
import type { GridaGatewaySessionStore } from "../../providers/gg-session";
import type {
  MusicGenerateRequest,
  MusicGenerateResult,
} from "../../protocol/music";

const musicGenerate = vi.hoisted(() =>
  vi.fn<
    (
      request: MusicGenerateRequest,
      signal?: AbortSignal
    ) => Promise<MusicGenerateResult>
  >()
);

vi.mock("../../providers/gg-media", () => ({
  GridaGatewayMusicProvider: class {
    generate = musicGenerate;
  },
}));

import { registerMusicRoutes } from "./music";

function appWith(options: { hosted?: boolean; media?: MediaPersistence }) {
  const app = new Hono();
  registerMusicRoutes(app, {
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

function post(app: Hono, payload: unknown) {
  return app.request("/audio/music/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  musicGenerate.mockReset();
});

describe("music generation route", () => {
  it("serves hosted music bytes through the exact route", async () => {
    musicGenerate.mockResolvedValueOnce({
      model_id: "google/lyria-3",
      provider_id: "gg",
      audio: {
        base64: "SUQz",
        media_type: "audio/mpeg",
        file_name: "music.mp3",
      },
    });
    const res = await post(appWith({ hosted: true }), {
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

  it("persists the normalized MP3 when the host supplies storage", async () => {
    const stored: MediaItem = {
      id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
      file_name: "music.mp3",
      media_type: "audio/mpeg",
      byte_size: 3,
      created_at: 1,
    };
    const save = vi.fn<MediaPersistence["save"]>().mockResolvedValue(stored);
    musicGenerate.mockResolvedValueOnce({
      model_id: "google/lyria-3",
      provider_id: "gg",
      audio: {
        base64: "SUQz",
        media_type: "audio/mpeg",
        file_name: "music.mp3",
      },
    });

    const res = await post(appWith({ hosted: true, media: { save } }), {
      model_id: "google/lyria-3",
      prompt: "bells",
    });

    expect((await res.json()).stored_media).toEqual(stored);
    expect(save).toHaveBeenCalledWith({
      file_name: "music.mp3",
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
    const accepted = await post(app, {
      model_id: "google/lyria-3",
      prompt: "a".repeat(4_096),
    });
    const rejected = await post(app, {
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

  it("rejects unknown models and an unavailable hosted session", async () => {
    const unknown = await post(appWith({ hosted: true }), {
      model_id: "not-a-model",
      prompt: "x",
    });
    const unavailable = await post(appWith({}), {
      model_id: "google/lyria-3",
      prompt: "x",
    });

    expect(unknown.status).toBe(400);
    expect(unavailable.status).toBe(400);
    expect(musicGenerate).not.toHaveBeenCalled();
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
      const res = await post(appWith({ hosted: true }), {
        model_id: "google/lyria-3",
        prompt: "x",
      });

      expect(res.status).toBe(test.status);
      expect(await res.json()).toEqual({
        error: test.expected,
        code: test.code,
        provider_id: "gg",
      });
    }
  );
});
