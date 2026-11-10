// GRIDA-SEC-004 / GRIDA-SEC-014 — one exact workspace file operation under Seatbelt.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import type { WorkspaceFsEntry } from "@grida/daemon";
import type { WorkspaceFileBody } from "@grida/daemon/server";
import {
  WorkspaceMediaError,
  type WorkspaceMediaGrant,
} from "./workspace-media-registry";

const MAX_WORKERS = 8;
const MAX_HEADER_BYTES = 128;
const MAX_DIRECTORY_BYTES = 2 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 8192;
const START_TIMEOUT_MS = 5_000;
const WRITE_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 2_000;

type Exit = { code: number | null };
type FileRequest = {
  path: string;
  includeModified?: true;
  listDirectory?: true;
  write?: { length: number; expectedMtime?: string };
};
type DirectoryEntry = Pick<WorkspaceFsEntry, "name" | "kind">;
type NativeIdentity = WorkspaceMediaGrant["identity"];
export type DocumentFileGrant = Readonly<{
  path: string;
  identity: NativeIdentity;
  parentIdentity: NativeIdentity;
  protected: readonly string[];
}>;
type WorkerScope =
  | { workspace: WorkspaceMediaGrant }
  | { document: DocumentFileGrant; temporary?: string };
type Worker = {
  child: ChildProcessWithoutNullStreams;
  abort: () => void;
  exited: Promise<Exit>;
  output: AsyncIterator<Buffer>;
  diagnostic: () => string;
};

