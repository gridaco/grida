import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { MediaItem } from "@grida/daemon";
import type { MediaPersistence, SecretsStore } from "@grida/daemon/server";
import type { GeneratedMp3 } from "../../protocol/generated-mp3";
import type {
  TextToSpeechGenerateRequest,
  TextToSpeechVoice,
} from "../../protocol/text-to-speech";

const mocks = vi.hoisted(() => ({
  listVoices: vi.fn<() => Promise<TextToSpeechVoice[]>>(),
  generate:
    vi.fn<
      (
        request: TextToSpeechGenerateRequest,
        signal?: AbortSignal
      ) => Promise<GeneratedMp3>
    >(),
}));

vi.mock("../../providers/elevenlabs-text-to-speech", () => ({
  ElevenLabsTextToSpeechProvider: class {
    listVoices = mocks.listVoices;
    generate = mocks.generate;
  },
}));

import { registerTextToSpeechRoutes } from "./text-to-speech";

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
  registerTextToSpeechRoutes(app, {
    secrets: fakeSecrets(options.keys ?? {}),
    media: options.media,
  });
  return app;
}

function post(app: Hono, payload: unknown) {
  return app.request("/audio/text-to-speech/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  mocks.listVoices.mockReset();
  mocks.generate.mockReset();
});

describe("text-to-speech routes", () => {
  it("lists the renderer-safe ElevenLabs voice projection", async () => {
    mocks.listVoices.mockResolvedValueOnce([
      { voice_id: "voice-a", name: "Alice" },
    ]);

    const res = await appWith({ keys: { elevenlabs: "key" } }).request(
      "/audio/text-to-speech/voices"
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider_id: "elevenlabs",
      voices: [{ voice_id: "voice-a", name: "Alice" }],
    });
  });

  it("returns a stable missing-provider-key code from both operations", async () => {
    const app = appWith({});
    const voices = await app.request("/audio/text-to-speech/voices");
    const generate = await post(app, {
      model_id: "eleven_v3",
      voice_id: "voice-a",
      text: "hello",
    });

    for (const res of [voices, generate]) {
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        code: "provider_key_required",
        provider_id: "elevenlabs",
      });
    }
    expect(mocks.listVoices).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("preserves v3 emotion tags and persists the normalized MP3", async () => {
    const stored: MediaItem = {
      id: "cbb1523d-e740-45fd-bbac-17610609d062",
      file_name: "speech.mp3",
      media_type: "audio/mpeg",
      byte_size: 3,
      created_at: 2,
    };
    const save = vi.fn<MediaPersistence["save"]>().mockResolvedValue(stored);
    mocks.generate.mockResolvedValueOnce({
      base64: "SUQz",
      media_type: "audio/mpeg",
      file_name: "speech.mp3",
    });

    const res = await post(
      appWith({ keys: { elevenlabs: "key" }, media: { save } }),
      {
        model_id: "eleven_v3",
        voice_id: " voice-a ",
        text: "[excited] We made it!",
      }
    );

    expect(res.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(
      {
        model_id: "eleven_v3",
        voice_id: "voice-a",
        text: "[excited] We made it!",
      },
      expect.any(AbortSignal)
    );
    expect(await res.json()).toMatchObject({
      model_id: "eleven_v3",
      provider_id: "elevenlabs",
      voice_id: "voice-a",
      stored_media: stored,
    });
    expect(save).toHaveBeenCalledWith({
      file_name: "speech.mp3",
      media_type: "audio/mpeg",
      bytes: Buffer.from("ID3"),
    });
  });

  it("rejects unknown models, invalid voices, and text beyond v3's limit", async () => {
    const app = appWith({ keys: { elevenlabs: "key" } });
    const unknown = await post(app, {
      model_id: "not-a-model",
      voice_id: "voice-a",
      text: "hello",
    });
    const blankVoice = await post(app, {
      model_id: "eleven_v3",
      voice_id: "  ",
      text: "hello",
    });
    const dotVoice = await post(app, {
      model_id: "eleven_v3",
      voice_id: ".",
      text: "hello",
    });
    const dotDotVoice = await post(app, {
      model_id: "eleven_v3",
      voice_id: "..",
      text: "hello",
    });
    const tooLong = await post(app, {
      model_id: "eleven_v3",
      voice_id: "voice-a",
      text: "x".repeat(5_001),
    });

    expect(unknown.status).toBe(400);
    expect(blankVoice.status).toBe(400);
    expect(dotVoice.status).toBe(400);
    expect(dotDotVoice.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not reflect upstream provider error bodies", async () => {
    const warning = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.generate.mockRejectedValueOnce(
      new Error("upstream leaked secret response body")
    );
    const res = await post(appWith({ keys: { elevenlabs: "key" } }), {
      model_id: "eleven_v3",
      voice_id: "voice-a",
      text: "hello",
    });

    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("leaked secret response body");
    warning.mockRestore();
  });

  it("returns provider_access_denied from both provider operations", async () => {
    const denied = () =>
      Object.assign(new Error("provider access denied"), {
        code: "provider_access_denied" as const,
      });
    mocks.listVoices.mockRejectedValueOnce(denied());
    mocks.generate.mockRejectedValueOnce(denied());
    const app = appWith({ keys: { elevenlabs: "key" } });

    const voices = await app.request("/audio/text-to-speech/voices");
    const generate = await post(app, {
      model_id: "eleven_v3",
      voice_id: "voice-a",
      text: "hello",
    });

    for (const res of [voices, generate]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        code: "provider_access_denied",
        provider_id: "elevenlabs",
      });
    }
  });
});
