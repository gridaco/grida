// GRIDA-SEC-004 — dedicated Voice credentials and transcription stay in Main.
import {
  GptTranscription,
  OPENAI_PROJECT_PROVIDER_ID,
  ProviderCredentials,
} from "@grida/ai/providers";
import {
  DESKTOP_VOICE_GRIDA_KEY_PREFIX,
  DESKTOP_VOICE_MAX_AUDIO_BYTES,
  DESKTOP_VOICE_WAV_MAX_SECONDS,
  DESKTOP_VOICE_WAV_MIME_TYPE,
  DESKTOP_VOICE_WAV_SAMPLE_RATE,
  DESKTOP_VOICE_WEBM_MIME_TYPE,
  desktopVoiceLanguageHint,
  isDesktopVoiceProvider,
  type DesktopVoiceProvider,
  type DesktopVoiceSettings,
  type DesktopVoiceSettingsPatch,
  type DesktopVoiceTranscriptionResult,
} from "@grida/desktop-bridge";
import { safeStorage } from "electron";
import type { DesktopPreferences } from "./desktop-preferences";
import { ProviderNetworkHost } from "./provider-network-host";

const TRANSCRIPTION_TIMEOUT_MS = 120_000;
const MAX_DICTIONARY_ENTRIES = 200;
const MAX_DICTIONARY_ENTRY_LENGTH = 50;
const EBML_HEADER = 0x1a45dfa3;
const WAV_HEADER_BYTES = 44;
const MAX_WAV_BYTES =
  WAV_HEADER_BYTES +
  DESKTOP_VOICE_WAV_SAMPLE_RATE * DESKTOP_VOICE_WAV_MAX_SECONDS * 2;

type KeyStorage = Pick<
  typeof safeStorage,
  "isAsyncEncryptionAvailable" | "encryptStringAsync" | "decryptStringAsync"
>;

export class VoiceService {
  constructor(
    private readonly preferences: DesktopPreferences,
    private readonly storage: KeyStorage = safeStorage,
    private readonly dispatch: GptTranscription.Dispatch = ProviderNetworkHost.voiceTranscriptionNetwork()
  ) {}

  getSettings(): DesktopVoiceSettings {
    const { credential, ...settings } = this.preferences.getVoice();
    return { ...settings, provider: credential?.provider ?? null };
  }

  async updateSettings(
    input: unknown,
    requireCurrent?: () => void
  ): Promise<DesktopVoiceSettings> {
    const patch = settingsPatch(input);
    await this.preferences.updateVoice((current) => {
      requireCurrent?.();
      return { ...current, ...patch };
    });
    return this.getSettings();
  }

  async saveKey(
    provider: unknown,
    input: unknown,
    requireCurrent?: () => void
  ): Promise<DesktopVoiceSettings> {
    if (!isDesktopVoiceProvider(provider)) {
      throw new Error("voice_invalid_key");
    }
    let key: string;
    try {
      key = normalizedKey(provider, input);
    } catch {
      throw new Error("voice_invalid_key");
    }

    try {
      await this.preferences.updateVoice(
        async (current) => {
          requireCurrent?.();
          if (current.credential && current.credential.provider !== provider) {
            throw new VoiceProviderConflict();
          }
          if (!(await this.storage.isAsyncEncryptionAvailable())) {
            throw new Error("voice_key_storage_unavailable");
          }
          const credential = await this.#encryptCredential(provider, key);
          requireCurrent?.();
          return {
            ...current,
            credential,
            useApiKey: current.credential ? current.useApiKey : true,
          };
        },
        { replaceCredential: true }
      );
    } catch (error) {
      if (error instanceof VoiceProviderConflict)
        throw new Error("voice_provider_conflict");
      throw new Error("voice_key_storage_unavailable");
    }
    return this.getSettings();
  }

  async removeKey(requireCurrent?: () => void): Promise<DesktopVoiceSettings> {
    await this.preferences.updateVoice(
      (current) => {
        requireCurrent?.();
        return { ...current, credential: undefined };
      },
      { replaceCredential: true }
    );
    return this.getSettings();
  }

