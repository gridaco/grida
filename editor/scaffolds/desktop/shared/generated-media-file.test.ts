import { describe, expect, it } from "vitest";
import { generatedMediaFile } from "./generated-media-file";
import { LocalGltfBundle } from "../media-formats/local-gltf-bundle";

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
});
