// GRIDA-SEC-004 — actual shared sound-effect operation with synthetic host capabilities.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ProviderHttp } from "@grida/ai";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { registerSoundEffectsRoutes } from "./sound-effects";

const MODEL = "eleven_text_to_sound_v2";
const KEY = "synthetic-elevenlabs-key";
const AUDIO = {
  base64: "SUQz",
  media_type: "audio/mpeg",
  file_name: "sound-effect.mp3",
};

function appWith(
  options: {
    key?: string | null;
    get?: (provider: string) => Promise<string | null>;
    request?: typeof globalThis.fetch;
    media?: MediaPersistence;
  } = {}
) {
  const get = vi.fn<(provider: string) => Promise<string | null>>(
    options.get ?? (async () => (options.key === undefined ? KEY : options.key))
  );
  const request = vi.fn<typeof globalThis.fetch>(
    options.request ??
      (async () =>
        new Response(new Uint8Array([0x49, 0x44, 0x33]), {
          headers: { "content-type": "audio/mpeg" },
        }))
  );
  const download = vi.fn<typeof globalThis.fetch>();
  const app = new Hono();
  registerSoundEffectsRoutes(app, {
    secrets: { _getKey: get } as unknown as SecretsStore,
    media: options.media,
    provider_http: new ProviderHttp({ request, download }),
  });
  return { app, get, request, download };
}

