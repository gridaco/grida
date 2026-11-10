// GRIDA-SEC-004 / GRIDA-SEC-014 — one exact read-only workspace under Seatbelt.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import type { WorkspaceFileBody } from "@grida/daemon/server";
import {
  WorkspaceMediaError,
  type WorkspaceMediaGrant,
} from "./workspace-media-registry";

const MAX_WORKERS = 8;
const MAX_HEADER_BYTES = 128;
const START_TIMEOUT_MS = 5_000;
const CLOSE_TIMEOUT_MS = 2_000;

type Exit = { code: number | null };

export class WorkspaceFileWorkers {
  private readonly active = new Set<ChildProcessWithoutNullStreams>();
  private closed = false;

  constructor(private readonly resourcesPath: string) {}

  async open(
    grant: WorkspaceMediaGrant,
    relPath: string,
    signal: AbortSignal,
    includeModified = false
  ): Promise<WorkspaceFileBody & { mtime?: number }> {
    if (signal.aborted) throw cancelled();
    const executable = await installedAgent(this.resourcesPath);
    if (this.closed || this.active.size >= MAX_WORKERS) {
      throw new WorkspaceMediaError(503, "workspace_media_worker_capacity");
    }
    if (signal.aborted) throw cancelled();
    const openFrame =
      JSON.stringify({
        ...grant,
        path: relPath,
        ...(includeModified && { includeModified: true }),
      }) + "\n";
    if (Buffer.byteLength(openFrame) > 32 * 1024) {
      throw new WorkspaceMediaError(400, "workspace_media_open_limit");
    }
    const child = spawn(
      "/usr/bin/sandbox-exec",
      [...sandboxArguments(executable, grant), executable, "workspace-file"],
      {
        cwd: grant.root,
        env: {},
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    this.active.add(child);
    const abort = () => terminate(child);
    signal.addEventListener("abort", abort, { once: true });
    const exited = new Promise<Exit>((resolve) =>
      child.once("close", (code) => {
        signal.removeEventListener("abort", abort);
        this.active.delete(child);
        resolve({ code });
      })
    );
    child.on("error", () => {});
    child.stdin.on("error", abort);
    let diagnostic = "";
    child.stderr.on("data", (chunk: Buffer) => {
      diagnostic += chunk
        .subarray(0, Math.max(0, 1024 - diagnostic.length))
        .toString("utf8");
    });
    const output: AsyncIterator<Buffer> = child.stdout[Symbol.asyncIterator]();
    const deadline = setTimeout(abort, START_TIMEOUT_MS);
    try {
      child.stdin.write(openFrame);
      const metadata = await readMetadata(output, includeModified);
      if (signal.aborted) throw cancelled();
      let consumed = false;
      return {
        ...metadata,
        close: async () => {
          if (consumed) {
            abort();
            await exitWithin(exited);
            return;
          }
          consumed = true;
          child.stdin.end();
          await verifyExit(exited, abort);
        },
        stream: (offset, length) => {
          if (consumed) throw unavailable();
          consumed = true;
          child.stdin.end(
            JSON.stringify({ offset: String(offset), length: String(length) }) +
              "\n"
          );
          return streamSpan(output, length, signal, exited, abort);
        },
      };
    } catch (error) {
      abort();
      await exitWithin(exited);
      if (signal.aborted) throw cancelled();
      throw workerError(diagnostic, error);
    } finally {
      clearTimeout(deadline);
    }
  }

  close() {
    this.closed = true;
    for (const child of this.active) terminate(child);
  }
}

function terminate(child: ChildProcessWithoutNullStreams) {
  child.kill("SIGKILL");
  child.stdin.destroy();
  // Backpressure can keep stdout paused even after the process exits. Release
  // the pipe so the owner's close receipt can arrive without a body consumer.
  child.stdout.destroy();
}

function streamSpan(
  output: AsyncIterator<Buffer>,
  length: number,
  signal: AbortSignal,
  exited: Promise<Exit>,
  abort: () => void
) {
  let remaining = length;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (signal.aborted) throw cancelled();
        const item = await output.next();
        if (signal.aborted) throw cancelled();
        if (item.done) {
          await verifyExit(exited, abort);
          if (remaining !== 0) throw unavailable();
          controller.close();
        } else {
          const bytes = item.value;
          if (bytes.length > remaining) throw unavailable();
          remaining -= bytes.length;
          controller.enqueue(bytes);
        }
      } catch (error) {
        abort();
        controller.error(error);
      }
    },
    async cancel() {
      abort();
      await exitWithin(exited);
    },
  });
}

