import { describe, expect, it, vi } from "vitest";
import { Dictation } from "./dictation";

function microphone() {
  const track = { stop: vi.fn<() => void>() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

describe("Dictation", () => {
  it("lets the recognizer stop before releasing the microphone and awaits the final text", async () => {
    const { stream, track } = microphone();
    const dictation = new Dictation(async () => stream);
    const result = Promise.withResolvers<string>();
    const stop = vi.fn<() => void>(() =>
      expect(track.stop).not.toHaveBeenCalled()
    );
    const recognize = vi.fn<Dictation.Recognizer>(() => ({
      result: result.promise,
      stop,
    }));
    const phases: string[] = [];
    const unsubscribe = dictation.subscribe(() =>
      phases.push(dictation.getSnapshot().phase)
    );

    const transcript = dictation.start(recognize);
    await Promise.resolve();
    expect(dictation.getSnapshot()).toEqual({ phase: "recording", stream });
    expect(recognize.mock.calls[0][0]).toBe(stream);

    dictation.stop();
    dictation.stop();
    expect(stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(dictation.getSnapshot().phase).toBe("finishing");

    result.resolve(" hello ");
    await expect(transcript).resolves.toBe("hello");
    expect(recognize.mock.calls[0][1].aborted).toBe(true);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(phases).toEqual(["starting", "recording", "finishing", "idle"]);
    unsubscribe();
  });

  it("discards a late transcript after cancel", async () => {
    const { stream, track } = microphone();
    const result = Promise.withResolvers<string>();
    const recognize = vi.fn<Dictation.Recognizer>(() => ({
      result: result.promise,
      stop: vi.fn<() => void>(),
    }));
    const dictation = new Dictation(async () => stream);
    const transcript = dictation.start(recognize);
    await Promise.resolve();
    dictation.stop();
    dictation.cancel();
    expect(dictation.getSnapshot().phase).toBe("idle");
    expect(recognize.mock.calls[0][1].aborted).toBe(true);

    result.resolve("stale transcript");
    await expect(transcript).resolves.toBeNull();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("releases a late permission grant when a new session has already started", async () => {
    const previous = microphone();
    const current = microphone();
    const pending = Promise.withResolvers<MediaStream>();
    const capture = vi.fn<() => Promise<MediaStream>>();
    capture.mockReturnValueOnce(pending.promise);
    capture.mockResolvedValueOnce(current.stream);
    const speech = Promise.withResolvers<string>();
    const recognize = vi.fn<Dictation.Recognizer>(() => ({
      result: speech.promise,
      stop: vi.fn<() => void>(),
    }));
    const dictation = new Dictation(capture);
    const stale = dictation.start(recognize);
    const transcript = dictation.start(recognize);
    await Promise.resolve();

    pending.resolve(previous.stream);
    await expect(stale).resolves.toBeNull();
    expect(previous.track.stop).toHaveBeenCalledOnce();
    expect(recognize).toHaveBeenCalledOnce();
    expect(dictation.getSnapshot()).toEqual({
      phase: "recording",
      stream: current.stream,
    });

    speech.resolve("new transcript");
    await expect(transcript).resolves.toBe("new transcript");
    expect(current.track.stop).toHaveBeenCalledOnce();
  });

  it("surfaces recognition errors and releases the microphone", async () => {
    const { stream, track } = microphone();
    const error = new Error("Speech recognition failed");
    const dictation = new Dictation(async () => stream);
    await expect(
      dictation.start(() => {
        throw error;
      })
    ).resolves.toBeNull();
    expect(dictation.getSnapshot()).toEqual({ phase: "error", error });
    expect(track.stop).toHaveBeenCalledOnce();
  });
});
