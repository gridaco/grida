import { describe, expect, it, vi } from "vitest";
import { AudioCompatibility } from "./audio-compatibility";

describe("AudioCompatibility.infer", () => {
  it.each([
    ["theme.MP3", "", "mp3", "stable", "audio/mpeg"],
    ["impact.wav", "application/octet-stream", "wav", "stable", "audio/wav"],
    ["ambience.flac", "", "flac", "stable", "audio/flac"],
    ["voice.ogg", "", "ogg", "stable", "audio/ogg"],
    ["voice.opus", "", "opus", "stable", 'audio/ogg; codecs="opus"'],
    ["loop.webm", "", "webm", "stable", "audio/webm"],
    ["music.m4a", "", "m4a", "conditional", 'audio/mp4; codecs="mp4a.40.2"'],
    ["music.aac", "", "aac", "conditional", "audio/aac"],
  ] as const)("infers %s", (name, type, format, tier, mimeType) => {
    expect(AudioCompatibility.infer({ name, type })).toMatchObject({
      format,
      tier,
      mimeType,
    });
  });

  it("uses a known MIME type when the extension is absent", () => {
    expect(
      AudioCompatibility.infer({ name: "generated-output", type: "audio/mpeg" })
    ).toMatchObject({ format: "mp3", tier: "stable" });
  });

  it("keeps unknown formats out of the compatibility promise", () => {
    expect(
      AudioCompatibility.infer({ name: "legacy.wma", type: "audio/x-ms-wma" })
    ).toEqual({
      format: "unknown",
      label: "Unknown audio",
      extension: ".wma",
      mimeType: "audio/x-ms-wma",
      tier: "unsupported",
    });
  });
});

describe("AudioCompatibility.probe", () => {
  it("reports Chromium's exact canPlayType result", () => {
    const canPlayType = vi.fn<AudioCompatibility.CanPlayType>(() => "probably");
    const result = AudioCompatibility.probe(
      { name: "music.m4a", type: "audio/mp4" },
      canPlayType
    );

    expect(canPlayType).toHaveBeenCalledWith('audio/mp4; codecs="mp4a.40.2"');
    expect(result).toMatchObject({
      tier: "conditional",
      playability: "probably",
      canPlay: true,
    });
  });

  it("reports an empty runtime probe as unsupported", () => {
    expect(
      AudioCompatibility.probe(
        { name: "effect.flac", type: "audio/flac" },
        () => ""
      )
    ).toMatchObject({ playability: "unsupported", canPlay: false });
  });

  it("can return compatibility metadata outside a browser", () => {
    expect(
      AudioCompatibility.probe({ name: "effect.mp3", type: "audio/mpeg" }, null)
    ).toMatchObject({
      tier: "stable",
      playability: "unprobed",
      canPlay: null,
    });
  });

  it("does not probe unsupported files", () => {
    const canPlayType = vi.fn<AudioCompatibility.CanPlayType>();
    expect(
      AudioCompatibility.probe(
        { name: "effect.aiff", type: "audio/aiff" },
        canPlayType
      )
    ).toMatchObject({ playability: "unsupported", canPlay: false });
    expect(canPlayType).not.toHaveBeenCalled();
  });
});
