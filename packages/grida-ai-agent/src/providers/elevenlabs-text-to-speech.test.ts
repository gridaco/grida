import { describe, expect, it, vi } from "vitest";
import {
  ELEVENLABS_TEXT_TO_SPEECH_URL,
  ELEVENLABS_VOICES_URL,
  ElevenLabsTextToSpeechProvider,
} from "./elevenlabs-text-to-speech";
import { ProviderHttp } from "./http";

function json(value: unknown): Response {
  return Response.json(value, {
    headers: { "content-type": "application/json" },
  });
}

describe("ElevenLabsTextToSpeechProvider", () => {
  it("lists cursor-paginated voices, deduplicated by provider id", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(ELEVENLABS_VOICES_URL);
      expect(url.searchParams.get("page_size")).toBe("100");
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("xi-api-key")).toBe("eleven-key");

      if (!url.searchParams.has("next_page_token")) {
        return json({
          voices: [
            { voice_id: "voice-a", name: "Alice", ignored: "private" },
            { voice_id: "voice-b", name: "Bob" },
          ],
          has_more: true,
          next_page_token: "cursor-2",
        });
      }
      expect(url.searchParams.get("next_page_token")).toBe("cursor-2");
      return json({
        voices: [
          { voice_id: "voice-b", name: "Duplicate Bob" },
          { voice_id: "voice-c", name: "Charlie" },
        ],
        has_more: false,
      });
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const provider = new ElevenLabsTextToSpeechProvider(
      "eleven-key",
      new ProviderHttp({ request, download })
    );

    await expect(provider.listVoices()).resolves.toEqual([
      { voice_id: "voice-a", name: "Alice" },
      { voice_id: "voice-b", name: "Bob" },
      { voice_id: "voice-c", name: "Charlie" },
    ]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a repeated pagination cursor instead of looping", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async () =>
      json({
        voices: [],
        has_more: true,
        next_page_token: "same-cursor",
      })
    );
    const provider = new ElevenLabsTextToSpeechProvider(
      "eleven-key",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    await expect(provider.listVoices()).rejects.toThrow(/repeated a cursor/);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("accepts default voices included beyond the requested first-page size", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async () =>
      json({
        voices: Array.from({ length: 125 }, (_, index) => ({
          voice_id: `voice-${index.toString().padStart(3, "0")}`,
          name: `Voice ${index.toString().padStart(3, "0")}`,
        })),
        has_more: false,
      })
    );
    const provider = new ElevenLabsTextToSpeechProvider(
      "eleven-key",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    const voices = await provider.listVoices();
    expect(voices).toHaveLength(125);
    expect(voices.at(-1)).toEqual({
      voice_id: "voice-124",
      name: "Voice 124",
    });
  });

  it("bounds the renderer-facing voice catalogue", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async () =>
      json({
        voices: Array.from({ length: 2_001 }, (_, index) => ({
          voice_id: `voice-${index}`,
          name: `Voice ${index}`,
        })),
        has_more: false,
      })
    );
    const provider = new ElevenLabsTextToSpeechProvider(
      "eleven-key",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    await expect(provider.listVoices()).resolves.toHaveLength(2_000);
  });

  it("returns a deterministically sorted bounded catalogue at the page cap", async () => {
    let page = 0;
    const request = vi.fn<typeof globalThis.fetch>(async () => {
      page += 1;
      return json({
        voices: [{ voice_id: `voice-${page}`, name: `Voice ${11 - page}` }],
        has_more: true,
        next_page_token: `cursor-${page}`,
      });
    });
    const provider = new ElevenLabsTextToSpeechProvider(
      "eleven-key",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    const voices = await provider.listVoices();
    expect(request).toHaveBeenCalledTimes(10);
    expect(voices).toHaveLength(10);
    expect(voices.map(({ name }) => name)).toEqual([
      "Voice 1",
      "Voice 10",
      "Voice 2",
      "Voice 3",
      "Voice 4",
      "Voice 5",
      "Voice 6",
      "Voice 7",
      "Voice 8",
      "Voice 9",
    ]);
  });

  it("uses the exact v3 endpoint/body and returns bounded MP3 bytes", async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33]);
    const request = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(String(input)).toBe(
        `${ELEVENLABS_TEXT_TO_SPEECH_URL}/voice%2Fid?output_format=mp3_44100_128`
      );
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("xi-api-key")).toBe("eleven-key");
      expect(JSON.parse(String(init?.body))).toEqual({
        text: "[whispers] This is a secret.",
        model_id: "eleven_v3",
      });
      return new Response(bytes, {
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(bytes.byteLength),
        },
      });
    });
    const provider = new ElevenLabsTextToSpeechProvider(
      "eleven-key",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    await expect(
      provider.generate({
        model_id: "eleven_v3",
        voice_id: "voice/id",
        text: "[whispers] This is a secret.",
      })
    ).resolves.toEqual({
      base64: Buffer.from(bytes).toString("base64"),
      media_type: "audio/mpeg",
      file_name: "speech.mp3",
    });
  });

  it.each([
    ["voice listing", 401, "list"],
    ["generation", 403, "generate"],
  ] as const)(
    "maps %s access failures without retaining the upstream body",
    async (_label, status, operation) => {
      const request = vi.fn<typeof globalThis.fetch>(
        async () => new Response("upstream secret detail", { status })
      );
      const provider = new ElevenLabsTextToSpeechProvider(
        "eleven-key",
        new ProviderHttp({
          request,
          download: vi.fn<typeof globalThis.fetch>(),
        })
      );

      const result =
        operation === "list"
          ? provider.listVoices()
          : provider.generate({
              model_id: "eleven_v3",
              voice_id: "voice-id",
              text: "hello",
            });
      const error = await result.catch((cause: unknown) => cause);
      expect(error).toMatchObject({ code: "provider_access_denied" });
      expect((error as Error).message).not.toContain("upstream secret detail");
    }
  );

  it.each([
    ["voice listing", 429, "list"],
    ["text-to-speech generation", 500, "generate"],
  ] as const)(
    "discards a non-auth %s error body before returning a status-only error",
    async (label, status, operation) => {
      const cancel = vi.fn<(reason?: unknown) => void>();
      const request = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode("upstream echoed private speech")
                );
              },
              cancel,
            }),
            { status }
          )
      );
      const provider = new ElevenLabsTextToSpeechProvider(
        "eleven-key",
        new ProviderHttp({
          request,
          download: vi.fn<typeof globalThis.fetch>(),
        })
      );

      const result =
        operation === "list"
          ? provider.listVoices()
          : provider.generate({
              model_id: "eleven_v3",
              voice_id: "voice-id",
              text: "private speech",
            });
      const error = await result.catch((cause: unknown) => cause);

      expect(error).toMatchObject({
        code: "provider_request_failed",
        status,
      });
      expect((error as Error).message).toBe(
        `[elevenlabs] ${label} failed (${status})`
      );
      expect((error as Error).message).not.toContain(
        "upstream echoed private speech"
      );
      expect(cancel).toHaveBeenCalledOnce();
    }
  );

  it.each([".", ".."])(
    "rejects the %s voice-id path segment before provider I/O",
    async (voiceId) => {
      const request = vi.fn<typeof globalThis.fetch>();
      const provider = new ElevenLabsTextToSpeechProvider(
        "eleven-key",
        new ProviderHttp({
          request,
          download: vi.fn<typeof globalThis.fetch>(),
        })
      );

      await expect(
        provider.generate({
          model_id: "eleven_v3",
          voice_id: voiceId,
          text: "hello",
        })
      ).rejects.toThrow(/not a valid path segment/);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("rejects a declared speech response larger than 16 MiB", async () => {
    const request = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(new Uint8Array([1]), {
          headers: {
            "content-type": "audio/mpeg",
            "content-length": String(16 * 1024 * 1024 + 1),
          },
        })
    );
    const provider = new ElevenLabsTextToSpeechProvider(
      "eleven-key",
      new ProviderHttp({ request, download: vi.fn<typeof globalThis.fetch>() })
    );

    await expect(
      provider.generate({
        model_id: "eleven_v3",
        voice_id: "voice-id",
        text: "hello",
      })
    ).rejects.toThrow(/size limit/);
  });
});
