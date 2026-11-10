import "server-only";

import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import { LibraryCAS } from "./cas";
import { LibraryStorage } from "./storage";

/** Immutable Library bytes. Catalog registration remains with the caller. */
export class LibraryTigris {
  static readonly maxBytes = 30 * 1024 * 1024;
  static readonly uploadTimeoutMs = 120_000;

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) {}

  static fromEnv(): LibraryTigris {
    const bucket = process.env.GRIDA_LIBRARY_TIGRIS_BUCKET;
    const accessKeyId = process.env.GRIDA_LIBRARY_TIGRIS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.GRIDA_LIBRARY_TIGRIS_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error("Missing Library Tigris bucket or credentials");
    }
    const endpoint = new URL(
      process.env.GRIDA_LIBRARY_TIGRIS_ENDPOINT ?? "https://t3.storage.dev"
    );
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
      endpoint.hostname
    );
    if (
      endpoint.protocol !== "https:" &&
      !(loopback && endpoint.protocol === "http:")
    ) {
      throw new Error(
        "Library Tigris endpoint requires HTTPS or loopback HTTP"
      );
    }
    return new LibraryTigris(
      new S3Client({
        endpoint: endpoint.href,
        region: "auto",
        forcePathStyle: loopback,
        credentials: { accessKeyId, secretAccessKey },
        // A conditional rejection can arrive while the upload is in flight.
        // Keep transport errors in request promises and HEAD verification fresh.
        requestHandler: new FetchHttpHandler({
          cache: "no-store",
          requestInit: () => ({ redirect: "error" }),
        }),
        maxAttempts: 3,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
      bucket
    );
  }

  /** Conditional create plus byte verification also recovers uncertain PUTs. */
  async upload(
    bytes: Uint8Array,
    mimetype: string
  ): Promise<{ path: string; sha256: string }> {
    if (!bytes.length || bytes.length > LibraryTigris.maxBytes) {
      throw new Error("Library uploads require 1 byte to 30 MiB");
    }
    const controller = new AbortController();
    // One budget includes SDK retries, recovery attempts and response bodies.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        const error = new Error("Library upload timed out");
        controller.abort(error);
        reject(error);
      }, LibraryTigris.uploadTimeoutMs);
    });
    try {
      return await Promise.race([
        this.uploadBytes(bytes, mimetype, controller.signal),
        deadline,
      ]);
    } catch (error) {
      controller.signal.throwIfAborted();
      throw error;
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }

  private async uploadBytes(
    bytes: Uint8Array,
    mimetype: string,
    signal: AbortSignal
  ): Promise<{ path: string; sha256: string }> {
    const sha256 = LibraryCAS.sha256Hex(bytes);
    const path = LibraryStorage.key(sha256, mimetype);
    const expected = Buffer.from(sha256, "hex").toString("base64");
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      try {
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: path,
            Body: bytes,
            ContentLength: bytes.length,
            ContentType: mimetype,
            CacheControl: "public, max-age=31536000, immutable",
            ChecksumSHA256: expected,
            IfNoneMatch: "*",
          }),
          { abortSignal: signal }
        );
      } catch (error) {
        signal.throwIfAborted();
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (status && status !== 409 && status !== 412 && status < 500)
          throw error;
      }
      try {
        signal.throwIfAborted();
        const head = await this.client.send(
          new HeadObjectCommand({
            Bucket: this.bucket,
            Key: path,
            ChecksumMode: "ENABLED",
          }),
          { abortSignal: signal }
        );
        signal.throwIfAborted();
        if (
          head.ContentLength !== bytes.length ||
          head.ContentType !== mimetype ||
          head.ChecksumType !== "FULL_OBJECT" ||
          head.ChecksumSHA256 !== expected
        ) {
          throw new Error(
            "Library Tigris object does not match its content address"
          );
        }
        await this.verifyBytes(path, sha256, bytes.length, mimetype, signal);
        signal.throwIfAborted();
        return { path, sha256 };
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata?.httpStatusCode;
        if (status !== 404 || attempt === 2) throw error;
      }
    }
    throw new Error("Library upload could not be confirmed");
  }

  private async verifyBytes(
    path: string,
    sha256: string,
    length: number,
    mimetype: string,
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted();
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: path }),
      { abortSignal: signal }
    );
    if (!object.Body) throw new Error("Library Tigris object has no byte body");
    const reader = object.Body.transformToWebStream().getReader();
    const cancel = () => {
      void reader.cancel(signal.reason).catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      signal.throwIfAborted();
      if (object.ContentLength !== length || object.ContentType !== mimetype)
        throw new Error(
          "Library Tigris object does not match its content address"
        );
      // Tigris can echo a caller-supplied checksum for different stored bytes.
      // Hash the actual body for both new writes and existing-key adoption.
      const hash = createHash("sha256");
      let received = 0;
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        received += value.byteLength;
        if (received > length)
          throw new Error("Library Tigris object exceeds its expected size");
        hash.update(value);
      }
      if (received !== length || hash.digest("hex") !== sha256)
        throw new Error(
          "Library Tigris object does not match its content address"
        );
    } finally {
      signal.removeEventListener("abort", cancel);
      // Cancellation itself must not extend an expired upload's deadline.
      cancel();
      reader.releaseLock();
    }
  }
}
