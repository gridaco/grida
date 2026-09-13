// GRIDA-SEC-006 / GRIDA-SEC-012 — upload references require a separate live GG bearer.
// GRIDA-GG: gateway — tenant-bound, short-lived references to Tripo uploads.
import "server-only";
import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { ggConfig } from "./config";

/** Upload tickets identify input content; they never authorize AI or account access. */
export namespace ggUploads {
  const audience = "gg:tripo-upload";
  const lifetime = 900;
  export type Owner = { sub: string; org: number };
  export type MediaType = "image/png" | "image/jpeg" | "model/gltf-binary";
  export type File = {
    file_token: string;
    media_type: MediaType;
    byte_length: number;
  };

  export class Failure extends Error {
    constructor(readonly code: "invalid_upload" | "not_configured") {
      super(code);
      this.name = "GgUploadFailure";
    }
  }

  export function metadata(value: unknown): {
    media_type: MediaType;
    byte_length: number;
  } {
    if (!record(value) || !exact(value, ["media_type", "byte_length"]))
      throw new Failure("invalid_upload");
    const { media_type, byte_length } = value;
    if (
      typeof media_type !== "string" ||
      !["image/png", "image/jpeg", "model/gltf-binary"].includes(media_type) ||
      typeof byte_length !== "number" ||
      !Number.isSafeInteger(byte_length) ||
      byte_length <= 0 ||
      byte_length >
        (media_type === "model/gltf-binary" ? 60_000_000 : 20_000_000)
    )
      throw new Failure("invalid_upload");
    return { media_type: media_type as MediaType, byte_length };
  }

  export function uploadUrl(value: unknown): string {
    try {
      if (typeof value !== "string" || value.length > 8192) throw 0;
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "tripo-data.s3.us-west-2.amazonaws.com" ||
        url.username ||
        url.password ||
        url.port ||
        url.hash ||
        url.pathname === "/" ||
        !url.searchParams.get("X-Amz-Signature")
      )
        throw 0;
      return url.toString();
    } catch {
      throw new Failure("invalid_upload");
    }
  }

  export async function sign(owner: Owner, file: File): Promise<string> {
    validateOwner(owner);
    const info = metadata({
      media_type: file.media_type,
      byte_length: file.byte_length,
    });
    if (!identifier(file.file_token)) throw new Failure("invalid_upload");
    const { current } = keys();
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ org: owner.org, file_token: file.file_token, ...info })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setAudience(audience)
      .setSubject(owner.sub)
      .setIssuedAt(now)
      .setExpirationTime(now + lifetime)
      .sign(current);
  }

  export async function verify(
    owner: Owner,
    reference: unknown,
    expected: "image" | "mesh"
  ): Promise<File> {
    validateOwner(owner);
    if (
      !record(reference) ||
      !exact(reference, ["upload"]) ||
      typeof reference.upload !== "string" ||
      reference.upload.length > 4096
    )
      throw new Failure("invalid_upload");
    const { current, previous } = keys();
    for (const key of previous ? [current, previous] : [current]) {
      try {
        const { payload } = await jwtVerify(reference.upload, key, {
          audience,
          algorithms: ["HS256"],
          requiredClaims: ["iat", "exp", "sub"],
        });
        const { iat, exp } = payload;
        if (
          payload.sub !== owner.sub ||
          payload.org !== owner.org ||
          !Number.isSafeInteger(iat) ||
          !Number.isSafeInteger(exp) ||
          exp! <= iat! ||
          exp! - iat! > lifetime ||
          iat! > Math.floor(Date.now() / 1000) ||
          !identifier(payload.file_token)
        )
          throw 0;
        const info = metadata({
          media_type: payload.media_type,
          byte_length: payload.byte_length,
        });
        if ((info.media_type === "model/gltf-binary") !== (expected === "mesh"))
          throw 0;
        return { file_token: payload.file_token, ...info };
      } catch {
        // Rotation is verify-only. Neither a rejected reference nor its provider token is logged.
      }
    }
    throw new Failure("invalid_upload");
  }

  function keys(): { current: Uint8Array; previous: Uint8Array | null } {
    const { current, previous } = ggConfig.signing();
    if (!current) throw new Failure("not_configured");
    // Domain separation: an upload ticket cannot be an AI bearer even if its claims change.
    const derive = (key: Uint8Array) =>
      new Uint8Array(
        createHmac("sha256", key).update("grida.gg.tripo-upload.v1").digest()
      );
    return {
      current: derive(current),
      previous: previous ? derive(previous) : null,
    };
  }
  function validateOwner(owner: Owner) {
    if (
      !owner ||
      typeof owner.sub !== "string" ||
      !owner.sub ||
      !Number.isSafeInteger(owner.org) ||
      owner.org <= 0
    )
      throw new Failure("invalid_upload");
  }
  function identifier(value: unknown): value is string {
    return (
      typeof value === "string" &&
      (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value
      ) ||
        /^file_[A-Za-z0-9_-]{1,100}$/.test(value))
    );
  }
  function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function exact(value: Record<string, unknown>, names: string[]) {
    return (
      Object.keys(value).length === names.length &&
      Object.keys(value).every((key) => names.includes(key))
    );
  }
}
