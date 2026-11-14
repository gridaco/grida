"use server";

import { createHash } from "node:crypto";
import {
  isSupportedImageType,
  LIBRARY_ATTACHMENT_SOURCE_LIMITS,
} from "@/lib/agent-chat/image-attachment";
import { createLibraryClient } from "@/lib/supabase/server";

const OBJECT_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const LIBRARY_BUCKET = "/storage/v1/object/public/library/";
const READ_TIMEOUT_MS = 8000;

/** Materialize one catalog selection through the Library's public asset owner. */
export async function readLibraryAttachment(
  id: string
): Promise<{ mime: string; bytes: ArrayBuffer } | null> {
  if (typeof id !== "string" || !OBJECT_ID.test(id)) return null;

  try {
    const client = await createLibraryClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return null;
    const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
    const { data: object, error } = await client
      .from("object")
      .select("path,mimetype,bytes,width,height,sha256")
      .eq("id", id)
      .abortSignal(signal)
      .single();
    if (
      error ||
      !object ||
      !isSupportedImageType(object.mimetype) ||
      !Number.isSafeInteger(object.bytes) ||
      object.bytes <= 0 ||
      object.bytes > LIBRARY_ATTACHMENT_SOURCE_LIMITS.bytes ||
      !Number.isSafeInteger(object.width) ||
      !Number.isSafeInteger(object.height) ||
      object.width <= 0 ||
      object.height <= 0 ||
      object.width * object.height > LIBRARY_ATTACHMENT_SOURCE_LIMITS.pixels
    )
      return null;

    const url = libraryObjectUrl(object.path);
    if (!url) return null;
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal,
    });
    const mime = response.headers.get("content-type")?.split(";", 1)[0].trim();
    const length = response.headers.get("content-length");
    if (
      !response.ok ||
      response.redirected ||
      mime !== object.mimetype ||
      (length !== null && Number(length) !== object.bytes)
    ) {
      void response.body?.cancel().catch(() => undefined);
      return null;
    }

    const bytes = await readBody(response.body, object.bytes, signal);
    if (
      !bytes ||
      (object.sha256 &&
        createHash("sha256").update(bytes).digest("hex") !== object.sha256)
    )
      return null;
    return { mime, bytes: bytes.buffer };
  } catch {
    return null;
  }
}

function libraryObjectUrl(path: string): URL | null {
  const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    path.length > 2048 ||
    /[\\%\p{Cc}]/u.test(path)
  )
    return null;
  const segments = path.split("/");
  if (segments.some((part) => !part || part === "." || part === ".."))
    return null;
  return new URL(
    LIBRARY_BUCKET + segments.map(encodeURIComponent).join("/"),
    base.origin
  );
}

async function readBody(
  body: ReadableStream<Uint8Array> | null,
  size: number,
  signal: AbortSignal
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!body) return null;
  const reader = body.getReader();
  const bytes = new Uint8Array(size);
  let offset = 0;
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        complete = true;
        return offset === size ? bytes : null;
      }
      if (value.length > size - offset) return null;
      bytes.set(value, offset);
      offset += value.length;
    }
  } finally {
    if (!complete) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
