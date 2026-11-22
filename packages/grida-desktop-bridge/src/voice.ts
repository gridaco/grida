export const DESKTOP_VOICE_MAX_AUDIO_BYTES = 24_000_000;
export const DESKTOP_VOICE_WEBM_MIME_TYPE = "audio/webm;codecs=opus";
export const DESKTOP_VOICE_WAV_MIME_TYPE = "audio/wav";
export const DESKTOP_VOICE_WAV_SAMPLE_RATE = 16_000;
export const DESKTOP_VOICE_WAV_MAX_SECONDS = 300;
export const DESKTOP_VOICE_GRIDA_KEY_PREFIX = "sk-gg-v1-";
export const DESKTOP_VOICE_PROVIDERS = [
  "openai",
  "openrouter",
  "vercel",
  "grida",
] as const;

export type DesktopVoiceProvider = (typeof DESKTOP_VOICE_PROVIDERS)[number];

export function isDesktopVoiceProvider(
  value: unknown
): value is DesktopVoiceProvider {
  return DESKTOP_VOICE_PROVIDERS.some((provider) => provider === value);
}

/** Maps a Desktop locale to a GPT-Transcribe language hint when available. */
export function desktopVoiceLanguageHint(locale: string): string | undefined {
  if (locale === "zh-Hant") return "zh-tw";
  const [code] = locale.split("-", 1);
  if (code && (/^[a-z]{2}$/.test(code) || code === "yue")) return code;
}

export type DesktopVoiceSettings = {
  /** Provider of the saved key, including while its use is paused. */
  provider: DesktopVoiceProvider | null;
  /** Use the saved key for dictation. Older hosts omit this and use any saved key. */
  useApiKey?: boolean;
  microphoneId: string;
  language: string;
  dictionary: string[];
};

export type DesktopVoiceSettingsPatch = Partial<
  Omit<DesktopVoiceSettings, "provider">
>;

export function isDesktopVoiceReady(
  settings: DesktopVoiceSettings | null | undefined
): settings is DesktopVoiceSettings & {
  provider: DesktopVoiceProvider;
  useApiKey?: true;
} {
  return !!settings?.provider && settings.useApiKey !== false;
}

export type DesktopVoiceTranscriptionRequest = {
  id: string;
  audio: ArrayBuffer;
  mimeType: string;
};

export type DesktopVoiceTranscriptionResult =
  | { ok: true; text: string }
  | {
      ok: false;
      error:
        | "not_ready"
        | "invalid_audio"
        | "key_rejected"
        | "unavailable"
        | "cancelled";
    };

export type DesktopVoice = {
  getSettings(): Promise<DesktopVoiceSettings>;
  updateSettings(
    patch: DesktopVoiceSettingsPatch
  ): Promise<DesktopVoiceSettings>;
  saveKey(
    provider: DesktopVoiceProvider,
    key: string
  ): Promise<DesktopVoiceSettings>;
  removeKey(): Promise<DesktopVoiceSettings>;
  subscribe(listener: (settings: DesktopVoiceSettings) => void): () => void;
  transcribe(
    request: DesktopVoiceTranscriptionRequest
  ): Promise<DesktopVoiceTranscriptionResult>;
  cancel(id: string): Promise<void>;
};
