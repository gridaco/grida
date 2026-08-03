import { describe, expect, it, vi } from "vitest";
import {
  ELEVENLABS_SOUND_EFFECT_URL,
  ElevenLabsSoundEffectProvider,
} from "./audio-byok";
import { ProviderHttp } from "./http";

describe("ElevenLabsSoundEffectProvider", () => {
  it("uses the exact endpoint/body and returns bounded MP3 bytes", async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33]);
    const request = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(String(input)).toBe(ELEVENLABS_SOUND_EFFECT_URL);
      expect(new Headers(init?.headers).get("xi-api-key")).toBe("eleven-key");
      expect(JSON.parse(String(init?.body))).toEqual({
        text: "heavy metal door slam",
        model_id: "eleven_text_to_sound_v2",
        duration_seconds: 2.5,
        loop: true,
        prompt_influence: 0.7,
      });
      return new Response(bytes, {
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(bytes.byteLength),
        },
      });
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const provider = new ElevenLabsSoundEffectProvider(
      "eleven-key",
      new ProviderHttp({ request, download })
    );

    await expect(
      provider.generate({
        model_id: "eleven_text_to_sound_v2",
        prompt: "heavy metal door slam",
        duration_seconds: 2.5,
        loop: true,
        prompt_influence: 0.7,
      })
    ).resolves.toEqual({
      base64: Buffer.from(bytes).toString("base64"),
      media_type: "audio/mpeg",
      file_name: "sound-effect.mp3",
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a declared response larger than 16 MiB without reading it", async () => {
    const request = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(new Uint8Array([1]), {
          headers: {
            "content-type": "audio/mpeg",
            "content-length": String(16 * 1024 * 1024 + 1),
          },
        })
    );
    const provider = new ElevenLabsSoundEffectProvider(
      "eleven-key",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    await expect(
      provider.generate({
        model_id: "eleven_text_to_sound_v2",
        prompt: "x",
      })
    ).rejects.toThrow(/exceeded 16 MiB/);
  });
});
