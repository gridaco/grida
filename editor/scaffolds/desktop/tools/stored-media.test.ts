import { describe, expect, it } from "vitest";
import type { DesktopMediaReadResult, MediaItem } from "@/lib/desktop/bridge";
import { StoredMedia } from "./stored-media";

const glbItem = {
  id: "5fa0fb80-dfd6-4a80-8786-c5bd086d8911",
  file_name: "robot.glb",
  media_type: "model/gltf-binary",
  byte_size: 4,
  created_at: 1,
} satisfies MediaItem;

describe("StoredMedia", () => {
  it("routes saved formats to their existing viewer tools", () => {
    expect(StoredMedia.href(glbItem)).toBe(
      "/desktop/tools?tool=3d-viewer&item=5fa0fb80-dfd6-4a80-8786-c5bd086d8911"
    );
    expect(
      StoredMedia.href({
        ...glbItem,
        id: "audio-id",
        file_name: "theme.mp3",
        media_type: "audio/mpeg",
      })
    ).toBe("/desktop/tools?tool=audio-player&item=audio-id");
    expect(
      StoredMedia.href({
        ...glbItem,
        id: "image-id",
        file_name: "still.png",
        media_type: "image/png",
      })
    ).toBe("/desktop/tools?tool=image-viewer&item=image-id");
    expect(
      StoredMedia.href({
        ...glbItem,
        id: "video-id",
        file_name: "clip.mp4",
        media_type: "video/mp4",
      })
    ).toBe("/desktop/tools?tool=video-viewer&item=video-id");
  });

  it("rebuilds the same local File boundary used by generation and Open", async () => {
    const preview = StoredMedia.preview({
      item: glbItem,
      bytes: Uint8Array.from(new TextEncoder().encode("glTF")).buffer,
    } satisfies DesktopMediaReadResult);

    expect(preview.mode).toBe("3d");
    expect(preview.file.name).toBe("robot.glb");
    expect(preview.file.type).toBe("model/gltf-binary");
    expect(new TextDecoder().decode(await preview.file.arrayBuffer())).toBe(
      "glTF"
    );
  });

  it("rebuilds visual results as exact File-backed viewer inputs", async () => {
    const image = {
      item: {
        ...glbItem,
        file_name: "still.png",
        media_type: "image/png",
      },
      bytes: Uint8Array.from([0]).buffer,
    } satisfies DesktopMediaReadResult;

    const imagePreview = StoredMedia.preview(image);
    expect(imagePreview.mode).toBe("image");
    expect(imagePreview.file.name).toBe("still.png");
    expect(imagePreview.file.type).toBe("image/png");
    expect(new Uint8Array(await imagePreview.file.arrayBuffer())).toEqual(
      Uint8Array.from([0])
    );

    const videoPreview = StoredMedia.preview({
      item: {
        ...glbItem,
        file_name: "clip.webm",
        media_type: "video/webm",
      },
      bytes: Uint8Array.from([1, 2, 3]).buffer,
    });
    expect(videoPreview.mode).toBe("video");
    expect(videoPreview.file.name).toBe("clip.webm");
    expect(new Uint8Array(await videoPreview.file.arrayBuffer())).toEqual(
      Uint8Array.from([1, 2, 3])
    );
  });

  it("keeps unsupported audio families out of Recents", () => {
    expect(
      StoredMedia.isSupported({
        ...glbItem,
        file_name: "score.mid",
        media_type: "audio/midi",
      })
    ).toBe(false);
    expect(
      StoredMedia.isSupported({
        ...glbItem,
        file_name: "notes.txt",
        media_type: "text/plain",
      })
    ).toBe(false);
  });

  it("labels saved visual formats", () => {
    expect(
      StoredMedia.formatLabel({
        ...glbItem,
        file_name: "still.jpg",
        media_type: "image/jpeg",
      })
    ).toBe("JPEG");
    expect(
      StoredMedia.formatLabel({
        ...glbItem,
        file_name: "clip.mov",
        media_type: "video/quicktime",
      })
    ).toBe("MOV");
  });
});
