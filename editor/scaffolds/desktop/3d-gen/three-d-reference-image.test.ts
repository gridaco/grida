import { describe, expect, it } from "vitest";
import { ThreeDReferenceImage } from "./three-d-reference-image";

describe("ThreeDReferenceImage", () => {
  it("encodes one local input without changing its bytes or media type", async () => {
    const encoded = await ThreeDReferenceImage.encode(
      new File([new Uint8Array([0, 1, 2, 3, 255])], "reference.png", {
        type: "image/png",
      })
    );

    expect(encoded).toEqual({
      base64: "AAECA/8=",
      media_type: "image/png",
    });
  });

  it("decodes the prompt attachment data URL", () => {
    expect(
      ThreeDReferenceImage.fromPromptAttachment({
        mediaType: "image/webp",
        url: "data:image/webp;base64,AAECA/8=",
      })
    ).toEqual({
      base64: "AAECA/8=",
      media_type: "image/webp",
    });
  });

  it("rejects unsupported, malformed, empty, and oversized inputs", async () => {
    expect(() =>
      ThreeDReferenceImage.fromPromptAttachment({
        mediaType: "image/gif",
        url: "data:image/gif;base64,AA==",
      })
    ).toThrow("PNG, JPEG, or WebP");
    expect(() =>
      ThreeDReferenceImage.fromPromptAttachment({
        mediaType: "image/png",
        url: "https://example.test/reference.png",
      })
    ).toThrow("Could not read");
    expect(() =>
      ThreeDReferenceImage.fromPromptAttachment({
        mediaType: "image/png",
        url: "data:image/png;base64,",
      })
    ).toThrow("empty");

    await expect(
      ThreeDReferenceImage.encode(
        new File([new Uint8Array([1])], "reference.gif", {
          type: "image/gif",
        })
      )
    ).rejects.toThrow("PNG, JPEG, or WebP");
    await expect(
      ThreeDReferenceImage.encode(
        new File(
          [new Uint8Array(ThreeDReferenceImage.MAX_BYTES + 1)],
          "reference.png",
          { type: "image/png" }
        )
      )
    ).rejects.toThrow("8 MiB or smaller");
  });
});
