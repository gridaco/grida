import { describe, expect, it, vi } from "vitest";
import { GptTranscription } from "./gpt-transcription";

const audio = new Uint8Array([1, 2, 3]).buffer;
const input = {
  provider: "openai" as const,
  id: "recording",
  key: "fixture",
  audio,
  mimeType: "audio/webm",
  language: undefined,
  keywords: [],
  signal: new AbortController().signal,
};

describe("GptTranscription", () => {
  it("encodes the file and omits unset hints", async () => {
    const dispatch = vi.fn<GptTranscription.Dispatch>(
      async (provider, headers, body) => {
        expect(provider).toBe("openai");
        expect(headers.get("authorization")).toBe("Bearer fixture");
        const form = await new Response(body, { headers }).formData();
        expect([...form.keys()]).toEqual(["model", "file"]);
        expect(form.get("model")).toBe("gpt-transcribe");
        expect((form.get("file") as File).type).toBe("audio/webm");
        expect(await (form.get("file") as File).arrayBuffer()).toEqual(audio);
        return Response.json({
          text: "Dictated text",
          languages: [{ code: "en" }],
        });
      }
    );
    await expect(
      GptTranscription.request({ ...input, dispatch })
    ).resolves.toEqual({
      ok: true,
      text: "Dictated text",
    });
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("forwards OpenRouter provider options in JSON for the exact model", async () => {
    const dispatch = vi.fn<GptTranscription.Dispatch>(
      async (provider, headers, body) => {
        expect(provider).toBe("openrouter");
        expect(headers.get("content-type")).toBe("application/json");
        await expect(new Response(body).json()).resolves.toEqual({
          model: "openai/gpt-transcribe",
          input_audio: { data: "AQID", format: "webm" },
          provider: {
            options: { openai: { languages: ["en"], keywords: ["Grida"] } },
          },
        });
        return Response.json({ text: "Through OpenRouter" });
      }
    );
    await expect(
      GptTranscription.request({
        ...input,
        provider: "openrouter",
        language: "en",
        keywords: ["Grida"],
        dispatch,
      })
    ).resolves.toEqual({ ok: true, text: "Through OpenRouter" });
  });

  it("uses Vercel's V4 base64 body and protocol/model headers", async () => {
    const dispatch = vi.fn<GptTranscription.Dispatch>(
      async (provider, headers, body) => {
        expect(provider).toBe("vercel");
        expect(headers.get("content-type")).toBe("application/json");
        expect(headers.get("ai-gateway-protocol-version")).toBe("0.0.1");
        expect(
          headers.get("ai-transcription-model-specification-version")
        ).toBe("4");
        expect(headers.get("ai-model-id")).toBe("openai/gpt-transcribe");
        await expect(new Response(body).json()).resolves.toEqual({
          audio: "AQID",
          mediaType: "audio/webm",
          providerOptions: {
            openai: { languages: ["en"], keywords: ["Grida"] },
          },
        });
        return Response.json({
          text: "Through Vercel",
          segments: [],
          warnings: [],
        });
      }
    );
    await expect(
      GptTranscription.request({
        ...input,
        provider: "vercel",
        language: "en",
        keywords: ["Grida"],
        dispatch,
      })
    ).resolves.toEqual({ ok: true, text: "Through Vercel" });
  });

  it("uses a Grida Gateway idempotency key and only the supported multipart fields", async () => {
    const dispatch = vi.fn<GptTranscription.Dispatch>(
      async (provider, headers, body) => {
        expect(provider).toBe("grida");
        expect(headers.get("idempotency-key")).toBe("recording");
        const form = await new Response(body, { headers }).formData();
        expect([...form.keys()]).toEqual(["model", "file"]);
        expect(form.get("model")).toBe("openai/gpt-transcribe");
        expect((form.get("file") as File).name).toBe("dictation.wav");
        expect((form.get("file") as File).type).toBe("audio/wav");
        return Response.json({ text: "" });
      }
    );
    await expect(
      GptTranscription.request({
        ...input,
        provider: "grida",
        mimeType: "audio/wav",
        language: "en",
        keywords: ["Grida"],
        dispatch,
      })
    ).resolves.toEqual({ ok: true, text: "" });
  });

  it("classifies failures without returning upstream error bodies", async () => {
    for (const [status, error] of [
      [403, "key_rejected"],
      [415, "invalid_audio"],
      [429, "unavailable"],
    ] as const) {
      await expect(
        GptTranscription.request({
          ...input,
          dispatch: async () =>
            new Response("private upstream payload", { status }),
        })
      ).resolves.toEqual({ ok: false, error });
    }
  });

  it("rejects oversized responses and cancels the stream", async () => {
    const cancel = vi.fn<() => void>();
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) =>
        controller.enqueue(new Uint8Array(2 * 1024 * 1024)),
      cancel,
    });
    await expect(
      GptTranscription.request({
        ...input,
        dispatch: async () => new Response(stream),
      })
    ).resolves.toEqual({ ok: false, error: "unavailable" });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
