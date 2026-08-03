import type { ThreeDInputImage } from "@/lib/desktop/bridge";

type PromptImageAttachment = Readonly<{
  mediaType?: string;
  url: string;
}>;

/** Input contract for the current one-reference-image 3D generators. */
export namespace ThreeDReferenceImage {
  export const MAX_BYTES = 8 * 1024 * 1024;
  export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

  export function fromPromptAttachment(
    file: PromptImageAttachment | undefined
  ): ThreeDInputImage {
    if (!file) throw new Error("Add one reference image.");
    if (
      !file.mediaType ||
      !MEDIA_TYPES.includes(file.mediaType as ThreeDInputImage["media_type"])
    ) {
      throw new Error("Choose a PNG, JPEG, or WebP image.");
    }
    const marker = ";base64,";
    const markerIndex = file.url.indexOf(marker);
    if (!file.url.startsWith("data:") || markerIndex === -1) {
      throw new Error("Could not read the reference image.");
    }
    const base64 = file.url.slice(markerIndex + marker.length);
    if (!base64) throw new Error("The reference image is empty.");
    return {
      base64,
      media_type: file.mediaType as ThreeDInputImage["media_type"],
    };
  }

  export async function encode(file: File): Promise<ThreeDInputImage> {
    if (!MEDIA_TYPES.includes(file.type as ThreeDInputImage["media_type"])) {
      throw new Error("Choose a PNG, JPEG, or WebP image.");
    }
    if (file.size > MAX_BYTES) {
      throw new Error("The reference image must be 8 MiB or smaller.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunks: string[] = [];
    const chunkSize = 32 * 1024;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(
        String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
      );
    }
    return {
      base64: btoa(chunks.join("")),
      media_type: file.type as ThreeDInputImage["media_type"],
    };
  }
}
