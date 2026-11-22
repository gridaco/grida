// GRIDA-SEC-004 — GPT-Transcribe requests over host-authorized HTTP.
const MAX_RESPONSE_BYTES = 1024 * 1024 + 64 * 1024;
const HOSTED_MODEL = "openai/gpt-transcribe";

export namespace GptTranscription {
  export type Provider = "openai" | "openrouter" | "vercel" | "grida";
  export type Dispatch = (
    provider: Provider,
    headers: Headers,
    body: ArrayBuffer,
    signal: AbortSignal
  ) => Promise<Response>;

  export type Result =
    | { ok: true; text: string }
    | { ok: false; error: "invalid_audio" | "key_rejected" | "unavailable" };

  /** The host supplies its destination-bound transport and the dedicated key. */
  export async function request({
    provider,
    id,
    key,
    audio,
    mimeType,
    language,
    keywords,
    dispatch,
    signal,
  }: {
    provider: Provider;
    id: string;
    key: string;
    audio: ArrayBuffer;
    mimeType: string;
    language: string | undefined;
    keywords: readonly string[];
    dispatch: Dispatch;
    signal: AbortSignal;
  }): Promise<Result> {
    signal.throwIfAborted();
    const encoded = encodeRequest(
      provider,
      id,
      audio,
      mimeType,
      language,
      keywords
    );
    const headers = new Headers(encoded.headers);
    headers.set("authorization", `Bearer ${key}`);
    headers.set("accept", "application/json");
    const body = await encoded.arrayBuffer();
    signal.throwIfAborted();
    const response = await dispatch(provider, headers, body, signal);
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: "key_rejected" };
      }
      if (response.status === 413 || response.status === 415) {
        return { ok: false, error: "invalid_audio" };
      }
      return { ok: false, error: "unavailable" };
    }

    const text = await readTranscript(response, signal);
    return text === null
      ? { ok: false, error: "unavailable" }
      : { ok: true, text };
  }
}

function encodeRequest(
  provider: GptTranscription.Provider,
  id: string,
  audio: ArrayBuffer,
  mimeType: string,
  language: string | undefined,
  keywords: readonly string[]
): Response {
  const hints = {
    ...(language && { languages: [language] }),
    ...(keywords.length > 0 && { keywords }),
  };
  const hasHints = Object.keys(hints).length > 0;
  if (provider === "openrouter") {
    return Response.json({
      model: HOSTED_MODEL,
      input_audio: { data: new Uint8Array(audio).toBase64(), format: "webm" },
      ...(hasHints && { provider: { options: { openai: hints } } }),
    });
  }
  if (provider === "vercel") {
    return Response.json(
      {
        audio: new Uint8Array(audio).toBase64(),
        mediaType: "audio/webm",
        ...(hasHints && { providerOptions: { openai: hints } }),
      },
      {
        headers: {
          "ai-gateway-protocol-version": "0.0.1",
          "ai-transcription-model-specification-version": "4",
          "ai-model-id": HOSTED_MODEL,
        },
      }
    );
  }

  const form = new FormData();
  form.set("model", provider === "openai" ? "gpt-transcribe" : HOSTED_MODEL);
  form.set(
    "file",
    new Blob([audio], { type: mimeType }),
    provider === "grida" ? "dictation.wav" : "dictation.webm"
  );
  if (provider === "grida") {
    return new Response(form, { headers: { "idempotency-key": id } });
  }
  if (language) form.append("languages[]", language);
  for (const keyword of keywords) form.append("keywords[]", keyword);
  return new Response(form);
}

async function readTranscript(
  response: Response,
  signal: AbortSignal
): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const abort = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0;
  let json = "";
  try {
    if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
      return null;
    }
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) return null;
      json += decoder.decode(value, { stream: true });
    }
    signal.throwIfAborted();
    const result: unknown = JSON.parse(json + decoder.decode());
    return typeof result === "object" &&
      result !== null &&
      "text" in result &&
      typeof result.text === "string"
      ? result.text
      : null;
  } catch {
    return null;
  } finally {
    signal.removeEventListener("abort", abort);
    abort();
    reader.releaseLock();
  }
}
