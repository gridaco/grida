/** ElevenLabs Sound Effects generation wire contract. */

import type { models } from "@grida/ai-models";
import type { MediaItem } from "@grida/daemon";
import type { GeneratedMp3 } from "./generated-mp3";

export type SoundEffectGenerateRequest = {
  model_id: models.audio.sound_effects.ModelId;
  prompt: string;
  /** Omit to let ElevenLabs choose. Otherwise 0.5–30 seconds. */
  duration_seconds?: number;
  loop?: boolean;
  /** ElevenLabs prompt adherence, 0–1. */
  prompt_influence?: number;
};

export type SoundEffectGenerateResult = {
  model_id: models.audio.sound_effects.ModelId;
  provider_id: "elevenlabs";
  audio: GeneratedMp3;
  /** Present only when the optional host media store accepted the output. */
  stored_media?: MediaItem;
};
