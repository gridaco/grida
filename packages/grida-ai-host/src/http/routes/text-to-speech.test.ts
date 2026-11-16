// GRIDA-SEC-004 — real public speech/voice operations with synthetic host capabilities.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ProviderHttp } from "@grida/ai";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import { registerTextToSpeechRoutes } from "./text-to-speech";

const MODEL = "eleven_v3";
const KEY = "synthetic-elevenlabs-key";
const AUDIO = {
  base64: "SUQz",
  media_type: "audio/mpeg",
  file_name: "speech.mp3",
};
const INPUT = { model_id: MODEL, voice_id: "voice-a", text: "hello" };
type Operation = "list" | "generate";
type ReadKey = (provider: string) => Promise<string | null>;

function appWith(
  options: {
    key?: string | null;
    get?: ReadKey;
    request?: typeof globalThis.fetch;
    media?: MediaPersistence;
  } = {}
) {
  const get = vi.fn<ReadKey>(
    options.get ?? (async () => (options.key === undefined ? KEY : options.key))
  );
  const request = vi.fn<typeof globalThis.fetch>(
    options.request ??
      (async (input) => {
        if (String(input).includes("/v2/voices"))
          return Response.json({
            voices: [
              {
                voice_id: " voice-a ",
                name: " Alice ",
                preview_url: "https://private.example/preview",
              },
            ],
            has_more: false,
          });
        return new Response(new Uint8Array([0x49, 0x44, 0x33]), {
          headers: { "content-type": "audio/mpeg" },
        });
      })
  );
  const download = vi.fn<typeof globalThis.fetch>();
  const app = new Hono();
  registerTextToSpeechRoutes(app, {
    secrets: { _getKey: get } as unknown as SecretsStore,
    media: options.media,
    provider_http: new ProviderHttp({ request, download }),
  });
  return { app, get, request, download };
}