function post(app: Hono, payload: unknown, signal?: AbortSignal) {
  return app.request("/audio/sound-effects/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

describe("sound-effects generation route", () => {
  it("executes the staged binding with exact options, preserving false and zero", async () => {
    const { app, get, request, download } = appWith();
    const res = await post(app, {
      model_id: MODEL,
      prompt: "  a metal door closing  ",
      duration_seconds: 0.5,
      loop: false,
      prompt_influence: 0,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      model_id: MODEL,
      provider_id: "elevenlabs",
      audio: AUDIO,
    });
    expect(get.mock.calls).toEqual([["elevenlabs"], ["elevenlabs"]]);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("xi-api-key")).toBe(KEY);
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      model_id: MODEL,
      text: "a metal door closing",
      duration_seconds: 0.5,
      loop: false,
      prompt_influence: 0,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(download).not.toHaveBeenCalled();
  });

  it("keeps omitted provider options absent and uses the key reread for execution", async () => {
    const readKey = vi.fn<(provider: string) => Promise<string | null>>();
    readKey.mockResolvedValueOnce("old-key").mockResolvedValueOnce("new-key");
    const { app, request } = appWith({ get: readKey });
    const res = await post(app, { model_id: MODEL, prompt: "boom" });
    expect(res.status).toBe(200);
    const init = request.mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toEqual({
      model_id: MODEL,
      text: "boom",
    });
    expect(new Headers(init?.headers).get("xi-api-key")).toBe("new-key");
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([null, "", "  "])(
    "preserves the missing-key HTTP contract for %j",
    async (key) => {
      const { app, request } = appWith({ key });
      const res = await post(app, { model_id: MODEL, prompt: "x" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "no ElevenLabs key is connected",
        code: "provider_key_required",
        provider_id: "elevenlabs",
      });
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("does not submit when the key disappears between selection and execution", async () => {
    const get = vi.fn<(provider: string) => Promise<string | null>>();
    get.mockResolvedValueOnce(KEY).mockResolvedValueOnce(null);
    const { app, request } = appWith({ get });
    const res = await post(app, { model_id: MODEL, prompt: "x" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "provider_key_required",
      provider_id: "elevenlabs",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { model_id: "unknown", prompt: "x" },
    { model_id: MODEL },
    { model_id: MODEL, prompt: "   " },
    { model_id: MODEL, prompt: "x", duration_seconds: 0.49 },
    { model_id: MODEL, prompt: "x", duration_seconds: 30.01 },
    { model_id: MODEL, prompt: "x", prompt_influence: -0.01 },
    { model_id: MODEL, prompt: "x", prompt_influence: 1.01 },
    { model_id: MODEL, prompt: "x", loop: "false" },
  ])("rejects invalid input before provider I/O: %j", async (payload) => {
    const { app, request, download } = appWith();
    expect((await post(app, payload)).status).toBe(400);
    expect(request).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("uses the SDK's Unicode code-point limit rather than duplicating a string-length rule", async () => {
    const { app, request } = appWith();
    expect(
      (await post(app, { model_id: MODEL, prompt: "🎵".repeat(450) })).status
    ).toBe(200);
    const rejected = await post(app, {
      model_id: MODEL,
      prompt: "🎵".repeat(451),
    });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({
      error: "invalid sound-effect input",
      code: "invalid_input",
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it("persists only MP3 bytes with a fixed filename and returns the receipt at the root", async () => {
    const stored: MediaItem = {
      id: "cbb1523d-e740-45fd-bbac-17610609d062",
      file_name: "sound-effect.mp3",
      media_type: "audio/mpeg",
      byte_size: 3,
      created_at: 2,
    };
    const save = vi.fn<MediaPersistence["save"]>().mockResolvedValue(stored);
    const { app } = appWith({ media: { save } });
    const res = await post(app, { model_id: MODEL, prompt: "not persisted" });
    expect(await res.json()).toEqual({
      model_id: MODEL,
      provider_id: "elevenlabs",
      audio: AUDIO,
      stored_media: stored,
    });
    expect(save).toHaveBeenCalledWith({
      file_name: "sound-effect.mp3",
      media_type: "audio/mpeg",
      bytes: Buffer.from("ID3"),
    });
    expect(JSON.stringify(save.mock.calls)).not.toContain("not persisted");
  });

  it("keeps generated audio when persistence fails, without exposing its private error", async () => {
    const save = vi
      .fn<MediaPersistence["save"]>()
      .mockRejectedValue(new Error("private-storage-path"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { app } = appWith({ media: { save } });
      const res = await post(app, { model_id: MODEL, prompt: "x" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        model_id: MODEL,
        provider_id: "elevenlabs",
        audio: AUDIO,
      });
      expect(warning).toHaveBeenCalledOnce();
      expect(JSON.stringify(warning.mock.calls)).not.toContain(
        "private-storage-path"
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("sanitizes key-reader failures before they reach response or logs", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { app, request } = appWith({
        get: async () => {
          throw new Error("private-key-reader");
        },
      });
      const res = await post(app, { model_id: MODEL, prompt: "x" });
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain("private-key-reader");
      expect(JSON.stringify(logged.mock.calls)).not.toContain(
        "private-key-reader"
      );
      expect(request).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it.each([401, 403, 500])(
    "keeps provider HTTP %s generic, with no GG interpretation or retry",
    async (status) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const save = vi.fn<MediaPersistence["save"]>();
      try {
        const { app, request } = appWith({
          media: { save },
          request: async () =>
            new Response("private-upstream-body", { status }),
        });
        const res = await post(app, { model_id: MODEL, prompt: "x" });
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({
          error: "sound-effect generation failed",
          model_id: MODEL,
          provider_id: "elevenlabs",
        });
        expect(JSON.stringify(logged.mock.calls)).not.toContain(
          "private-upstream-body"
        );
        expect(request).toHaveBeenCalledOnce();
        expect(save).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    }
  );

  it("sanitizes thrown transport detail and never retries or persists a failed request", async () => {
    const sentinel = "private-prompt-key-response";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi.fn<MediaPersistence["save"]>();
    try {
      const { app, request } = appWith({
        key: sentinel,
        media: { save },
        request: async () => {
          throw Object.assign(new Error(sentinel), { responseBody: sentinel });
        },
      });
      const res = await post(app, { model_id: MODEL, prompt: sentinel });
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain(sentinel);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(sentinel);
      expect(request).toHaveBeenCalledOnce();
      expect(save).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it.each(["application/json", "audio/mpeg"])(
    "never persists malformed or empty output (%s)",
    async (mediaType) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const save = vi.fn<MediaPersistence["save"]>();
      try {
        const { app, download } = appWith({
          media: { save },
          request: async () =>
            new Response(mediaType === "audio/mpeg" ? null : "{}", {
              headers: { "content-type": mediaType },
            }),
        });
        const res = await post(app, { model_id: MODEL, prompt: "x" });
        expect(res.status).toBe(502);
        expect(save).not.toHaveBeenCalled();
        expect(download).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    }
  );

  it("propagates host cancellation without retry or persistence", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const submitted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let providerSignal: AbortSignal | null | undefined;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi.fn<MediaPersistence["save"]>();
    try {
      const { app, request } = appWith({
        media: { save },
        request: async (_input, init) => {
          providerSignal = init?.signal;
          started();
          return new Promise<Response>((_resolve, reject) => {
            providerSignal!.addEventListener(
              "abort",
              () => reject(providerSignal!.reason),
              { once: true }
            );
          });
        },
      });
      const pending = post(
        app,
        { model_id: MODEL, prompt: "x" },
        controller.signal
      );
      await submitted;
      controller.abort(new Error("private-abort-reason"));
      const res = await pending;
      expect(providerSignal?.aborted).toBe(true);
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain("private-abort-reason");
      expect(JSON.stringify(logged.mock.calls)).not.toContain(
        "private-abort-reason"
      );
      expect(request).toHaveBeenCalledOnce();
      expect(save).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});

describe("sound-effect route ownership", () => {
  it("delegates semantics and provider execution while withholding GG authority", () => {
    const src = readFileSync(
      new URL("./sound-effects.ts", import.meta.url),
      "utf8"
    );
    expect(src).toContain("SoundEffectClient");
    expect(src).not.toMatch(
      /@grida\/ai-models|MAX_SOUND_EFFECT|SOUND_EFFECT_MODEL_IDS|\.trim\(|\.length|apiKey|xi-api-key|gg_base_url|GridaGateway|postHosted/
    );
    expect(src).not.toMatch(/(from|require\()\s*["'][^"']*editor\/lib\/ai/);
  });
});
