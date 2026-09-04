/**
 * ElevenLabs BYOK text-to-speech generation and voice discovery.
 *
 * Provider responses stay inside the sidecar. Voice discovery projects only
 * stable ids/names, and generated audio is normalized to the renderer-safe MP3
 * contract (GRIDA-SEC-004).
 */

import type { GeneratedMp3 } from "../protocol/generated-mp3";
import type {
  TextToSpeechGenerateRequest,
  TextToSpeechVoice,
} from "../protocol/text-to-speech";
import { ProviderHttp } from "./http";

export const ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v2/voices";
export const ELEVENLABS_TEXT_TO_SPEECH_URL =
  "https://api.elevenlabs.io/v1/text-to-speech";

const VOICES_PAGE_SIZE = 100;
const MAX_VOICE_PAGES = 10;
const MAX_VOICE_RESULTS = 2_000;
const MAX_VOICE_LIST_BYTES = 2 * 1024 * 1024;
const MAX_SPEECH_BYTES = 16 * 1024 * 1024;

type VoicePage = {
  voices: TextToSpeechVoice[];
  has_more: boolean;
  next_page_token?: string;
};

export class ElevenLabsTextToSpeechProvider {
  constructor(
    private readonly apiKey: string,
    private readonly providerHttp: ProviderHttp = new ProviderHttp()
  ) {}

  async listVoices(abortSignal?: AbortSignal): Promise<TextToSpeechVoice[]> {
    const voices = new Map<string, TextToSpeechVoice>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    for (let pageNumber = 0; pageNumber < MAX_VOICE_PAGES; pageNumber += 1) {
      const url = new URL(ELEVENLABS_VOICES_URL);
      url.searchParams.set("page_size", String(VOICES_PAGE_SIZE));
      if (cursor) url.searchParams.set("next_page_token", cursor);

      const response = await this.providerHttp.request(url.toString(), {
        method: "GET",
        headers: {
          "xi-api-key": this.apiKey,
          accept: "application/json",
        },
        signal: abortSignal,
      });
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => {});
        throw providerAccessDenied();
      }
      if (!response.ok) {
        await discardProviderError(response);
        throw providerRequestFailed("voice listing", response.status);
      }

      const page = await readVoicePage(response);
      for (const voice of page.voices) {
        if (!voices.has(voice.voice_id)) {
          voices.set(voice.voice_id, voice);
          if (voices.size === MAX_VOICE_RESULTS) return sortedVoices(voices);
        }
      }
      if (!page.has_more) return sortedVoices(voices);

      const next = page.next_page_token;
      if (!next) {
        throw new Error(
          "[elevenlabs] voice listing has another page but no cursor"
        );
      }
      if (seenCursors.has(next)) {
        throw new Error("[elevenlabs] voice listing repeated a cursor");
      }
      seenCursors.add(next);
      cursor = next;
    }

    // Voice discovery is a picker aid, not a completeness guarantee. The page
    // and result caps bound hostile or unusually large accounts while keeping
    // a useful catalogue available.
    return sortedVoices(voices);
  }

  async generate(
    request: TextToSpeechGenerateRequest,
    abortSignal?: AbortSignal
  ): Promise<GeneratedMp3> {
    assertVoiceIdPathSegment(request.voice_id);
    const url = `${ELEVENLABS_TEXT_TO_SPEECH_URL}/${encodeURIComponent(request.voice_id)}?output_format=mp3_44100_128`;
    const response = await this.providerHttp.request(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      signal: abortSignal,
      body: JSON.stringify({
        text: request.text,
        model_id: request.model_id,
      }),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => {});
      throw providerAccessDenied();
    }
    if (!response.ok) {
      await discardProviderError(response);
      throw providerRequestFailed("text-to-speech generation", response.status);
    }

    const mediaType = mediaTypeOf(response);
    if (mediaType !== "audio/mpeg") {
      await response.body?.cancel().catch(() => {});
      throw new Error("[elevenlabs] text-to-speech response was not MP3 audio");
    }
    const bytes = await readBytesBounded(response, MAX_SPEECH_BYTES);
    if (bytes.byteLength === 0) {
      throw new Error("[elevenlabs] text-to-speech response was empty");
    }
    return {
      base64: Buffer.from(bytes).toString("base64"),
      media_type: "audio/mpeg",
      file_name: "speech.mp3",
    };
  }
}

function providerAccessDenied(): Error & {
  readonly code: "provider_access_denied";
} {
  return Object.assign(new Error("[elevenlabs] provider access denied"), {
    code: "provider_access_denied" as const,
  });
}

function providerRequestFailed(
  operation: "voice listing" | "text-to-speech generation",
  status: number
): Error & {
  readonly code: "provider_request_failed";
  readonly status: number;
} {
  return Object.assign(
    new Error(`[elevenlabs] ${operation} failed (${status})`),
    {
      code: "provider_request_failed" as const,
      status,
    }
  );
}

async function discardProviderError(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

function assertVoiceIdPathSegment(voiceId: string): void {
  // `encodeURIComponent` intentionally leaves literal dots unchanged, while
  // the URL parser treats `.` and `..` as path-navigation segments. Refuse
  // those two values before constructing the credential-bearing request.
  if (voiceId === "." || voiceId === "..") {
    throw new Error("[elevenlabs] voice id is not a valid path segment");
  }
}

function sortedVoices(
  voices: ReadonlyMap<string, TextToSpeechVoice>
): TextToSpeechVoice[] {
  return [...voices.values()].sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.voice_id === b.voice_id) return 0;
    return a.voice_id < b.voice_id ? -1 : 1;
  });
}

async function readVoicePage(response: Response): Promise<VoicePage> {
  const mediaType = mediaTypeOf(response);
  if (mediaType !== "application/json") {
    await response.body?.cancel().catch(() => {});
    throw new Error("[elevenlabs] voice listing response was not JSON");
  }

  const bytes = await readBytesBounded(response, MAX_VOICE_LIST_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("[elevenlabs] voice listing response was invalid JSON");
  }
  if (!isRecord(value) || !Array.isArray(value.voices)) {
    throw new Error("[elevenlabs] voice listing response was malformed");
  }
  if (typeof value.has_more !== "boolean") {
    throw new Error("[elevenlabs] voice listing response was malformed");
  }

  const voices = value.voices.map((entry): TextToSpeechVoice => {
    if (!isRecord(entry)) {
      throw new Error("[elevenlabs] voice listing response was malformed");
    }
    const voiceId = stringField(entry.voice_id, 256);
    const name = stringField(entry.name, 256);
    if (!voiceId || !name) {
      throw new Error("[elevenlabs] voice listing response was malformed");
    }
    return { voice_id: voiceId, name };
  });

  const nextPageToken =
    value.next_page_token === undefined || value.next_page_token === null
      ? undefined
      : stringField(value.next_page_token, 1_024);
  if (
    value.next_page_token !== undefined &&
    value.next_page_token !== null &&
    !nextPageToken
  ) {
    throw new Error("[elevenlabs] voice listing response was malformed");
  }

  return {
    voices,
    has_more: value.has_more,
    ...(nextPageToken ? { next_page_token: nextPageToken } : {}),
  };
}

function mediaTypeOf(response: Response): string | undefined {
  return response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text || [...text].length > maximum) return undefined;
  return text;
}

async function readBytesBounded(
  response: Response,
  maximum: number
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) {
    await response.body?.cancel().catch(() => {});
    throw new Error("[elevenlabs] response exceeded its size limit");
  }
  if (!response.body) {
    throw new Error("[elevenlabs] response had no body");
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
        throw new Error("[elevenlabs] response exceeded its size limit");
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
