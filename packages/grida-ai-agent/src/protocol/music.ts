/** Hosted Lyria music-generation wire contract. */

import type { MediaItem } from "@grida/daemon";
import type { GeneratedMp3 } from "./generated-mp3";

export type MusicGenerateRequest = {
  model_id: string;
  prompt: string;
  seed?: number;
};

export type MusicGenerateResult = {
  model_id: string;
  provider_id: "gg";
  audio: GeneratedMp3;
  /** Present only when the optional host media store accepted the output. */
  stored_media?: MediaItem;
};
