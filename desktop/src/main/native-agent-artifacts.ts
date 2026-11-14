// GRIDA-SEC-004 — only bounded PNG bytes leave the attached native chat.
import type { NativeChatImageArtifact } from "@grida/desktop-bridge";

const MAX_ARTIFACTS = 8;
const MAX_BYTES = 256 * 1024;
const MAX_BASE64 = Math.ceil(MAX_BYTES / 3) * 4;
const MAX_PIXELS = 4 * 1024 * 1024;
const IDENTITY = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class NativeAgentArtifacts {
  static readonly capability = "co.grida/session/artifacts";
  static readonly readMethod = "_co.grida/session/read-artifact";

  static describe(value: unknown): readonly NativeChatImageArtifact[] {
    if (!Array.isArray(value) || value.length > MAX_ARTIFACTS) throw invalid();
    const ids = new Set<string>();
    return Object.freeze(
      value.map((entry: unknown) => {
        const { id, kind, mimeType, label, width, height, bytes } =
          record(entry);
        if (
          typeof id !== "string" ||
          !IDENTITY.test(id) ||
          ids.has(id) ||
          kind !== "image" ||
          mimeType !== "image/png" ||
          label !== "Cropped PNG" ||
          !positiveInteger(width, MAX_PIXELS) ||
          !positiveInteger(height, MAX_PIXELS) ||
          width * height > MAX_PIXELS ||
          !positiveInteger(bytes, MAX_BYTES) ||
          bytes < 33
        )
          throw invalid();
        ids.add(id);
        return Object.freeze({
          id,
          kind,
          mimeType,
          label,
          width,
          height,
          bytes,
        });
      })
    );
  }

  static decode(
    value: unknown,
    artifact: NativeChatImageArtifact
  ): ArrayBuffer {
    const { artifactId, mimeType, data } = record(value);
    if (
      artifactId !== artifact.id ||
      mimeType !== artifact.mimeType ||
      typeof data !== "string" ||
      data.length > MAX_BASE64 ||
      data.length !== Math.ceil(artifact.bytes / 3) * 4
    )
      throw invalid();
    const bytes = Buffer.from(data, "base64");
    if (
      bytes.length !== artifact.bytes ||
      bytes.length < 33 ||
      bytes.toString("base64") !== data ||
      !bytes.subarray(0, PNG.length).equals(PNG) ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.readUInt32BE(16) !== artifact.width ||
      bytes.readUInt32BE(20) !== artifact.height
    )
      throw invalid();
    return Uint8Array.from(bytes).buffer;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= max
  );
}

function invalid(): Error {
  return new Error("native_chat_artifact_invalid");
}
