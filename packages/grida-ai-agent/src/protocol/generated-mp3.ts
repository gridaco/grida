/**
 * Renderer-safe encoded MP3 payload shared by music and Sound Effects.
 *
 * This is format vocabulary, not a generic audio-generation contract: both
 * owning routes deliberately normalize their provider output to MP3 bytes.
 */
export type GeneratedMp3 = {
  /** Base64-encoded MP3 bytes, without a `data:` prefix. */
  base64: string;
  media_type: "audio/mpeg";
  file_name: string;
};
