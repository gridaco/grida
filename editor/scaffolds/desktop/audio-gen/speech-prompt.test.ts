import { describe, expect, it } from "vitest";
import { TextToSpeechPrompt } from "./speech-prompt";

describe("TextToSpeechPrompt", () => {
  it("counts Unicode code points like the provider boundary", () => {
    expect(TextToSpeechPrompt.characterCount("Voice 🎙️")).toBe(8);
  });

  it("publishes a compact, unique starter set of valid audio tags", () => {
    expect(
      new Set(TextToSpeechPrompt.starterTags.map((tag) => tag.value)).size
    ).toBe(TextToSpeechPrompt.starterTags.length);
    expect(
      TextToSpeechPrompt.starterTags.every((tag) =>
        /^\[[^\]]+\]$/.test(tag.value)
      )
    ).toBe(true);
  });

  it("inserts a tag at the caret with readable spacing", () => {
    expect(
      TextToSpeechPrompt.insertTag("Hello world", "[excited]", 5, 5)
    ).toEqual({
      value: "Hello [excited] world",
      caret: 16,
    });
    expect(TextToSpeechPrompt.insertTag("", "[whispers]", 0, 0)).toEqual({
      value: "[whispers] ",
      caret: 11,
    });
  });

  it("replaces a selection and clamps stale selection bounds", () => {
    expect(
      TextToSpeechPrompt.insertTag("Say this now", "[sighs]", 4, 8)
    ).toEqual({
      value: "Say [sighs] now",
      caret: 12,
    });
    expect(TextToSpeechPrompt.insertTag("Hi", "[laughs]", 99, -1)).toEqual({
      value: "Hi [laughs] ",
      caret: 12,
    });
  });
});