async function readMetadata(
  output: AsyncIterator<Buffer>,
  includeModified: boolean
): Promise<{ size: number; mtime?: number }> {
  let header = Buffer.alloc(0);
  for (;;) {
    const item = await output.next();
    if (item.done) throw unavailable();
    if (header.length + item.value.length > MAX_HEADER_BYTES)
      throw unavailable();
    header = Buffer.concat([header, item.value]);
    const end = header.indexOf(10);
    if (end < 0) continue;
    if (end !== header.length - 1) throw unavailable();
    const parsed: unknown = JSON.parse(header.toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Object.keys(parsed).length !== (includeModified ? 2 : 1) ||
      !("size" in parsed) ||
      typeof parsed.size !== "string" ||
      !/^\d+$/.test(parsed.size)
    ) {
      throw unavailable();
    }
    const size = Number(parsed.size);
    if (!Number.isSafeInteger(size)) throw unavailable();
    if (!includeModified) return { size };
    if (
      !("mtime" in parsed) ||
      typeof parsed.mtime !== "number" ||
      !Number.isFinite(parsed.mtime)
    )
      throw unavailable();
    return { size, mtime: parsed.mtime };
  }
}

async function verifyExit(exited: Promise<Exit>, abort: () => void) {
  const result = await exitWithin(exited);
  if (!result) abort();
  if (result?.code !== 0) throw unavailable();
}

async function exitWithin(exited: Promise<Exit>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      exited,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), CLOSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function installedAgent(resourcesPath: string) {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw unavailable();
  }
  const directory = path.join(resourcesPath, "native-agent");
  const executable = path.join(directory, "grida-agent");
  try {
    const [root, file, real] = await Promise.all([
      fs.lstat(directory),
      fs.lstat(executable),
      fs.realpath(executable),
    ]);
    if (
      !root.isDirectory() ||
      !file.isFile() ||
      real !== executable ||
      (root.mode & 0o022) !== 0 ||
      (file.mode & 0o022) !== 0 ||
      (file.mode & 0o111) === 0
    ) {
      throw unavailable();
    }
  } catch {
    throw unavailable();
  }
  return executable;
}

function sandboxArguments(executable: string, grant: WorkspaceMediaGrant) {
  const rules = [
    "(version 1)",
    "(deny default)",
    '(allow process-exec file-read* file-map-executable (literal (param "EXE")))',
    '(allow file-read* (subpath (param "ROOT")))',
    '(allow file-read-metadata file-test-existence (path-ancestors (param "EXE")) (path-ancestors (param "ROOT")))',
    '(allow file-read* file-map-executable (subpath "/System/Library") (subpath "/usr/lib"))',
    '(allow file-read* file-test-existence (literal "/"))',
    '(allow file-read* file-write-data (literal "/dev/null"))',
    '(allow sysctl-read (sysctl-name "hw.logicalcpu") (sysctl-name "hw.activecpu") (sysctl-name "hw.pagesize") (sysctl-name "hw.pagesize_compat"))',
  ];
  const args = ["-D", `EXE=${executable}`, "-D", `ROOT=${grant.root}`];
  grant.protected.forEach((target, index) => {
    const key = `P${index}`;
    args.push("-D", `${key}=${target}`);
    rules.push(
      `(allow file-read-metadata file-test-existence (literal (param "${key}")) (path-ancestors (param "${key}")))`
    );
  });
  return [...args, "-p", rules.join("\n")];
}

function workerError(diagnostic: string, error: unknown) {
  const code = /^grida-agent: ([a-z0-9_]{1,96})$/m.exec(diagnostic)?.[1];
  switch (code) {
    case "file_unavailable":
      return new WorkspaceMediaError(404, "workspace_media_file_unavailable");
    case "workspace_directory_changed":
    case "workspace_path_outside_root":
    case "protected_root_overlap":
    case "path_authority_unavailable":
    case "file_type_unsupported":
    case "file_symlink_unsupported":
    case "file_relative_path_invalid":
    case "file_mount_unsupported":
      return new WorkspaceMediaError(403, code);
    default:
      return error instanceof WorkspaceMediaError ? error : unavailable();
  }
}

function unavailable() {
  return new WorkspaceMediaError(503, "workspace_media_worker_unavailable");
}

function cancelled() {
  return new WorkspaceMediaError(499, "workspace_media_request_cancelled");
}