  async transcribe(
    input: unknown,
    signal: AbortSignal
  ): Promise<DesktopVoiceTranscriptionResult> {
    if (signal.aborted) return { ok: false, error: "cancelled" };
    const { credential, useApiKey, language, dictionary } =
      this.preferences.getVoice();
    if (!credential || !useApiKey) return { ok: false, error: "not_ready" };
    const { provider } = credential;
    const recording = checkedRecording(input, provider);
    if (!recording) return { ok: false, error: "invalid_audio" };

    const requestSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
    ]);
    let expectedCredential = credential;
    try {
      const decrypted = await waitForKeyStorage(
        this.storage.decryptStringAsync(
          Buffer.from(credential.ciphertext, "base64")
        ),
        requestSignal
      );
      requestSignal.throwIfAborted();
      const key = credentialKey(credential, decrypted.result);
      if (decrypted.shouldReEncrypt || credential.version === 0) {
        expectedCredential = await waitForKeyStorage(
          this.#refreshCredential(credential, key, requestSignal),
          requestSignal
        );
      }
      const result = await GptTranscription.request({
        ...recording,
        provider,
        key,
        language: desktopVoiceLanguageHint(language),
        keywords: dictionary.filter(isDictionaryEntry),
        dispatch: (provider, headers, body, requestSignal) => {
          const current = this.preferences.getVoice();
          if (
            !current.useApiKey ||
            !sameCredential(current.credential, expectedCredential)
          ) {
            throw new VoiceNotReady();
          }
          return this.dispatch(provider, headers, body, requestSignal);
        },
        signal: requestSignal,
      });
      if (signal.aborted) return { ok: false, error: "cancelled" };
      return result;
    } catch (error) {
      if (signal.aborted) return { ok: false, error: "cancelled" };
      if (error instanceof VoiceNotReady)
        return { ok: false, error: "not_ready" };
      return { ok: false, error: "unavailable" };
    }
  }

  async #encryptCredential(
    provider: DesktopVoiceProvider,
    key: string
  ): Promise<DesktopPreferences.VoiceCredential> {
    const ciphertext = (
      await this.storage.encryptStringAsync(JSON.stringify({ provider, key }))
    ).toString("base64");
    return { provider, version: 1, ciphertext };
  }

  async #refreshCredential(
    previous: DesktopPreferences.VoiceCredential,
    key: string,
    signal: AbortSignal
  ): Promise<DesktopPreferences.VoiceCredential> {
    let currentCredential = previous;
    try {
      await this.preferences.updateVoice(
        async (current) => {
          signal.throwIfAborted();
          if (
            !current.useApiKey ||
            !sameCredential(current.credential, previous)
          )
            throw new VoiceNotReady();
          currentCredential = await waitForKeyStorage(
            this.#encryptCredential(previous.provider, key),
            signal
          );
          signal.throwIfAborted();
          return { ...current, credential: currentCredential };
        },
        { replaceCredential: true }
      );
    } catch {
      // An otherwise-readable key remains usable if storage is temporarily read-only.
      return previous;
    }
    return currentCredential;
  }
}

class VoiceNotReady extends Error {}
class VoiceProviderConflict extends Error {}