export class WorkspaceWriteUnverified extends Error {
  constructor(readonly exited?: Promise<Exit>) {
    super("workspace_write_unverified");
  }
}

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
    const request = frame(grant, {
      path: relPath,
      ...(includeModified && { includeModified: true }),
    });
    return await this.openBody(
      { workspace: grant },
      request,
      signal,
      includeModified
    );
  }

  async openDocument(
    grant: DocumentFileGrant,
    signal: AbortSignal
  ): Promise<WorkspaceFileBody & { mtime: number }> {
    const request = JSON.stringify({ document: grant }) + "\n";
    const body = await this.openBody(
      { document: grant },
      request,
      signal,
      true
    );
    if (body.mtime === undefined) {
      await body.close();
      throw unavailable();
    }
    return { ...body, mtime: body.mtime };
  }

  private async openBody(
    scope: WorkerScope,
    request: string,
    signal: AbortSignal,
    includeModified: boolean
  ): Promise<WorkspaceFileBody & { mtime?: number }> {
    const { child, abort, exited, output, diagnostic } = await this.launch(
      scope,
      request,
      signal
    );
    const deadline = setTimeout(abort, START_TIMEOUT_MS);
    try {
      child.stdin.write(request);
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
      throw workerError(diagnostic(), error);
    } finally {
      clearTimeout(deadline);
    }
  }

  async list(
    grant: WorkspaceMediaGrant,
    relative: string,
    signal: AbortSignal
  ): Promise<DirectoryEntry[]> {
    const request = frame(grant, { path: relative, listDirectory: true });
    const { child, abort, exited, output, diagnostic } = await this.launch(
      { workspace: grant },
      request,
      signal
    );
    const deadline = setTimeout(abort, START_TIMEOUT_MS);
    try {
      child.stdin.end(request);
      const response = await readJsonFrame(output, MAX_DIRECTORY_BYTES);
      if (!(await output.next()).done) throw unavailable();
      await verifyExit(exited, abort);
      if (signal.aborted) throw cancelled();
      if (
        !response ||
        typeof response !== "object" ||
        Object.keys(response).length !== 1 ||
        !("entries" in response) ||
        !Array.isArray(response.entries) ||
        response.entries.length > MAX_DIRECTORY_ENTRIES ||
        !response.entries.every(isDirectoryEntry)
      )
        throw unavailable();
      return response.entries;
    } catch (error) {
      abort();
      await exitWithin(exited);
      if (signal.aborted) throw cancelled();
      const stderr = diagnostic();
      if (workerCode(stderr) === "file_type_unsupported")
        throw new WorkspaceMediaError(400, "not-a-directory");
      throw workerError(stderr, error);
    } finally {
      clearTimeout(deadline);
    }
  }

  async write(
    grant: WorkspaceMediaGrant,
    relative: string,
    content: Buffer,
    expectedMtime: number | undefined,
    signal: AbortSignal,
    check: () => void
  ): Promise<{ mtime: number }> {
    const request = frame(grant, {
      path: relative,
      write: {
        length: content.length,
        expectedMtime: expectedMtime?.toString(),
      },
    });
    return await this.save(
      { workspace: grant },
      request,
      content,
      signal,
      check,
      savedWorkspace
    );
  }

  async saveDocument(
    grant: DocumentFileGrant,
    content: Buffer,
    expectedMtime: number,
    signal: AbortSignal,
    check: () => void
  ): Promise<{ mtime: number; identity: NativeIdentity }> {
    if (!Number.isFinite(expectedMtime)) throw unavailable();
    const temporary = `.grida-save-${randomUUID()}.tmp`;
    const request =
      JSON.stringify({
        document: {
          ...grant,
          write: {
            length: content.length,
            expectedMtime: expectedMtime.toString(),
            temporary,
          },
        },
      }) + "\n";
    return await this.save(
      { document: grant, temporary },
      request,
      content,
      signal,
      check,
      savedDocument
    );
  }

  private async save<T>(
    scope: WorkerScope,
    request: string,
    content: Buffer,
    signal: AbortSignal,
    check: () => void,
    receipt: (response: unknown) => T
  ): Promise<T> {
    const { child, abort, exited, output, diagnostic } = await this.launch(
      scope,
      request,
      signal,
      check
    );
    const deadline = setTimeout(abort, WRITE_TIMEOUT_MS);
    try {
      child.stdin.write(request);
      child.stdin.end(content);
      const response = await readJsonFrame(
        output,
        "document" in scope ? 256 : MAX_HEADER_BYTES
      );
      if (!(await output.next()).done) throw unavailable();
      await verifyExit(exited, abort);
      return receipt(response);
    } catch {
      abort();
      const closed = await exitWithin(exited);
      const code = workerCode(diagnostic());
      if (closed && code && definitiveWriteErrors.has(code)) {
        if (code === "workspace_write_modified_since")
          throw new WorkspaceMediaError(409, "modified-since");
        if (code === "workspace_write_type_unsupported")
          throw new WorkspaceMediaError(400, "not-a-file");
        if (code === "workspace_write_limit")
          throw new WorkspaceMediaError(413, code);
        if (code === "workspace_write_failed")
          throw new WorkspaceMediaError(500, code);
        throw workerError(diagnostic(), new WorkspaceMediaError(400, code));
      }
      throw new WorkspaceWriteUnverified(closed ? undefined : exited);
    } finally {
      clearTimeout(deadline);
    }
  }

  private async launch(
    scope: WorkerScope,
    request: string,
    signal: AbortSignal,
    admitWrite?: () => void
  ): Promise<Worker> {
    if (signal.aborted) throw cancelled();
    if (Buffer.byteLength(request) > 32 * 1024)
      throw new WorkspaceMediaError(400, "workspace_media_open_limit");
    const executable = await installedAgent(this.resourcesPath);
    if (this.closed || this.active.size >= MAX_WORKERS) {
      throw new WorkspaceMediaError(503, "workspace_media_worker_capacity");
    }
    if (signal.aborted) throw cancelled();
    admitWrite?.();
    const child = spawn(
      "/usr/bin/sandbox-exec",
      [
        ...sandboxArguments(executable, scope, admitWrite !== undefined),
        executable,
        "workspace-file",
      ],
      {
        cwd:
          "workspace" in scope
            ? scope.workspace.root
            : path.dirname(scope.document.path),
        env: {},
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    this.active.add(child);
    const abort = () => terminate(child);
    // A dispatched write is owned by Main until this exact child exits.
    if (!admitWrite) signal.addEventListener("abort", abort, { once: true });
    const exited = new Promise<Exit>((resolve) =>
      child.once("close", (code) => {
        signal.removeEventListener("abort", abort);
        this.active.delete(child);
        resolve({ code });
      })
    );
    child.on("error", () => {});
    child.stdin.on("error", () => {
      if (!admitWrite) abort();
    });
    let diagnostic = "";
    child.stderr.on("data", (chunk: Buffer) => {
      diagnostic += chunk
        .subarray(0, Math.max(0, 1024 - diagnostic.length))
        .toString("utf8");
    });
    return {
      child,
      abort,
      exited,
      output: child.stdout[Symbol.asyncIterator](),
      diagnostic: () => diagnostic,
    };
  }

  close() {
    this.closed = true;
    for (const child of this.active) terminate(child);
  }
}

function frame(grant: WorkspaceMediaGrant, request: FileRequest): string {
  return JSON.stringify({ ...grant, ...request }) + "\n";
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
  const parsed = await readJsonFrame(output, MAX_HEADER_BYTES);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Object.keys(parsed).length !== (includeModified ? 2 : 1) ||
    !("size" in parsed) ||
    typeof parsed.size !== "string" ||
    !/^\d+$/.test(parsed.size)
  )
    throw unavailable();
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

function savedMtime(response: unknown, length: number): number {
  if (
    !response ||
    typeof response !== "object" ||
    Object.keys(response).length !== length ||
    !("mtime" in response) ||
    typeof response.mtime !== "number" ||
    !Number.isFinite(response.mtime)
  )
    throw unavailable();
  return response.mtime;
}

function savedWorkspace(response: unknown) {
  return { mtime: savedMtime(response, 1) };
}

function savedDocument(response: unknown) {
  const mtime = savedMtime(response, 2);
  const { identity } = response as { identity?: unknown };
  if (
    !identity ||
    typeof identity !== "object" ||
    Object.keys(identity).length !== 3 ||
    !["device", "inode", "birthTimeNs"].every((key) => {
      const value = (identity as Record<string, unknown>)[key];
      return typeof value === "string" && /^\d{1,39}$/.test(value);
    })
  )
    throw unavailable();
  return { mtime, identity: identity as NativeIdentity };
}

async function readJsonFrame(
  output: AsyncIterator<Buffer>,
  limit: number
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for (;;) {
    const item = await output.next();
    if (item.done) throw unavailable();
    length += item.value.length;
    if (length > limit) throw unavailable();
    chunks.push(item.value);
    const end = item.value.indexOf(10);
    if (end < 0) continue;
    if (end !== item.value.length - 1) throw unavailable();
    return JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
  }
}

function isDirectoryEntry(value: unknown): value is DirectoryEntry {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).length !== 2 ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !value.name ||
    value.name === "." ||
    value.name === ".." ||
    value.name.includes("/") ||
    value.name.includes("\0") ||
    !("kind" in value)
  )
    return false;
  return ["file", "directory", "symlink", "other"].some(
    (kind) => value.kind === kind
  );
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

