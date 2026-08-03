/**
 * Audio-generation wire protocols.
 *
 * Music and sound effects deliberately remain distinct contracts: they use
 * different providers, billing meters, and request options even though both
 * currently normalize to MP3 bytes (GRIDA-SEC-004).
 */

import type { models } from "@grida/ai-models";
import type { MediaItem } from "@grida/daemon";

export type GeneratedAudio = {
  /** Base64-encoded MP3 bytes, without a `data:` prefix. */
  base64: string;
  media_type: "audio/mpeg";
  file_name: string;
};

export type MusicGenerateRequest = {
  model_id: models.audio.MusicModelId;
  prompt: string;
  seed?: number;
};

export type MusicGenerateResult = {
  model_id: models.audio.MusicModelId;
  provider_id: "gg";
  audio: GeneratedAudio;
  /** Present only when the optional host media store accepted the output. */
  stored_media?: MediaItem;
};

export type SoundEffectGenerateRequest = {
  model_id: models.audio.SoundEffectModelId;
  prompt: string;
  /** Omit to let ElevenLabs choose. Otherwise 0.5–30 seconds. */
  duration_seconds?: number;
  loop?: boolean;
  /** ElevenLabs prompt adherence, 0–1. */
  prompt_influence?: number;
};

export type SoundEffectGenerateResult = {
  model_id: models.audio.SoundEffectModelId;
  provider_id: "elevenlabs";
  audio: GeneratedAudio;
  /** Present only when the optional host media store accepted the output. */
  stored_media?: MediaItem;
};
