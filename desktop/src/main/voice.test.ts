import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GptTranscription } from "@grida/ai/providers";
import type { safeStorage } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopPreferences } from "./desktop-preferences";
import { VoiceService } from "./voice";

vi.mock("electron", () => ({ safeStorage: {} }));

const recording = {
  id: "recording",
  audio: Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0x01).buffer,
  mimeType: "audio/webm;codecs=opus",
};

function sampleWav(): ArrayBuffer {
  const audio = new ArrayBuffer(46);
  const view = new DataView(audio);
  view.setUint32(0, 0x52494646);
  view.setUint32(4, 38, true);
  view.setUint32(8, 0x57415645);
  view.setUint32(12, 0x666d7420);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461);
  view.setUint32(40, 2, true);
  return audio;
}

describe("VoiceService", () => {
  let userData: string;

  beforeEach(async () => {
    userData = await fs.mkdtemp(path.join(os.tmpdir(), "grida-desktop-voice-"));
  });

  afterEach(async () => {
    await fs.rm(userData, { recursive: true, force: true });
  });

  async function setup() {
    const preferences = await DesktopPreferences.open({
      user_data_path: userData,
    });
    const vault = new Map<string, string>();
    const storage = {
      isAsyncEncryptionAvailable: vi.fn<
        typeof safeStorage.isAsyncEncryptionAvailable
      >(async () => true),
      encryptStringAsync: vi.fn<typeof safeStorage.encryptStringAsync>(
        async (key) => {
          const ciphertext = `test-ciphertext-${vault.size}`;
          vault.set(ciphertext, key);
          return Buffer.from(ciphertext);
        }
      ),
      decryptStringAsync: vi.fn<typeof safeStorage.decryptStringAsync>(
        async (ciphertext) => ({
          result: vault.get(ciphertext.toString()) ?? "",
          shouldReEncrypt: false,
        })
      ),
    };
    const dispatch = vi.fn<GptTranscription.Dispatch>(async () =>
      Response.json({ text: "Dictated text." })
    );
    return {
      preferences,
      storage,
      dispatch,
      voice: new VoiceService(preferences, storage, dispatch),
    };
  }

  it("persists only one provider-bound ciphertext and requires removal to switch", async () => {
    const { voice, storage, dispatch, preferences } = await setup();
    expect(voice.getSettings()).toEqual({
      provider: null,
      useApiKey: true,
      microphoneId: "default",
      language: "auto",
      dictionary: [],
    });
    await expect(voice.saveKey("openai", " ")).rejects.toThrow(
      "voice_invalid_key"
    );
    expect(storage.encryptStringAsync).not.toHaveBeenCalled();
    await expect(
      voice.saveKey("openai", " voice-fixture ")
    ).resolves.toMatchObject({
      provider: "openai",
    });
    await expect(voice.saveKey("openrouter", "sk-or-fixture")).rejects.toThrow(
      "voice_provider_conflict"
    );
    await Promise.all([
      voice.updateSettings({ microphoneId: "mic-1" }),
      preferences.completeOnboarding(),
      voice.saveKey("openai", "replacement-fixture"),
      voice.updateSettings({ dictionary: [" Cafe\u0301 "] }),
    ]);
    const persisted = await fs.readFile(
      path.join(userData, "preferences.json"),
      "utf8"
    );
    expect(persisted).not.toContain("voice-fixture");
    expect(persisted).not.toContain("replacement-fixture");
    const reopened = await DesktopPreferences.open({
      user_data_path: userData,
    });
    const restarted = new VoiceService(reopened, storage, dispatch);
    expect(reopened.isOnboardingComplete()).toBe(true);
    expect(restarted.getSettings()).toMatchObject({
      provider: "openai",
      microphoneId: "mic-1",
      dictionary: ["Café"],
    });
    await expect(restarted.removeKey()).resolves.toMatchObject({
      provider: null,
    });
    await expect(
      restarted.saveKey("vercel", "vck_fixture")
    ).resolves.toMatchObject({ provider: "vercel" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("pauses and resumes the saved key across an app restart", async () => {
    const { voice, storage, dispatch, preferences } = await setup();
    const signal = new AbortController().signal;
    await expect(
      voice.saveKey("openai", "voice-fixture")
    ).resolves.toMatchObject({
      provider: "openai",
      useApiKey: true,
    });
    const credential = preferences.getVoice().credential;
    await expect(voice.updateSettings({ useApiKey: "false" })).rejects.toThrow(
      "voice_invalid_settings"
    );
    await expect(
      voice.updateSettings({ useApiKey: false })
    ).resolves.toMatchObject({
      provider: "openai",
      useApiKey: false,
    });

    const reopened = await DesktopPreferences.open({
      user_data_path: userData,
    });
    const restarted = new VoiceService(reopened, storage, dispatch);
    expect(reopened.getVoice().credential).toEqual(credential);
    expect(restarted.getSettings()).toMatchObject({
      provider: "openai",
      useApiKey: false,
    });
    await expect(restarted.transcribe(recording, signal)).resolves.toEqual({
      ok: false,
      error: "not_ready",
    });
    expect(storage.decryptStringAsync).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    await expect(
      restarted.saveKey("openrouter", "sk-or-fixture")
    ).rejects.toThrow("voice_provider_conflict");

    await restarted.updateSettings({ useApiKey: true });
    await expect(restarted.transcribe(recording, signal)).resolves.toEqual({
      ok: true,
      text: "Dictated text.",
    });
    expect(dispatch.mock.calls[0][1].get("authorization")).toBe(
      "Bearer voice-fixture"
    );
    expect(reopened.getVoice().credential).toEqual(credential);

    await restarted.updateSettings({ useApiKey: false });
    await restarted.removeKey();
    await expect(
      restarted.saveKey("openrouter", "sk-or-fixture")
    ).resolves.toMatchObject({
      provider: "openrouter",
      useApiKey: true,
    });
  });

  it("preserves the key when safeStorage rejects a replacement or admission is revoked", async () => {
    const { voice, storage } = await setup();
    await voice.saveKey("openai", "voice-fixture");
    storage.isAsyncEncryptionAvailable.mockResolvedValueOnce(false);
    await expect(
      voice.saveKey("openai", "replacement-fixture")
    ).rejects.toThrow("voice_key_storage_unavailable");
    const requireCurrent = vi.fn<() => void>();
    requireCurrent
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("window request stale");
      });
    await expect(
      voice.saveKey("openai", "replacement-fixture", requireCurrent)
    ).rejects.toThrow("voice_key_storage_unavailable");
    expect(voice.getSettings()).toMatchObject({
      provider: "openai",
    });
    expect(
      await fs.readFile(path.join(userData, "preferences.json"), "utf8")
    ).toContain(Buffer.from("test-ciphertext-0").toString("base64"));
  });

  it("sends only valid enabled recordings using the saved key, language, and dictionary", async () => {
    const { voice, dispatch } = await setup();
    const signal = new AbortController().signal;
    await expect(voice.transcribe(recording, signal)).resolves.toEqual({
      ok: false,
      error: "not_ready",
    });
    await voice.saveKey("openai", "voice-fixture");
    await voice.updateSettings({ language: "zh-Hant", dictionary: ["Grida"] });
    await expect(
      voice.updateSettings({ dictionary: ["<tag>"] })
    ).rejects.toThrow("voice_invalid_settings");
    await expect(
      voice.transcribe({ ...recording, audio: new ArrayBuffer(12) }, signal)
    ).resolves.toEqual({ ok: false, error: "invalid_audio" });
    expect(dispatch).not.toHaveBeenCalled();

    await expect(voice.transcribe(recording, signal)).resolves.toEqual({
      ok: true,
      text: "Dictated text.",
    });
    const [provider, headers, body] = dispatch.mock.calls[0]!;
    expect(provider).toBe("openai");
    expect(headers.get("authorization")).toEqual("Bearer voice-fixture");
    const form = await new Response(body, { headers }).formData();
    expect(form.get("model")).toEqual("gpt-transcribe");
    expect(form.getAll("languages[]")).toEqual(["zh-tw"]);
    expect(form.getAll("keywords[]")).toEqual(["Grida"]);
    expect((form.get("file") as File).name).toEqual("dictation.webm");
    expect(await (form.get("file") as File).arrayBuffer()).toEqual(
      recording.audio
    );

    dispatch.mockResolvedValueOnce(
      new Response("Provider echoed a secret", { status: 401 })
    );
    await expect(voice.transcribe(recording, signal)).resolves.toEqual({
      ok: false,
      error: "key_rejected",
    });
    await voice.removeKey();
    await expect(voice.transcribe(recording, signal)).resolves.toEqual({
      ok: false,
      error: "not_ready",
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each(["remove", "pause"] as const)(
    "rechecks readiness after a %s during async key access",
    async (action) => {
      const { voice, storage, dispatch } = await setup();
      await voice.saveKey("openai", "voice-fixture");
      const key = Promise.withResolvers<{
        result: string;
        shouldReEncrypt: boolean;
      }>();
      storage.decryptStringAsync.mockReturnValueOnce(key.promise);
      const signal = new AbortController();
      const job = voice.transcribe(recording, signal.signal);
      if (action === "remove") await voice.removeKey();
      else await voice.updateSettings({ useApiKey: false });
      key.resolve({
        result: JSON.stringify({ provider: "openai", key: "voice-fixture" }),
        shouldReEncrypt: false,
      });
      await expect(job).resolves.toEqual({ ok: false, error: "not_ready" });

      signal.abort();
      await expect(voice.transcribe(recording, signal.signal)).resolves.toEqual(
        {
          ok: false,
          error: "cancelled",
        }
      );
      expect(dispatch).not.toHaveBeenCalled();
    }
  );

  it.each(["decrypt", "refresh"] as const)(
    "releases a cancelled upload while key storage is still waiting to %s",
    async (operation) => {
      const { voice, storage, dispatch, preferences } = await setup();
      await voice.saveKey("openai", "voice-fixture");
      const credential = preferences.getVoice().credential;
      const key = JSON.stringify({ provider: "openai", key: "voice-fixture" });
      const decrypted = Promise.withResolvers<{
        result: string;
        shouldReEncrypt: boolean;
      }>();
      const encrypted = Promise.withResolvers<Buffer>();
      if (operation === "decrypt") {
        storage.decryptStringAsync.mockReturnValueOnce(decrypted.promise);
      } else {
        storage.decryptStringAsync.mockResolvedValueOnce({
          result: key,
          shouldReEncrypt: true,
        });
        storage.encryptStringAsync.mockReturnValueOnce(encrypted.promise);
      }

      const controller = new AbortController();
      const upload = voice.transcribe(recording, controller.signal);
      await vi.waitFor(() =>
        expect(storage.encryptStringAsync).toHaveBeenCalledTimes(
          operation === "refresh" ? 2 : 1
        )
      );
      controller.abort();

      await expect(upload).resolves.toEqual({ ok: false, error: "cancelled" });
      await voice.updateSettings({ useApiKey: false });
      decrypted.resolve({ result: key, shouldReEncrypt: false });
      encrypted.resolve(Buffer.from("late-ciphertext"));
      expect(preferences.getVoice().credential).toEqual(credential);
      expect(dispatch).not.toHaveBeenCalled();
    }
  );

  it("reports a timed out keychain access as unavailable", async () => {
    const { voice, storage, dispatch } = await setup();
    await voice.saveKey("openai", "voice-fixture");
    const timeout = new AbortController();
    const clock = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValueOnce(timeout.signal);
    const key = Promise.withResolvers<{
      result: string;
      shouldReEncrypt: boolean;
    }>();
    storage.decryptStringAsync.mockReturnValueOnce(key.promise);
    try {
      const upload = voice.transcribe(recording, new AbortController().signal);
      timeout.abort(new DOMException("Timed out", "TimeoutError"));
      await expect(upload).resolves.toEqual({
        ok: false,
        error: "unavailable",
      });
    } finally {
      clock.mockRestore();
      key.reject(new Error("Keychain access was denied"));
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("only activates enabled legacy OpenAI keys and preserves a paused legacy record", async () => {
    const { storage, dispatch } = await setup();
    const keyCiphertext = (
      await storage.encryptStringAsync("legacy-fixture")
    ).toString("base64");
    const saveLegacy = async (useKey: boolean) => {
      await fs.writeFile(
        path.join(userData, "preferences.json"),
        JSON.stringify({
          schema_version: 1,
          onboarding: { completed_version: 0 },
          voice: { useKey, keyCiphertext },
        })
      );
      return new VoiceService(
        await DesktopPreferences.open({ user_data_path: userData }),
        storage,
        dispatch
      );
    };
    const signal = new AbortController().signal;
    const paused = await saveLegacy(false);
    expect(paused.getSettings().provider).toBeNull();
    await paused.updateSettings({ language: "en" });
    const file = path.join(userData, "preferences.json");
    expect(JSON.parse(await fs.readFile(file, "utf8")).voice).toMatchObject({
      useKey: false,
      keyCiphertext,
      language: "en",
    });
    await expect(paused.transcribe(recording, signal)).resolves.toEqual({
      ok: false,
      error: "not_ready",
    });

    const enabled = await saveLegacy(true);
    expect(enabled.getSettings().provider).toBe("openai");
    await expect(enabled.transcribe(recording, signal)).resolves.toEqual({
      ok: true,
      text: "Dictated text.",
    });
    expect(
      JSON.parse(await fs.readFile(file, "utf8")).voice.credential
    ).toMatchObject({ version: 1, provider: "openai" });
  });

  it("does not route a saved key to a tampered provider label", async () => {
    const { voice, storage, dispatch } = await setup();
    await voice.saveKey("openai", "fixture");
    const file = path.join(userData, "preferences.json");
    const persisted = JSON.parse(await fs.readFile(file, "utf8"));
    persisted.voice.credential.provider = "vercel";
    await fs.writeFile(file, JSON.stringify(persisted));
    const reopened = await DesktopPreferences.open({
      user_data_path: userData,
    });
    const tampered = new VoiceService(reopened, storage, dispatch);
    await expect(
      tampered.transcribe(recording, new AbortController().signal)
    ).resolves.toEqual({ ok: false, error: "unavailable" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("requires a canonical Grida API key and mono 16 kHz PCM16 WAV", async () => {
    const { voice, dispatch } = await setup();
    await expect(voice.saveKey("grida", "sk-gg-v1-test")).rejects.toThrow(
      "voice_invalid_key"
    );
    const secret = `sk-gg-v1-${Buffer.alloc(32, 27).toString("base64url")}`;
    await voice.saveKey("grida", secret);
    const signal = new AbortController().signal;
    await expect(voice.transcribe(recording, signal)).resolves.toEqual({
      ok: false,
      error: "invalid_audio",
    });
    const audio = sampleWav();
    const input = { ...recording, audio, mimeType: "audio/wav" };
    new DataView(audio).setUint16(22, 2, true);
    await expect(voice.transcribe(input, signal)).resolves.toEqual({
      ok: false,
      error: "invalid_audio",
    });
    expect(dispatch).not.toHaveBeenCalled();
    new DataView(audio).setUint16(22, 1, true);
    await expect(voice.transcribe(input, signal)).resolves.toEqual({
      ok: true,
      text: "Dictated text.",
    });
    const [provider, headers] = dispatch.mock.calls[0]!;
    expect(provider).toBe("grida");
    expect(headers.get("idempotency-key")).toBe(recording.id);
    expect(headers.get("authorization")).toBe(`Bearer ${secret}`);
  });
});
