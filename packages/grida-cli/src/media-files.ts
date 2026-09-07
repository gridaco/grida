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

/** Local JSON input and generation artifacts. Provider filenames/URLs have no path authority. */
export namespace MediaFiles {
  const inputLimit = 16 * 1024 * 1024;
  export type Artifact = { data: Uint8Array; media_type: string };
  export type Metadata = {
    kind: string;
    model_id: string;
    provider_id: string;
    binding_id: string;
    variant: string;
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
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let stream: Readable;
    try {
      if (signal.aborted) throw new Failure("cancelled");
      if (source === "-") stream = stdin;
      else if (source.startsWith("@") && source.length > 1) {
        file = await open(
          path.resolve(source.slice(1)),
          constants.O_RDONLY | constants.O_NONBLOCK
        );
        const info = await file.stat();
        if (!info.isFile() || info.size > inputLimit)
          throw new Failure("input_unavailable");
        stream = file.createReadStream({
          autoClose: false,
          highWaterMark: 64 * 1024,
        });
      } else throw new Failure("invalid_input");
      const bytes = await readBounded(stream, signal, file !== undefined);
      try {
        const value: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        );
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw 0;
        return value;
      } catch {
        throw new Failure("invalid_input");
      }
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw new Failure(signal.aborted ? "cancelled" : "input_unavailable");
    } finally {
      await file?.close().catch(() => undefined);
    }
  }

  function readBounded(
    stream: Readable,
    signal: AbortSignal,
    owned: boolean
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
        clearTimeout(timer);
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
        if (size > inputLimit) {
          finish(new Failure("invalid_input"));
          return;
        }
        chunks.push(Buffer.from(chunk));
      };
      const end = () => finish();
      const failed = () => finish(new Failure("input_unavailable"));
      const abort = () => finish(new Failure("cancelled"));
      const timer = setTimeout(
        () => finish(new Failure("input_unavailable")),
        30_000
      );
      stream.on("data", data);
      stream.once("end", end);
      stream.once("error", failed);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
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
