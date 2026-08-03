/** Hosted Lyria music-generation wire contract. */

import type { models } from "@grida/ai-models";
import type { MediaItem } from "@grida/daemon";
import type { GeneratedMp3 } from "./generated-mp3";

export type MusicGenerateRequest = {
  model_id: models.audio.music.ModelId;
  prompt: string;
  seed?: number;
};

export type MusicGenerateResult = {
  model_id: models.audio.music.ModelId;
  provider_id: "gg";
  audio: GeneratedMp3;
  /** Present only when the optional host media store accepted the output. */
  stored_media?: MediaItem;
};
