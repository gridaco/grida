import { describe, expect, it } from "vitest";
import { ImagePlaygroundModel } from "./image-playground-model";

describe("ImagePlaygroundModel.initial", () => {
  it("accepts a listed model handoff", () => {
    expect(ImagePlaygroundModel.initial("openai/gpt-image-2")).toBe(
      "openai/gpt-image-2"
    );
  });

  it("rejects hidden, deprecated, and unknown models", () => {
    expect(ImagePlaygroundModel.initial("openai/gpt-image-1-mini")).toBe(
      undefined
    );
    expect(ImagePlaygroundModel.initial("openai/gpt-image-1.5")).toBe(
      undefined
    );
    expect(ImagePlaygroundModel.initial("unknown/model")).toBe(undefined);
  });

  it("uses the first query value", () => {
    expect(
      ImagePlaygroundModel.initial([
        "openai/gpt-image-2",
        "google/gemini-3-pro-image",
      ])
    ).toBe("openai/gpt-image-2");
  });
});
