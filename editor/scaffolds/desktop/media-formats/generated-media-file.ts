import type { ThreeDInputImage } from "@/lib/desktop/bridge";

export type EncodedMediaFile = Readonly<{
  base64: string;
  media_type: string;
}>;

export const THREE_D_INPUT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const THREE_D_INPUT_IMAGE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Decode a sidecar byte result into the same local `File` boundary as Open. */
export function generatedMediaFile(
  encoded: EncodedMediaFile,
  filename: string
): File {
  const binary = atob(encoded.base64.replace(/[\t\n\f\r ]/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: encoded.media_type });
}

/** Validate and encode the one-image 3D spike input. */
export async function encodeThreeDInputImage(
  file: File
): Promise<ThreeDInputImage> {
  if (
    !THREE_D_INPUT_IMAGE_MEDIA_TYPES.includes(
      file.type as ThreeDInputImage["media_type"]
    )
  ) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > THREE_D_INPUT_IMAGE_MAX_BYTES) {
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
