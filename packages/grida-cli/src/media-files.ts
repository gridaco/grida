// GRIDA-SEC-013 — explicit bounded input and private, non-overwriting media publication.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rmdir,
  unlink,
  link,
} from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

/** Explicit local inputs and generation artifacts. Provider filenames/URLs have no path authority. */
export namespace MediaFiles {
  export const inputLimits = Object.freeze({
    text: 16 * 1024 * 1024,
    image: 8 * 1024 * 1024,
  });
  export type Artifact = { data: Uint8Array; media_type: string };
  export type Metadata = {
    kind: string;
    model_id: string;
    provider_id: string;
    binding_id: string;
    variant: string;
    feature?: "model-generation" | "rigging";
    task?: { id: string; credits_consumed?: number };
  };
  export type Saved = {
    path: string;
    media_type: string;
    bytes: number;
    sha256: string;
  };
  export type Receipt = Metadata & {
    version: 1;
    id: string;
    created_at: string;
    directory: string;
    artifacts: readonly Saved[];
  };

  export class Failure extends Error {
    constructor(
      readonly code:
        | "input_unavailable"
        | "invalid_input"
        | "output_unavailable"
        | "save_failed"
        | "cancelled",
      readonly directory?: string,
      readonly saved?: readonly Saved[]
    ) {
      super(code);
    }
  }

