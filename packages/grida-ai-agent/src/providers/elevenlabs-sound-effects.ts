/**
 * ElevenLabs BYOK sound-effect generation.
 *
 * The exact provider origin and endpoint are constants. The provider returns
 * MP3 bytes synchronously, which remain inside the sidecar and are normalized
 * to the renderer-safe MP3 result contract (GRIDA-SEC-004).
 */

import type { GeneratedMp3 } from "../protocol/generated-mp3";
import type { SoundEffectGenerateRequest } from "../protocol/sound-effects";
import { safeText } from "./fetch-helpers";
import { ProviderHttp } from "./http";

export const ELEVENLABS_SOUND_EFFECT_URL =
  "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";
const MAX_SOUND_EFFECT_BYTES = 16 * 1024 * 1024;

export class ElevenLabsSoundEffectProvider {
  constructor(
    private readonly apiKey: string,
    private readonly providerHttp: ProviderHttp = new ProviderHttp()
  ) {}

  async generate(
    request: SoundEffectGenerateRequest,
    abortSignal?: AbortSignal
  ): Promise<GeneratedMp3> {
    const response = await this.providerHttp.request(
      ELEVENLABS_SOUND_EFFECT_URL,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        signal: abortSignal,
        body: JSON.stringify({
          text: request.prompt,
          model_id: request.model_id,
          ...(request.duration_seconds === undefined
            ? {}
            : { duration_seconds: request.duration_seconds }),
          ...(request.loop === undefined ? {} : { loop: request.loop }),
          ...(request.prompt_influence === undefined
            ? {}
            : { prompt_influence: request.prompt_influence }),
        }),
      }
    );
    if (!response.ok) {
      throw new Error(
        `[elevenlabs] sound-effect generation failed (${response.status}): ${await safeText(response)}`
      );
    }
    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (mediaType !== "audio/mpeg") {
      await response.body?.cancel().catch(() => {});
      throw new Error("[elevenlabs] sound-effect response was not MP3 audio");
    }
    const bytes = await readBytesBounded(response, MAX_SOUND_EFFECT_BYTES);
    if (bytes.byteLength === 0) {
      throw new Error("[elevenlabs] sound-effect response was empty");
    }
    return {
      base64: Buffer.from(bytes).toString("base64"),
      media_type: "audio/mpeg",
      file_name: "sound-effect.mp3",
    };
  }
}

async function readBytesBounded(
  response: Response,
  maximum: number
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) {
    await response.body?.cancel().catch(() => {});
    throw new Error("[elevenlabs] sound-effect response exceeded 16 MiB");
  }
  if (!response.body) {
    throw new Error("[elevenlabs] sound-effect response had no body");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel().catch(() => {});
        throw new Error("[elevenlabs] sound-effect response exceeded 16 MiB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
