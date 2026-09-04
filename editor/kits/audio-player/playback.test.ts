import { describe, expect, it } from "vitest";
import { AudioPlayback } from "./playback";

describe("AudioPlayback.shouldReportPlayError", () => {
  it("ignores an interrupted current attempt", () => {
    expect(
      AudioPlayback.shouldReportPlayError({ name: "AbortError" }, 2, 2)
    ).toBe(false);
  });

  it("ignores a failure from a stale attempt", () => {
    expect(AudioPlayback.shouldReportPlayError(new Error("stale"), 1, 2)).toBe(
      false
    );
  });

  it("reports a genuine failure from the current attempt", () => {
    expect(AudioPlayback.shouldReportPlayError(new Error("failed"), 2, 2)).toBe(
      true
    );
  });
});

describe("AudioPlayback.volumeAfterUnmute", () => {
  it("keeps an already audible volume", () => {
    expect(AudioPlayback.volumeAfterUnmute(0.25, 0.75)).toBe(0.25);
  });

  it("restores the last audible volume from zero", () => {
    expect(AudioPlayback.volumeAfterUnmute(0, 0.75)).toBe(0.75);
  });

  it("falls back to full volume without audible history", () => {
    expect(AudioPlayback.volumeAfterUnmute(0, 0)).toBe(1);
  });
});

describe("AudioPlayback.formatTime", () => {
  it("formats whole-second playback time", () => {
    expect(AudioPlayback.formatTime(65.9)).toBe("1:05");
  });

  it("preserves tenths for sub-second clips", () => {
    expect(AudioPlayback.formatTime(0.5, true)).toBe("0:00.5");
  });

  it("sanitizes invalid time", () => {
    expect(AudioPlayback.formatTime(Number.NaN)).toBe("0:00");
    expect(AudioPlayback.formatTime(-1)).toBe("0:00");
  });
});
