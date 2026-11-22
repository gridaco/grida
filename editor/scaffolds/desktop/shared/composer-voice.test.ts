import {
  DESKTOP_VOICE_WEBM_MIME_TYPE,
  type DesktopVoiceSettings,
  type DesktopVoiceTranscriptionResult,
} from "@grida/desktop-bridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { voice } from "@/lib/desktop/bridge";
import { ComposerVoice } from "./composer-voice";

vi.mock("@/lib/desktop/bridge", () => ({
  getDesktopBridge: () => ({ voice: {} }),
  voice: {
    getSettings: vi.fn<typeof voice.getSettings>(),
    subscribe: vi.fn<typeof voice.subscribe>(),
    transcribe: vi.fn<typeof voice.transcribe>(),
    cancel: vi.fn<typeof voice.cancel>(),
  },
}));

const subscribe = vi.mocked(voice.subscribe);

const SETTINGS: DesktopVoiceSettings = {
  provider: "openai",
  microphoneId: "usb-mic",
  language: "auto",
  dictionary: [],
};

const SAMPLE_HEADER = Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3);

class TestRecorder extends EventTarget {
  static isTypeSupported() {
    return true;
  }

  state: RecordingState = "inactive";

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      const chunk = new Blob([SAMPLE_HEADER]);
      const event = Object.assign(new Event("dataavailable"), { data: chunk });
      this.dispatchEvent(event);
      this.dispatchEvent(new Event("stop"));
    });
  }
}

const stopTrack = vi.fn<() => void>();
const stream = { getTracks: () => [{ stop: stopTrack }] };
const getUserMedia = vi.fn<() => Promise<typeof stream>>(async () => stream);

function publish(settings: DesktopVoiceSettings) {
  subscribe.mock.calls.at(-1)?.[0](settings);
}

