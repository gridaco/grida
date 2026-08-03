import { describe, expect, it } from "vitest";
import {
  encodeThreeDInputImage,
  generatedMediaFile,
  THREE_D_INPUT_IMAGE_MAX_BYTES,
} from "./generated-media-file";
import { LocalGltfBundle } from "./local-gltf-bundle";

describe("generatedMediaFile", () => {
  it("preserves decoded bytes, filename, and media type", async () => {
    const file = generatedMediaFile(
      {
        base64: "AAECA/8=",
        media_type: "audio/mpeg",
      },
      "sound-effect.mp3"
    );

    expect(file.name).toBe("sound-effect.mp3");
    expect(file.type).toBe("audio/mpeg");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
      0, 1, 2, 3, 255,
    ]);
  });

  it("produces a File accepted by the local GLB viewer boundary", () => {
    const file = generatedMediaFile(
      {
        base64: "Z2xURg==",
        media_type: "model/gltf-binary",
      },
      "generated.glb"
    );

    expect(LocalGltfBundle.open([file]).entry).toMatchObject({
      file,
      virtualPath: "generated.glb",
      format: "glb",
      stability: "stable",
    });
  });

  it("encodes one local input without changing its bytes or media type", async () => {
    const encoded = await encodeThreeDInputImage(
      new File([new Uint8Array([0, 1, 2, 3, 255])], "reference.png", {
        type: "image/png",
      })
    );

    expect(encoded).toEqual({
      base64: "AAECA/8=",
      media_type: "image/png",
    });
  });

  it("rejects non-image codecs and inputs above the 8 MiB boundary", async () => {
    await expect(
      encodeThreeDInputImage(
        new File([new Uint8Array([1])], "reference.gif", {
          type: "image/gif",
        })
      )
    ).rejects.toThrow("PNG, JPEG, or WebP");

    await expect(
      encodeThreeDInputImage(
        new File(
          [new Uint8Array(THREE_D_INPUT_IMAGE_MAX_BYTES + 1)],
          "reference.png",
          { type: "image/png" }
        )
      )
    ).rejects.toThrow("8 MiB or smaller");
  });
});