  /** Explicit input only: no repository config, path interpolation or URL fetching. */
  export async function readInput(
    source: string,
    signal: AbortSignal,
    stdin: Readable = process.stdin
  ): Promise<unknown> {
    if (signal.aborted) throw new Failure("cancelled");
    if (source !== "-" && (!source.startsWith("@") || source.length === 1))
      throw new Failure("invalid_input");
    const bytes = await readBytes(
      source === "-" ? source : source.slice(1),
      signal,
      inputLimits.text,
      source === "-" ? stdin : undefined
    );
    try {
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      );
      if (!value || typeof value !== "object" || Array.isArray(value)) throw 0;
      return value;
    } catch {
      throw new Failure("invalid_input");
    }
  }

  /** Preserve text exactly; '-' explicitly allocates stdin. File paths are literal. */
  export async function readText(
    source: string,
    signal: AbortSignal,
    stdin: Readable = process.stdin
  ): Promise<string> {
    checkFileSource(source);
    const bytes = await readBytes(
      source,
      signal,
      inputLimits.text,
      source === "-" ? stdin : undefined
    );
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes
      );
    } catch {
      throw new Failure("invalid_input");
    }
  }

  /** Snapshot one regular file. MIME comes from bounded headers, never its name. */
  export async function readImage(
    source: string,
    signal: AbortSignal,
    maximumBytes: number = inputLimits.image
  ): Promise<Artifact> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0)
      throw new Failure("invalid_input");
    if (source === "-") throw new Failure("invalid_input");
    checkFileSource(source);
    const data = await readBytes(
      source,
      signal,
      Math.min(maximumBytes, inputLimits.image)
    );
    const media_type = imageType(data);
    if (!media_type) throw new Failure("invalid_input");
    return { data, media_type };
  }

  function checkFileSource(source: string): void {
    if (!source || /^(?:[a-z][a-z\d+.-]*:\/\/|data:|file:)/i.test(source))
      throw new Failure("invalid_input");
  }

  /** Read one explicitly selected GLB; the SDK validates the complete mesh contract. */
  export async function readMesh(
    source: string,
    signal: AbortSignal,
    maximumBytes: number
  ): Promise<Artifact> {
    if (
      source === "-" ||
      !Number.isSafeInteger(maximumBytes) ||
      maximumBytes <= 0 ||
      maximumBytes > 64 * 1024 * 1024
    )
      throw new Failure("invalid_input");
    checkFileSource(source);
    const data = await readBytes(source, signal, maximumBytes);
    if (
      data.length < 20 ||
      data.readUInt32LE(0) !== 0x46546c67 ||
      data.readUInt32LE(4) !== 2 ||
      data.readUInt32LE(8) !== data.length
    )
      throw new Failure("invalid_input");
    return { data, media_type: "model/gltf-binary" };
  }

  async function readBytes(
    source: string,
    signal: AbortSignal,
    limit: number,
    stdin?: Readable
  ): Promise<Buffer> {
    if (signal.aborted) throw new Failure("cancelled");
    const lifetime = new AbortController();
    const abort = () => lifetime.abort(new Failure("cancelled"));
    const timer = setTimeout(
      () => lifetime.abort(new Failure("input_unavailable")),
      30_000
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    try {
      // Opening/statting a remote-mounted file can stall too. The caller's
      // deadline includes those operations; late completion only closes its fd.
      return await new Promise<Buffer>((resolve, reject) => {
        const stopped = () => reject(lifetime.signal.reason);
        lifetime.signal.addEventListener("abort", stopped, { once: true });
        void readSource(source, lifetime.signal, limit, stdin)
          .then(resolve, reject)
          .finally(() => lifetime.signal.removeEventListener("abort", stopped));
        if (lifetime.signal.aborted) stopped();
      });
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw new Failure(signal.aborted ? "cancelled" : "input_unavailable");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }

  async function readSource(
    source: string,
    signal: AbortSignal,
    limit: number,
    stdin?: Readable
  ): Promise<Buffer> {
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      signal.throwIfAborted();
      let stream: Readable;
      if (stdin) stream = stdin;
      else {
        file = await open(
          path.resolve(source),
          constants.O_RDONLY | constants.O_NONBLOCK
        );
        signal.throwIfAborted();
        const info = await file.stat();
        signal.throwIfAborted();
        if (!info.isFile() || info.size > limit)
          throw new Failure("input_unavailable");
        stream = file.createReadStream({
          autoClose: false,
          highWaterMark: 64 * 1024,
        });
      }
      return await readBounded(stream, signal, file !== undefined, limit);
    } finally {
      await file?.close().catch(() => undefined);
    }
  }

  function readBounded(
    stream: Readable,
    signal: AbortSignal,
    owned: boolean,
    limit: number
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      const finish = (error?: Failure) => {
        if (settled) return;
        settled = true;
        stream.removeListener("data", data);
        stream.removeListener("end", end);
        signal.removeEventListener("abort", abort);
        stream.pause();
        // A pending read may fail while an owned file stream is closing. Observe
        // that error too; it must never escape as a raw Node diagnostic.
        stream.once("close", () => stream.removeListener("error", failed));
        if (owned) stream.destroy();
        if (error) reject(error);
        else resolve(Buffer.concat(chunks, size));
      };
      const data = (chunk: unknown) => {
        if (!(chunk instanceof Uint8Array)) {
          finish(new Failure("invalid_input"));
          return;
        }
        size += chunk.byteLength;
        if (size > limit) {
          finish(new Failure("invalid_input"));
          return;
        }
        chunks.push(Buffer.from(chunk));
      };
      const end = () => finish();
      const failed = () => finish(new Failure("input_unavailable"));
      const abort = () => finish(signal.reason as Failure);
      stream.on("data", data);
      stream.once("end", end);
      stream.once("error", failed);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  /** Container/header admission only: compressed pixels remain provider input. */
  function imageType(bytes: Buffer): string | undefined {
    if (
      bytes.length >= 33 &&
      bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
      bytes.readUInt32BE(8) === 13 &&
      bytes.toString("latin1", 12, 16) === "IHDR" &&
      bytes.readUInt32BE(16) > 0 &&
      bytes.readUInt32BE(16) <= 0x7fffffff &&
      bytes.readUInt32BE(20) > 0 &&
      bytes.readUInt32BE(20) <= 0x7fffffff &&
      bytes[26] === 0 &&
      bytes[27] === 0 &&
      bytes[28]! <= 1
    ) {
      const depth = bytes[24]!;
      const color = bytes[25]!;
      if (
        (color === 0 && [1, 2, 4, 8, 16].includes(depth)) ||
        ([2, 4, 6].includes(color) && [8, 16].includes(depth)) ||
        (color === 3 && [1, 2, 4, 8].includes(depth))
      )
        return "image/png";
    }
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      let frame = false;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 0xff) return;
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === undefined || offset + 2 > bytes.length) return;
        const length = bytes.readUInt16BE(offset);
        if (length < 2 || offset + length > bytes.length) return;
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          ![0xc4, 0xc8, 0xcc].includes(marker)
        ) {
          if (
            length < 8 ||
            bytes[offset + 2]! < 2 ||
            bytes[offset + 2]! > 16 ||
            !bytes.readUInt16BE(offset + 3) ||
            !bytes.readUInt16BE(offset + 5) ||
            !bytes[offset + 7] ||
            length !== 8 + 3 * bytes[offset + 7]!
          )
            return;
          frame = true;
        }
        if (marker === 0xda) {
          if (
            frame &&
            length >= 6 &&
            bytes[offset + 2]! > 0 &&
            length === 6 + 2 * bytes[offset + 2]! &&
            offset + length < bytes.length - 2 &&
            bytes[bytes.length - 2] === 0xff &&
            bytes[bytes.length - 1] === 0xd9
          )
            return "image/jpeg";
          return;
        }
        offset += length;
      }
    }
    if (
      bytes.length >= 20 &&
      bytes.toString("latin1", 0, 4) === "RIFF" &&
      bytes.readUInt32LE(4) === bytes.length - 8 &&
      bytes.toString("latin1", 8, 12) === "WEBP"
    ) {
      let offset = 12;
      let image = false;
      while (offset + 8 <= bytes.length) {
        const kind = bytes.toString("latin1", offset, offset + 4);
        const length = bytes.readUInt32LE(offset + 4);
        const start = offset + 8;
        if (length > bytes.length - start) return;
        if (kind === "VP8 ") {
          if (
            length < 10 ||
            bytes[start]! & 1 ||
            bytes.toString("hex", start + 3, start + 6) !== "9d012a" ||
            !(bytes.readUInt16LE(start + 6) & 0x3fff) ||
            !(bytes.readUInt16LE(start + 8) & 0x3fff)
          )
            return;
          image = true;
        } else if (kind === "VP8L") {
          if (length < 5 || bytes[start] !== 0x2f || bytes[start + 4]! >> 5)
            return;
          image = true;
        } else if (kind === "VP8X") {
          if (
            length !== 10 ||
            bytes[start]! & 0xc1 ||
            bytes.readUIntBE(start + 1, 3) !== 0
          )
            return;
        }
        offset = start + length + (length & 1);
      }
      if (image && offset === bytes.length) return "image/webp";
    }
  }

  /** Reserve a fresh directory before submission; never reuse or overwrite one. */
  export async function prepare(target: string): Promise<Directory> {
    try {
      const selected = path.resolve(target);
      const parent = await realpath(path.dirname(selected));
      const directory = path.join(parent, path.basename(selected));
      await mkdir(directory, { mode: 0o700 });
      const stat = await lstat(directory);
      return await Directory.create(directory, stat.dev, stat.ino);
    } catch {
      throw new Failure("output_unavailable");
    }
  }

  export class Directory {
    #used = false;
    constructor(
      readonly path: string,
      private readonly device: number,
      private readonly inode: number
    ) {}

    static async create(
      directory: string,
      device: number,
      inode: number
    ): Promise<Directory> {
      const reservation = new Directory(directory, device, inode);
      const probe = `.grida-probe-${randomUUID()}`;
      try {
        // A writable directory is insufficient: output publication also needs
        // hard links (unavailable on some removable filesystems). Exercise the
        // actual write/sync/link primitive before a paid operation can start.
        await reservation.#publish(probe, Uint8Array.of(0));
        await reservation.#check();
        await unlink(path.join(directory, probe));
        return reservation;
      } catch {
        try {
          await reservation.#check();
          await unlink(path.join(directory, probe));
        } catch {
          // Only our exact probe is eligible for cleanup; never recurse.
        }
        await reservation.abandon();
        throw new Failure("output_unavailable");
      }
    }

    async #check() {
      const stat = await lstat(this.path);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.dev !== this.device ||
        stat.ino !== this.inode
      )
        throw new Error();
    }

    /** Cancellation cannot discard an already returned paid result: save it to completion. */
    async save(
      metadata: Metadata,
      artifacts: readonly Artifact[]
    ): Promise<Receipt> {
      const saved: Saved[] = [];
      try {
        if (this.#used || !artifacts.length || artifacts.length > 16) throw 0;
        this.#used = true;
        let total = 0;
        for (const artifact of artifacts) {
          total += artifact.data.byteLength;
          if (!artifact.data.byteLength || total > 64 * 1024 * 1024) throw 0;
        }
        const receipt: Receipt = {
          version: 1,
          id: randomUUID(),
          created_at: new Date().toISOString(),
          kind: metadata.kind,
          model_id: metadata.model_id,
          provider_id: metadata.provider_id,
          binding_id: metadata.binding_id,
          variant: metadata.variant,
          ...(metadata.feature === "rigging"
            ? { feature: metadata.feature }
            : {}),
          ...(metadata.task
            ? {
                task: {
                  id: metadata.task.id,
                  ...(metadata.task.credits_consumed === undefined
                    ? {}
                    : { credits_consumed: metadata.task.credits_consumed }),
                },
              }
            : {}),
          directory: this.path,
          artifacts: saved,
        };
        for (const [index, artifact] of artifacts.entries()) {
          const extension = Object.hasOwn(extensions, artifact.media_type)
            ? extensions[artifact.media_type]
            : "bin";
          const name = `output-${index + 1}.${extension}`;
          await this.#publish(name, artifact.data);
          saved.push({
            path: path.join(this.path, name),
            media_type: artifact.media_type,
            bytes: artifact.data.byteLength,
            sha256: createHash("sha256").update(artifact.data).digest("hex"),
          });
        }
        await this.#publish(
          "receipt.json",
          Buffer.from(JSON.stringify(receipt, null, 2) + "\n")
        );
        return receipt;
      } catch {
        throw new Failure("save_failed", this.path, saved);
      }
    }

    async #publish(name: string, bytes: Uint8Array) {
      await this.#check();
      const temporary = path.join(this.path, `.grida-${randomUUID()}.tmp`);
      let file: Awaited<ReturnType<typeof open>> | undefined;
      try {
        file = await open(
          temporary,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600
        );
        await file.writeFile(bytes);
        await file.sync();
        await file.close();
        file = undefined;
        await this.#check();
        // link is atomic and refuses an existing target; rename can overwrite it.
        await link(temporary, path.join(this.path, name));
      } finally {
        await file?.close().catch(() => undefined);
        await unlink(temporary).catch(() => undefined);
      }
    }

    /** Only remove our still-empty reservation; never recursively delete user output. */
    async abandon(): Promise<void> {
      try {
        await this.#check();
        await rmdir(this.path);
      } catch {
        /* An existing file or changed directory remains untouched. */
      }
    }
  }

  const extensions: Readonly<Record<string, string>> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "model/gltf-binary": "glb",
  };
}
