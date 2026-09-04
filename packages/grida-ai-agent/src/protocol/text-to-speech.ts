/** ElevenLabs Text to Speech generation wire contract. */

import type { models } from "@grida/ai-models";
import type { MediaItem } from "@grida/daemon";
import type { GeneratedMp3 } from "./generated-mp3";

/** Renderer-safe projection of an ElevenLabs voice. */
export type TextToSpeechVoice = {
  voice_id: string;
  name: string;
};

export type TextToSpeechListVoicesResult = {
  provider_id: "elevenlabs";
  voices: TextToSpeechVoice[];
};

export type TextToSpeechGenerateRequest = {
  model_id: models.audio.text_to_speech.ModelId;
  voice_id: string;
  /** Plain text with optional ElevenLabs v3 bracketed audio/emotion tags. */
  text: string;
};

export type TextToSpeechGenerateResult = {
  model_id: models.audio.text_to_speech.ModelId;
  provider_id: "elevenlabs";
  voice_id: string;
  audio: GeneratedMp3;
  /** Present only when the optional host media store accepted the output. */
  stored_media?: MediaItem;
};
