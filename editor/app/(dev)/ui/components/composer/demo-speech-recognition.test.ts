import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recognizeDemoSpeech } from "./demo-speech-recognition";

type RecognitionResult = { transcript: string }[] & { isFinal: boolean };

class FakeSpeechRecognition {
  static current: FakeSpeechRecognition;

  lang = "";
  continuous = false;
  onresult: ((event: { results: RecognitionResult[] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn<(track: MediaStreamTrack) => void>();
  stop = vi.fn<() => void>();
  abort = vi.fn<() => void>();

  constructor() {
    FakeSpeechRecognition.current = this;
  }
}

const track = {} as MediaStreamTrack;
const stream = { getAudioTracks: () => [track] } as MediaStream;

describe("playground speech recognition", () => {
  beforeEach(() => {
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
    vi.stubGlobal("navigator", { language: "ko-KR" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("recognizes the existing track and holds finalized words until Stop", async () => {
    const session = recognizeDemoSpeech(stream, new AbortController().signal);
    const recognition = FakeSpeechRecognition.current;
    expect(recognition.start).toHaveBeenCalledWith(track);
    expect(recognition.lang).toBe("ko-KR");
    expect(recognition.continuous).toBe(true);

    const delivered = vi.fn<(text: string) => void>();
    void session.result.then(delivered);
    recognition.onresult?.({
      results: [
        Object.assign([{ transcript: " An actual transcript. " }], {
          isFinal: true,
        }),
        Object.assign([{ transcript: "unfinished" }], { isFinal: false }),
      ],
    });
    recognition.onend?.();
    await Promise.resolve();
    expect(delivered).not.toHaveBeenCalled();

    session.stop();
    await expect(session.result).resolves.toBe("An actual transcript.");
    expect(recognition.onresult).toBeNull();
  });

  it.each(["unsupported", "network error"])(
    "inserts a labeled sample on Stop when recognition is %s",
    async (failure) => {
      if (failure === "unsupported")
        vi.stubGlobal("SpeechRecognition", undefined);
      const session = recognizeDemoSpeech(stream, new AbortController().signal);
      if (failure === "network error")
        FakeSpeechRecognition.current.onerror?.({ error: "network" });

      const delivered = vi.fn<(text: string) => void>();
      void session.result.then(delivered);
      await Promise.resolve();
      expect(delivered).not.toHaveBeenCalled();

      session.stop();
      await expect(session.result).resolves.toMatch(/sample transcript/i);
    }
  );

  it("returns no text when the browser hears no speech", async () => {
    const session = recognizeDemoSpeech(stream, new AbortController().signal);
    const recognition = FakeSpeechRecognition.current;
    session.stop();
    expect(recognition.stop).toHaveBeenCalledOnce();
    recognition.onerror?.({ error: "no-speech" });
    await expect(session.result).resolves.toBe("");
  });

  it("cancels active recognition and detaches the browser handlers", async () => {
    const controller = new AbortController();
    const session = recognizeDemoSpeech(stream, controller.signal);
    const recognition = FakeSpeechRecognition.current;
    controller.abort();
    await expect(session.result).resolves.toBe("");
    expect(recognition.abort).toHaveBeenCalledOnce();
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
  });

  it("falls back when the browser fails to complete Stop", async () => {
    vi.useFakeTimers();
    const session = recognizeDemoSpeech(stream, new AbortController().signal);
    const recognition = FakeSpeechRecognition.current;
    session.stop();
    await vi.runAllTimersAsync();
    await expect(session.result).resolves.toMatch(/sample transcript/i);
    expect(recognition.abort).toHaveBeenCalledOnce();
  });
});