describe("composer Voice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("MediaRecorder", TestRecorder);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.mocked(voice.getSettings).mockResolvedValue(SETTINGS);
    vi.mocked(voice.subscribe).mockReturnValue(() => {});
    vi.mocked(voice.cancel).mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps the setup action available when settings cannot be read", async () => {
    vi.mocked(voice.getSettings).mockRejectedValue(new Error("unavailable"));
    const composer = new ComposerVoice();
    const disconnect = composer.connect();
    await Promise.resolve();

    expect(composer.getSnapshot()).toMatchObject({
      supported: true,
      settings: null,
    });
    await composer.start(false, () => true);
    expect(getUserMedia).not.toHaveBeenCalled();
    publish(SETTINGS);
    expect(composer.getSnapshot().settings).toBe(SETTINGS);
    disconnect?.();
  });

  it("records the configured mic and appends only after Stop", async () => {
    vi.mocked(voice.transcribe).mockResolvedValue({
      ok: true,
      text: " hello ",
    });
    const composer = new ComposerVoice();
    const disconnect = composer.connect();
    await vi.waitFor(() =>
      expect(composer.getSnapshot().settings).toBe(SETTINGS)
    );
    const append = vi.fn<(text: string) => boolean>(() => true);
    const run = composer.start(false, append);
    await vi.waitFor(() =>
      expect(composer.getSnapshot().state.phase).toBe("recording")
    );

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "usb-mic" } },
      video: false,
    });
    expect(voice.transcribe).not.toHaveBeenCalled();
    composer.stop();
    await run;

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(voice.transcribe).toHaveBeenCalledExactlyOnceWith({
      id: expect.any(String),
      audio: SAMPLE_HEADER.buffer,
      mimeType: DESKTOP_VOICE_WEBM_MIME_TYPE,
    });
    expect(append).toHaveBeenCalledExactlyOnceWith("hello");
    expect(voice.cancel).not.toHaveBeenCalled();
    disconnect?.();
  });

  it.each([
    { change: "removed", settings: { ...SETTINGS, provider: null } },
    { change: "disabled", settings: { ...SETTINGS, useApiKey: false } },
  ])(
    "cancels an upload and ignores its late result when the key is $change",
    async ({ settings }) => {
      const result = Promise.withResolvers<DesktopVoiceTranscriptionResult>();
      vi.mocked(voice.transcribe).mockReturnValue(result.promise);
      const composer = new ComposerVoice();
      const disconnect = composer.connect();
      publish(SETTINGS);
      const append = vi.fn<(text: string) => boolean>(() => true);
      const send = vi.fn<() => void>();
      const run = composer.start(true, append);
      await vi.waitFor(() =>
        expect(composer.getSnapshot().state.phase).toBe("recording")
      );
      composer.stopAndSend(send);
      await vi.waitFor(() => expect(voice.transcribe).toHaveBeenCalledOnce());

      publish(settings);
      const request = vi.mocked(voice.transcribe).mock.calls[0][0];
      expect(voice.cancel).toHaveBeenCalledExactlyOnceWith(request.id);
      await run;
      result.resolve({ ok: true, text: "discard this" });
      await result.promise;

      expect(append).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(composer.getSnapshot().sendPending).toBe(false);
      expect(composer.getSnapshot().settings).toBe(settings);
      disconnect?.();
    }
  );

  it("stops the microphone when the saved key is disabled and can record again when enabled", async () => {
    const composer = new ComposerVoice();
    const disconnect = composer.connect();
    publish(SETTINGS);
    const append = vi.fn<(text: string) => boolean>(() => true);
    const run = composer.start(false, append);
    await vi.waitFor(() =>
      expect(composer.getSnapshot().state.phase).toBe("recording")
    );

    publish({ ...SETTINGS, useApiKey: false });
    expect(stopTrack).toHaveBeenCalledOnce();
    await run;
    expect(voice.transcribe).not.toHaveBeenCalled();

    const pausedStart = composer.start(false, append);
    expect(getUserMedia).toHaveBeenCalledOnce();
    await pausedStart;

    publish({ ...SETTINGS, useApiKey: true });
    vi.mocked(voice.transcribe).mockResolvedValue({ ok: true, text: "hello" });
    const resumed = composer.start(false, append);
    await vi.waitFor(() =>
      expect(composer.getSnapshot().state.phase).toBe("recording")
    );
    composer.stop();
    await resumed;

    expect(append).toHaveBeenCalledExactlyOnceWith("hello");
    disconnect?.();
  });

  it("sends once after appending the finalized transcript", async () => {
    const result = Promise.withResolvers<DesktopVoiceTranscriptionResult>();
    vi.mocked(voice.transcribe).mockReturnValue(result.promise);
    const composer = new ComposerVoice();
    const disconnect = composer.connect();
    publish(SETTINGS);
    const append = vi.fn<(text: string) => boolean>(() => true);
    const send = vi.fn<() => void>(() => {
      expect(append).toHaveBeenCalledExactlyOnceWith("dictated text");
    });
    const run = composer.start(true, append);
    await vi.waitFor(() =>
      expect(composer.getSnapshot().state.phase).toBe("recording")
    );
    composer.stopAndSend(send);
    composer.stopAndSend(send);
    expect(composer.getSnapshot().sendPending).toBe(true);
    expect(send).not.toHaveBeenCalled();
    result.resolve({ ok: true, text: "dictated text" });
    await run;
    expect(send).toHaveBeenCalledOnce();
    expect(composer.getSnapshot().sendPending).toBe(false);
    disconnect?.();
  });

  it.each([
    { ok: true, text: "" },
    { ok: false, error: "unavailable" },
  ] as const)(
    "leaves the draft in place when the transcript supplies no text ($ok)",
    async (result) => {
      vi.mocked(voice.transcribe).mockResolvedValue(result);
      const composer = new ComposerVoice();
      const disconnect = composer.connect();
      publish(SETTINGS);
      const append = vi.fn<(text: string) => boolean>();
      const send = vi.fn<() => void>();
      const run = composer.start(true, append);
      await vi.waitFor(() =>
        expect(composer.getSnapshot().state.phase).toBe("recording")
      );
      composer.stopAndSend(send);
      await run;
      expect(append).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(composer.getSnapshot().sendPending).toBe(false);
      disconnect?.();
    }
  );
});