/** Electron can leave a storage operation pending while the OS prompts. */
async function waitForKeyStorage<T>(
  work: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  const stopped = Promise.withResolvers<never>();
  const abort = () => stopped.reject(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  try {
    return await Promise.race([work, stopped.promise]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

function normalizedKey(provider: DesktopVoiceProvider, value: unknown): string {
  if (provider !== "grida") {
    return ProviderCredentials.normalize(
      provider === "openai" ? OPENAI_PROJECT_PROVIDER_ID : provider,
      value
    );
  }
  const key = typeof value === "string" ? value.trim() : "";
  const payload = key.slice(DESKTOP_VOICE_GRIDA_KEY_PREFIX.length);
  if (
    !key.startsWith(DESKTOP_VOICE_GRIDA_KEY_PREFIX) ||
    !/^[A-Za-z0-9_-]{43}$/.test(payload) ||
    Buffer.from(payload, "base64url").toString("base64url") !== payload
  ) {
    throw new Error("voice_invalid_key");
  }
  return key;
}

function credentialKey(
  credential: DesktopPreferences.VoiceCredential,
  decrypted: string
): string {
  if (credential.version === 0) return normalizedKey("openai", decrypted);
  const value: unknown = JSON.parse(decrypted);
  if (
    typeof value !== "object" ||
    value === null ||
    !("provider" in value) ||
    value.provider !== credential.provider ||
    !("key" in value)
  ) {
    throw new Error("voice_key_storage_unavailable");
  }
  return normalizedKey(credential.provider, value.key);
}

function sameCredential(
  current: DesktopPreferences.VoiceCredential | undefined,
  expected: DesktopPreferences.VoiceCredential
): boolean {
  return (
    current?.provider === expected.provider &&
    current.version === expected.version &&
    current.ciphertext === expected.ciphertext
  );
}

function checkedRecording(input: unknown, provider: DesktopVoiceProvider) {
  if (
    typeof input !== "object" ||
    input === null ||
    !("id" in input) ||
    typeof input.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.id) ||
    !("audio" in input) ||
    !(input.audio instanceof ArrayBuffer) ||
    !("mimeType" in input)
  ) {
    return null;
  }
  const { audio, id, mimeType } = input;
  if (provider === "grida") {
    return mimeType === DESKTOP_VOICE_WAV_MIME_TYPE && isPcmWav(audio)
      ? { audio, id, mimeType }
      : null;
  }
  if (
    audio.byteLength <= 4 ||
    audio.byteLength > DESKTOP_VOICE_MAX_AUDIO_BYTES ||
    new DataView(audio).getUint32(0) !== EBML_HEADER ||
    (mimeType !== "audio/webm" && mimeType !== DESKTOP_VOICE_WEBM_MIME_TYPE)
  ) {
    return null;
  }
  return { audio, id, mimeType };
}

function isPcmWav(audio: ArrayBuffer): boolean {
  const length = audio.byteLength;
  const dataBytes = length - WAV_HEADER_BYTES;
  if (dataBytes <= 0 || length > MAX_WAV_BYTES || dataBytes % 2 !== 0)
    return false;
  const wav = new DataView(audio);
  return (
    wav.getUint32(0) === 0x52494646 && // RIFF
    wav.getUint32(4, true) === length - 8 &&
    wav.getUint32(8) === 0x57415645 && // WAVE
    wav.getUint32(12) === 0x666d7420 && // fmt
    wav.getUint32(16, true) === 16 &&
    wav.getUint16(20, true) === 1 && // Linear PCM
    wav.getUint16(22, true) === 1 && // Mono
    wav.getUint32(24, true) === DESKTOP_VOICE_WAV_SAMPLE_RATE &&
    wav.getUint32(28, true) === DESKTOP_VOICE_WAV_SAMPLE_RATE * 2 &&
    wav.getUint16(32, true) === 2 &&
    wav.getUint16(34, true) === 16 &&
    wav.getUint32(36) === 0x64617461 && // data
    wav.getUint32(40, true) === dataBytes
  );
}

function settingsPatch(input: unknown): DesktopVoiceSettingsPatch {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("voice_invalid_settings");
  }
  const patch: DesktopVoiceSettingsPatch = {};
  for (const [key, value] of Object.entries(input)) {
    switch (key) {
      case "useApiKey":
        if (typeof value !== "boolean")
          throw new Error("voice_invalid_settings");
        patch.useApiKey = value;
        break;
      case "microphoneId":
        if (typeof value !== "string" || !/^[!-~]{1,256}$/.test(value)) {
          throw new Error("voice_invalid_settings");
        }
        patch.microphoneId = value;
        break;
      case "language":
        if (
          typeof value !== "string" ||
          (value !== "auto" && !/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?$/.test(value))
        ) {
          throw new Error("voice_invalid_settings");
        }
        patch.language = value;
        break;
      case "dictionary":
        patch.dictionary = settingsDictionary(value);
        break;
      default:
        throw new Error("voice_invalid_settings");
    }
  }
  return patch;
}

function settingsDictionary(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_DICTIONARY_ENTRIES) {
    throw new Error("voice_invalid_settings");
  }
  const entries = Array.from(value, (entry: unknown) => {
    if (typeof entry !== "string") throw new Error("voice_invalid_settings");
    const normalized = entry.trim().normalize("NFC");
    if (!isDictionaryEntry(normalized))
      throw new Error("voice_invalid_settings");
    return normalized;
  });
  if (
    new Set(entries.map((entry) => entry.toLowerCase())).size !== entries.length
  ) {
    throw new Error("voice_invalid_settings");
  }
  return entries;
}

function isDictionaryEntry(entry: string): boolean {
  return (
    entry.trim().length > 0 &&
    entry.length <= MAX_DICTIONARY_ENTRY_LENGTH &&
    !/[<>\r\n]/.test(entry)
  );
}