function post(app: Hono, payload: unknown, signal?: AbortSignal) {
  return app.request("/audio/text-to-speech/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

function invoke(app: Hono, operation: Operation, signal?: AbortSignal) {
  return operation === "list"
    ? app.request("/audio/text-to-speech/voices", { signal })
    : post(app, INPUT, signal);
}

describe("text-to-speech routes", () => {
  it("projects paginated voices without metadata and keeps the first duplicate", async () => {
    const { app, get, request, download } = appWith({
      request: async (input, init) => {
        const url = new URL(String(input));
        expect(url.origin + url.pathname).toBe(
          "https://api.elevenlabs.io/v2/voices"
        );
        expect(url.searchParams.get("page_size")).toBe("100");
        expect(init?.method).toBe("GET");
        expect(new Headers(init?.headers).get("xi-api-key")).toBe(KEY);
        if (!url.searchParams.has("next_page_token"))
          return Response.json({
            voices: [
              {
                voice_id: "voice-b",
                name: "Bob",
                secret: "private-voice-field",
              },
              { voice_id: " voice-a ", name: " Zoe " },
            ],
            has_more: true,
            next_page_token: "cursor /?=2",
          });
        expect(url.searchParams.get("next_page_token")).toBe("cursor /?=2");
        return Response.json({
          voices: [
            { voice_id: "voice-a", name: "Changed Zoe" },
            { voice_id: "voice-c", name: "Alice" },
          ],
          has_more: false,
        });
      },
    });
    const res = await invoke(app, "list");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider_id: "elevenlabs",
      voices: [
        { voice_id: "voice-c", name: "Alice" },
        { voice_id: "voice-b", name: "Bob" },
        { voice_id: "voice-a", name: "Zoe" },
      ],
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(get.mock.calls).toEqual([["elevenlabs"]]);
    expect(download).not.toHaveBeenCalled();
  });

  it("preserves original text and uses the SDK-normalized opaque voice id in wire output", async () => {
    const text = "\n  [whispers] This is a secret. \t";
    const { app, get, request, download } = appWith();
    const res = await post(app, {
      model_id: MODEL,
      voice_id: " voice/id ",
      text,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      model_id: MODEL,
      provider_id: "elevenlabs",
      voice_id: "voice/id",
      audio: AUDIO,
    });
    expect(get.mock.calls).toEqual([["elevenlabs"], ["elevenlabs"]]);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice%2Fid?output_format=mp3_44100_128"
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("xi-api-key")).toBe(KEY);
    expect(JSON.parse(String(init?.body))).toEqual({ model_id: MODEL, text });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(download).not.toHaveBeenCalled();
  });

  it("keeps the host receipt at the root and persists only fixed-name MP3 bytes", async () => {
    const stored: MediaItem = {
      id: "cbb1523d-e740-45fd-bbac-17610609d062",
      file_name: "speech.mp3",
      media_type: "audio/mpeg",
      byte_size: 3,
      created_at: 2,
    };
    const save = vi.fn<MediaPersistence["save"]>().mockResolvedValue(stored);
    const { app } = appWith({ media: { save } });
    const res = await post(app, {
      ...INPUT,
      voice_id: " voice-a ",
      text: "not stored",
    });
    expect(await res.json()).toEqual({
      model_id: MODEL,
      provider_id: "elevenlabs",
      voice_id: "voice-a",
      audio: AUDIO,
      stored_media: stored,
    });
    expect(save).toHaveBeenCalledWith({
      file_name: "speech.mp3",
      media_type: "audio/mpeg",
      bytes: Buffer.from("ID3"),
    });
    expect(JSON.stringify(save.mock.calls)).not.toContain("not stored");
  });

  it("keeps generated speech when optional persistence fails without exposing storage detail", async () => {
    const save = vi
      .fn<MediaPersistence["save"]>()
      .mockRejectedValue(new Error("private-storage-path"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { app } = appWith({ media: { save } });
      const res = await post(app, INPUT);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        model_id: MODEL,
        provider_id: "elevenlabs",
        voice_id: "voice-a",
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

  it.each([null, "", "  "])(
    "preserves missing-key errors from both operations for %j",
    async (key) => {
      const { app, request } = appWith({ key });
      for (const operation of ["list", "generate"] as const) {
        const res = await invoke(app, operation);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
          error: "no ElevenLabs key is connected",
          code: "provider_key_required",
          provider_id: "elevenlabs",
        });
      }
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each(["list", "generate"] as const)(
    "sanitizes %s key-reader failures without provider I/O",
    async (operation) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const { app, request } = appWith({
          get: async () => {
            throw new Error("private-key-reader");
          },
        });
        const res = await invoke(app, operation);
        expect(res.status).toBe(502);
        expect(await res.text()).not.toContain("private-key-reader");
        expect(JSON.stringify(logged.mock.calls)).not.toContain(
          "private-key-reader"
        );
        expect(request).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    }
  );

  it("rereads the selected key at generation and fails when it disappeared", async () => {
    const get = vi.fn<ReadKey>();
    get.mockResolvedValueOnce(KEY).mockResolvedValueOnce(null);
    const { app, request } = appWith({ get });
    const res = await post(app, INPUT);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "provider_key_required" });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    { ...INPUT, model_id: "unknown" },
    { ...INPUT, voice_id: " " },
    { ...INPUT, voice_id: "." },
    { ...INPUT, voice_id: ".." },
    { ...INPUT, voice_id: "\ud800" },
    { ...INPUT, voice_id: "a".repeat(257) },
    { ...INPUT, text: " " },
    { ...INPUT, text: "a".repeat(5001) },
    { model_id: MODEL, text: "hello" },
  ])("rejects invalid input before provider I/O", async (payload) => {
    const { app, request } = appWith();
    expect((await post(app, payload)).status).toBe(400);
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the SDK codepoint text limit including original whitespace", async () => {
    const { app, request } = appWith();
    const text = "🎵".repeat(5000);
    expect((await post(app, { ...INPUT, text })).status).toBe(200);
    const invalid = await post(app, { ...INPUT, text: ` ${text}` });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: "invalid text-to-speech input",
      code: "invalid_input",
    });
    expect(request).toHaveBeenCalledOnce();
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).text).toBe(text);
  });

  it.each([401, 403])(
    "maps provider HTTP %s to the existing access-denied wire in both operations",
    async (status) => {
      for (const operation of ["list", "generate"] as const) {
        const save = vi.fn<MediaPersistence["save"]>();
        const { app, request } = appWith({
          media: { save },
          request: async () => new Response("private-upstream", { status }),
        });
        const res = await invoke(app, operation);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({
          error: "provider_access_denied: provider access denied",
          code: "provider_access_denied",
          provider_id: "elevenlabs",
        });
        expect(request).toHaveBeenCalledOnce();
        expect(save).not.toHaveBeenCalled();
      }
    }
  );

  it.each(["list", "generate"] as const)(
    "sanitizes %s transport detail without retry or persistence",
    async (operation) => {
      const sentinel = "private-text-key-response";
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const save = vi.fn<MediaPersistence["save"]>();
      try {
        const { app, request } = appWith({
          media: { save },
          request: async () => {
            throw Object.assign(new Error(sentinel), {
              responseBody: sentinel,
            });
          },
        });
        const res = await invoke(app, operation);
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual(
          operation === "list"
            ? { error: "voice listing failed", provider_id: "elevenlabs" }
            : {
                error: "text-to-speech generation failed",
                model_id: MODEL,
                provider_id: "elevenlabs",
              }
        );
        expect(JSON.stringify(logged.mock.calls)).not.toContain(sentinel);
        expect(request).toHaveBeenCalledOnce();
        expect(save).not.toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    }
  );

  it("discards a partial voice list when a later page denies access", async () => {
    let page = 0;
    const { app, request } = appWith({
      request: async () =>
        ++page === 1
          ? Response.json({
              voices: [{ voice_id: "voice-a", name: "Alice" }],
              has_more: true,
              next_page_token: "next",
            })
          : new Response("private-provider-detail", { status: 403 }),
    });
    const res = await invoke(app, "list");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "provider_access_denied: provider access denied",
      code: "provider_access_denied",
      provider_id: "elevenlabs",
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed voice pages instead of returning provider metadata", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { app, request, download } = appWith({
        request: async () =>
          Response.json({
            voices: [
              {
                voice_id: "a",
                name: "Private",
                preview_url: "https://private.example",
              },
            ],
            has_more: true,
          }),
      });
      const res = await invoke(app, "list");
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({
        error: "voice listing failed",
        provider_id: "elevenlabs",
      });
      expect(JSON.stringify(logged.mock.calls)).not.toContain(
        "private.example"
      );
      expect(request).toHaveBeenCalledOnce();
      expect(download).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("rejects malformed speech output without download or persistence", async () => {
    const save = vi.fn<MediaPersistence["save"]>();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { app, request, download } = appWith({
        media: { save },
        request: async () =>
          Response.json({ url: "https://private.example/audio" }),
      });
      expect((await post(app, INPUT)).status).toBe(502);
      expect(request).toHaveBeenCalledOnce();
      expect(download).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it.each(["list", "generate"] as const)(
    "propagates %s cancellation without retry or persistence",
    async (operation) => {
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
        const pending = invoke(app, operation, controller.signal);
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
    }
  );
});

describe("speech route ownership", () => {
  it("delegates semantic normalization, key choice, and provider execution to the public SDK", () => {
    const source = readFileSync(
      new URL("./text-to-speech.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("TextToSpeechClient");
    expect(source).not.toMatch(
      /@grida\/ai-models|MAX_TEXT|MAX_VOICE|TEXT_TO_SPEECH_MODEL_IDS|\.trim\(|\.length|encodeURIComponent|xi-api-key|gg_base_url|GridaGateway/
    );
    expect(source).not.toMatch(/(from|require\()\s*["'][^"']*editor\/lib\/ai/);
  });
});