function sandboxArguments(
  executable: string,
  scope: WorkerScope,
  write: boolean
) {
  const rules = [
    "(version 1)",
    "(deny default)",
    '(allow process-exec file-read* file-map-executable (literal (param "EXE")))',
    '(allow file-read-metadata file-test-existence (path-ancestors (param "EXE")))',
    '(allow file-read* file-map-executable (subpath "/System/Library") (subpath "/usr/lib"))',
    '(allow file-read* file-test-existence (literal "/"))',
    '(allow file-read* file-write-data (literal "/dev/null"))',
    '(allow sysctl-read (sysctl-name "hw.logicalcpu") (sysctl-name "hw.activecpu") (sysctl-name "hw.pagesize") (sysctl-name "hw.pagesize_compat"))',
  ];
  const args = ["-D", `EXE=${executable}`];
  if ("workspace" in scope) {
    args.push("-D", `ROOT=${scope.workspace.root}`);
    rules.push(
      '(allow file-read* (subpath (param "ROOT")))',
      '(allow file-read-metadata file-test-existence (path-ancestors (param "ROOT")))'
    );
    if (write)
      rules.push(
        '(allow file-write* (require-all (subpath (param "ROOT")) (require-not (literal (param "ROOT")))))'
      );
  } else {
    const parent = path.dirname(scope.document.path);
    args.push(
      "-D",
      `PARENT=${parent}`,
      "-D",
      `DOCUMENT=${scope.document.path}`
    );
    rules.push(
      '(allow file-read-metadata file-test-existence (path-ancestors (param "PARENT")) (literal (param "PARENT")))',
      '(allow file-read* (literal (param "DOCUMENT")))'
    );
    if (scope.temporary) {
      args.push("-D", `STAGED=${path.join(parent, scope.temporary)}`);
      rules.push(
        '(allow file-read-metadata file-test-existence (literal (param "STAGED")))',
        '(allow file-write* (literal (param "DOCUMENT")) (literal (param "STAGED")))'
      );
    }
  }
  const grant = "workspace" in scope ? scope.workspace : scope.document;
  grant.protected.forEach((target, index) => {
    const key = `P${index}`;
    args.push("-D", `${key}=${target}`);
    rules.push(
      `(allow file-read-metadata file-test-existence (literal (param "${key}")) (path-ancestors (param "${key}")))`
    );
  });
  return [...args, "-p", rules.join("\n")];
}

const definitiveWriteErrors = new Set([
  "document_file_changed",
  "workspace_write_modified_since",
  "workspace_write_type_unsupported",
  "workspace_write_failed",
  "workspace_write_limit",
  "workspace_write_utf8",
  "workspace_file_frame_invalid",
  "workspace_directory_changed",
  "workspace_path_outside_root",
  "workspace_directory_unavailable",
  "protected_root_overlap",
  "path_authority_unavailable",
  "file_unavailable",
  "file_type_unsupported",
  "file_symlink_unsupported",
  "file_relative_path_invalid",
  "file_mount_unsupported",
  "file_path_changed",
  "workspace_path_changed",
]);

function workerError(diagnostic: string, error: unknown) {
  const code = workerCode(diagnostic);
  switch (code) {
    case "document_file_changed":
      return new WorkspaceMediaError(409, code);
    case "workspace_directory_limit":
      return new WorkspaceMediaError(413, code);
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
    case "file_path_changed":
    case "workspace_path_changed":
      return new WorkspaceMediaError(403, code);
    default:
      return error instanceof WorkspaceMediaError ? error : unavailable();
  }
}

function workerCode(diagnostic: string): string | undefined {
  return /^grida-agent: ([a-z0-9_]{1,96})$/m.exec(diagnostic)?.[1];
}

function unavailable() {
  return new WorkspaceMediaError(503, "workspace_media_worker_unavailable");
}

function cancelled() {
  return new WorkspaceMediaError(499, "workspace_media_request_cancelled");
}
