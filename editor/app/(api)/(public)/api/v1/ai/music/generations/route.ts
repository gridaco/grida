// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
// GRIDA-EE: billing — see ee-billing
/**
 * `POST /api/v1/ai/music/generations` — hosted Lyria music generation for
 * Desktop. The Replicate prediction is gated and billed by the existing AI
 * seam; this route then materializes the short-lived output into bounded MP3
 * bytes. Provider URLs never cross the GG or renderer boundary.
 */
import { z } from "zod";
import type { MusicGenerateResult } from "@grida/agent";
import { verifyGgToken } from "@/lib/auth/gg-token";
import ai from "@/lib/ai";
import { methods } from "@/lib/ai/server";
import {
  fromUnknownError,
  modelNotFound,
  parseJsonRequest,
  rateLimited,
} from "@/lib/ai/openai-compat/errors";
import { allowAiRequest } from "@/lib/ai/openai-compat/limits";

export const maxDuration = 300;

const NO_STORE = { "cache-control": "no-store" } as const;
const MAX_MUSIC_BYTES = 32 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 60_000;

const requestSchema = z.looseObject({
  model_id: z.string().min(1),
  prompt: z.string().trim().min(1).max(4_096),
  seed: z
    .number()
    .int()
    .min(Number.MIN_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .nullish(),
});

function replicateOutputUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Replicate returned an invalid music output URL.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (host !== "replicate.delivery" && !host.endsWith(".replicate.delivery"))
  ) {
    throw new Error("Replicate returned an untrusted music output URL.");
  }
  return url;
}

async function readBoundedMusic(urlValue: string): Promise<Uint8Array> {
  let url = replicateOutputUrl(urlValue);
  // One deadline covers redirects and the response body. A fresh timeout per
  // hop would let a redirect chain multiply the route's memory/compute hold.
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { accept: "audio/mpeg,audio/*;q=0.9" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location || redirects === MAX_REDIRECTS) {
        throw new Error("Replicate music output redirected unexpectedly.");
      }
      url = replicateOutputUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error(
        `Replicate music output download failed (${response.status}).`
      );
    }

    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_MUSIC_BYTES) {
      await response.body.cancel().catch(() => {});
      throw new Error("Replicate music output exceeds the 32 MiB limit.");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_MUSIC_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error("Replicate music output exceeds the 32 MiB limit.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    if (total === 0) {
      throw new Error("Replicate returned an empty music output.");
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (!isMp3(bytes)) {
      throw new Error("Replicate returned an invalid MP3 output.");
    }
    return bytes;
  }
  throw new Error("Replicate music output exceeded the redirect limit.");
}

/** Accept an ID3v2 tag or a structurally valid MPEG audio frame header. */
function isMp3(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    return true;
  }
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0xff ||
    (bytes[1]! & 0xe0) !== 0xe0
  ) {
    return false;
  }
  const version = (bytes[1]! >> 3) & 0x03;
  const layer = (bytes[1]! >> 1) & 0x03;
  const bitrate = (bytes[2]! >> 4) & 0x0f;
  const sampleRate = (bytes[2]! >> 2) & 0x03;
  return (
    version !== 0x01 && layer !== 0 && bitrate !== 0x0f && sampleRate !== 0x03
  );
}

export async function POST(request: Request) {
  try {
    const claims = await verifyGgToken(request);
    const rl = await allowAiRequest("music", claims.sub);
    if (!rl.success) return rateLimited(rl.retryAfterSeconds);

    const parsed = await parseJsonRequest(request, requestSchema);
    if (!parsed.ok) return parsed.res;
    const req = parsed.data;
    if (!ai.audio.music.is_model_id(req.model_id)) {
      return modelNotFound(req.model_id);
    }

    const generated = await methods.generateMusic(claims.org, req.model_id, {
      prompt: req.prompt,
      seed: req.seed ?? undefined,
    });
    const bytes = await readBoundedMusic(generated.url);
    const result: MusicGenerateResult = {
      model_id: req.model_id,
      provider_id: "gg",
      audio: {
        base64: Buffer.from(bytes).toString("base64"),
        media_type: "audio/mpeg",
        file_name: `${req.model_id.split("/").at(-1) ?? "music"}.mp3`,
      },
    };
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    return fromUnknownError(error, "v1/ai/music");
  }
}
