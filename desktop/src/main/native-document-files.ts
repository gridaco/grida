// GRIDA-SEC-004 / GRIDA-SEC-014 — grants for files selected by the Desktop host.
import { constants as bufferLimits } from "node:buffer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { ProtectedRoots } from "@grida/daemon/server";
import type { FileReadResult, FileWriteResult } from "../bridge/contract";
import { NativeDocumentIdentities } from "./native-document-identities";
import {
  type DocumentFileGrant,
  type WorkspaceFileWorkers,
  WorkspaceWriteUnverified,
} from "./workspace-file-worker";
import { WorkspaceMediaError } from "./workspace-media-registry";

/** Confined document workers running at once; later operations wait in order. */
const MAX_ACTIVE_DOCUMENTS = 2;
const MAX_STRING_LENGTH = bufferLimits.MAX_STRING_LENGTH;
const DOCUMENT_TIMEOUT_MS = 30_000;

type DocumentText = { content: string; mtime: number };

/** One worker read that every overlapping reader of the same entry joins. */
type SharedRead = {
  readonly result: Promise<DocumentText>;
  readonly controller: AbortController;
  waiters: number;
  settled: boolean;
};

type Entry = {
  readonly id: string;
  grant: DocumentFileGrant;
  mtime?: number;
  /** A save is in flight, or its unverified worker has not exited yet. */
  writing: boolean;
  /** Worker reads still running, including abandoned ones that are draining. */
  reads: number;
  /** The read a new reader joins; abandoned reads are detached from here. */
  reading?: SharedRead;
  resolvingIdentity?: Promise<string>;
  retired: boolean;
};

type Owner = { signal: AbortSignal; check: () => void };

class DocumentError extends Error {}

export class NativeDocumentFiles {
  private readonly byId = new Map<string, Entry>();
  private readonly byPath = new Map<string, Entry>();
  private readonly denials: ProtectedRoots;
  private readonly identities?: NativeDocumentIdentities;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    protectedPaths: readonly string[],
    private readonly home: string,
    private readonly workers: Pick<
      WorkspaceFileWorkers,
      "openDocument" | "saveDocument"
    >,
    identityDirectory?: string
  ) {
    this.denials = new ProtectedRoots(
      identityDirectory
        ? [...protectedPaths, identityDirectory]
        : protectedPaths
    );
    this.identities = identityDirectory
      ? new NativeDocumentIdentities(identityDirectory)
      : undefined;
  }

  /** Only Main's OS and native picker entrypoints select paths. */
  async register(selection: string): Promise<string> {
    const canonical = await fs.realpath(path.resolve(selection)).catch(() => {
      throw unavailable();
    });
    const existing = this.byPath.get(canonical);
    if (existing) {
      if (existing.retired) throw busy();
      return existing.id;
    }
    const grant = await this.capture(canonical);
    const concurrent = this.byPath.get(canonical);
    if (concurrent) {
      if (concurrent.retired) throw busy();
      return concurrent.id;
    }
    const entry: Entry = {
      id: randomUUID(),
      grant,
      writing: false,
      reads: 0,
      retired: false,
    };
    this.byId.set(entry.id, entry);
    this.byPath.set(canonical, entry);
    return entry.id;
  }

  release(id: string): void {
    const entry = this.byId.get(id);
    if (!entry) return;
    entry.retired = true;
    this.forgetRetired(entry);
  }

  invalidate(id: string): void {
    const entry = this.byId.get(id);
    if (entry) entry.mtime = undefined;
  }

  /** Resolve only the current native selection to an opaque durable chat key. */
  async chatIdentity(id: string, owner: Owner): Promise<string> {
    const identities = this.identities;
    if (!identities) throw unavailable();
    const entry = this.selected(id, owner);
    const { grant } = entry;
    if (path.extname(grant.path).toLowerCase() !== ".svg") throw unavailable();
    const check = async () => {
      owner.signal.throwIfAborted();
      const current = await this.capture(grant.path);
      owner.signal.throwIfAborted();
      owner.check();
      if (entry.retired) throw unavailable();
      if (entry.writing || entry.grant !== grant)
        throw new NativeDocumentIdentityBusy();
      if (!sameGrant(grant, current)) throw changed();
    };
    try {
      await check();
      // A chat probe can coexist with the SVG load. A concurrent save owns
      // the selected document and advances only after this receipt settles.
      const key = await (entry.resolvingIdentity ??= identities
        .resolve(grant)
        .finally(() => {
          entry.resolvingIdentity = undefined;
          this.forgetRetired(entry);
        }));
      await check();
      return key;
    } catch (error) {
      throw error instanceof NativeDocumentIdentityBusy
        ? error
        : publicError(error);
    }
  }

  async read(id: string, owner: Owner): Promise<FileReadResult> {
    const entry = this.selected(id, owner);
    if (entry.writing) throw busy();
    // Overlapping reads of one selection (a reloaded or re-rendered window)
    // share one worker read. Each caller still applies its own window checks.
    const shared = entry.reading ?? this.startRead(entry);
    shared.waiters++;
    let joined = true;
    const leave = () => {
      if (!joined) return;
      joined = false;
      if (--shared.waiters > 0 || shared.settled) return;
      if (entry.reading === shared) entry.reading = undefined;
      shared.controller.abort();
    };
    try {
      const { content, mtime } = await untilAborted(
        shared.result,
        owner.signal
      );
      owner.signal.throwIfAborted();
      owner.check();
      entry.mtime = mtime;
      const { grant } = entry;
      return {
        content,
        mtime,
        filename: path.basename(grant.path),
        display_path: grant.path.startsWith(this.home + path.sep)
          ? "~" + grant.path.slice(this.home.length)
          : grant.path,
      };
    } catch (error) {
      throw publicError(error);
    } finally {
      leave();
    }
  }

  async write(
    id: string,
    content: unknown,
    owner: Owner
  ): Promise<FileWriteResult> {
    if (typeof content !== "string")
      throw new DocumentError("The document text is invalid.");
    const entry = this.selected(id, owner);
    if (entry.writing || entry.reads > 0) throw busy();
    const { grant, mtime } = entry;
    if (mtime === undefined)
      throw new DocumentError("Read the document before saving it.");
    entry.writing = true;
    try {
      await this.admit(
        AbortSignal.any([
          owner.signal,
          AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
        ])
      );
    } catch (error) {
      entry.writing = false;
      this.forgetRetired(entry);
      throw publicError(error);
    }
    let draining = false;
    try {
      const current = await this.capture(grant.path);
      if (!sameGrant(grant, current)) throw changed();
      const saved = await this.workers.saveDocument(
        grant,
        Buffer.from(content, "utf8"),
        mtime,
        owner.signal,
        owner.check
      );
      entry.grant = { ...grant, identity: saved.identity };
      entry.mtime = owner.signal.aborted ? undefined : saved.mtime;
      if (this.identities) {
        try {
          await entry.resolvingIdentity?.catch(() => {});
          const current = await this.capture(grant.path);
          if (sameGrant(entry.grant, current))
            await this.identities.advance(grant, current);
        } catch {
          // A verified document save stays successful. Only a receipt
          // matching the current file can restore the previous chat key.
        }
      }
      return { mtime: saved.mtime };
    } catch (error) {
      if (error instanceof WorkspaceWriteUnverified) {
        entry.mtime = undefined;
        if (error.exited) {
          draining = true;
          void error.exited.finally(() => this.finishWrite(entry));
        }
      }
      throw publicError(error);
    } finally {
      if (!draining) this.finishWrite(entry);
    }
  }

  private selected(id: string, owner: Owner): Entry {
    owner.check();
    const entry = this.byId.get(id);
    if (!entry || entry.retired) throw unavailable();
    return entry;
  }

  private startRead(entry: Entry): SharedRead {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
    ]);
    const { grant } = entry;
    const run = async (): Promise<DocumentText> => {
      await this.admit(signal);
      try {
        const opened = await this.workers.openDocument(grant, signal);
        let content: string;
        try {
          content = await documentText(opened, signal);
        } catch (error) {
          await opened.close().catch(() => {});
          throw error;
        }
        const current = await this.capture(grant.path);
        signal.throwIfAborted();
        if (!sameGrant(grant, current)) throw changed();
        return { content, mtime: opened.mtime };
      } finally {
        this.releaseSlot();
      }
    };
    entry.reads++;
    const shared: SharedRead = {
      controller,
      waiters: 0,
      settled: false,
      result: run().finally(() => {
        shared.settled = true;
        if (entry.reading === shared) entry.reading = undefined;
        entry.reads--;
        this.forgetRetired(entry);
      }),
    };
    // Every reader may have left before the worker settles.
    shared.result.catch(() => {});
    entry.reading = shared;
    return shared;
  }

  /** Wait in arrival order for one of the bounded document worker slots. */
  private async admit(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.active < MAX_ACTIVE_DOCUMENTS && this.waiting.length === 0) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const admitted = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        const index = this.waiting.indexOf(admitted);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(signal.reason);
      };
      this.waiting.push(admitted);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  /** Hand the slot to the next waiter, or free it. */
  private releaseSlot(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }

  private finishWrite(entry: Entry): void {
    entry.writing = false;
    this.releaseSlot();
    this.forgetRetired(entry);
  }

  private forgetRetired(entry: Entry): void {
    if (
      !entry.retired ||
      entry.writing ||
      entry.reads > 0 ||
      entry.resolvingIdentity
    )
      return;
    this.byId.delete(entry.id);
    this.byPath.delete(entry.grant.path);
  }

  private async capture(filename: string): Promise<DocumentFileGrant> {
    if (this.denials.overlaps(filename)) throw unavailable();
    const parent = path.dirname(filename);
    const [canonical, file, directory] = await Promise.all([
      fs.realpath(filename),
      fs.lstat(filename, { bigint: true }),
      fs.lstat(parent, { bigint: true }),
    ]).catch(() => {
      throw changed();
    });
    if (
      canonical !== filename ||
      !file.isFile() ||
      file.nlink !== 1n ||
      !directory.isDirectory() ||
      file.dev !== directory.dev
    )
      throw changed();
    return {
      path: filename,
      identity: identity(file),
      parentIdentity: identity(directory),
      protected: this.denials.metadataPaths(),
    };
  }
}

function identity(stat: { dev: bigint; ino: bigint; birthtimeNs: bigint }) {
  return {
    device: String(stat.dev),
    inode: String(stat.ino),
    birthTimeNs: String(stat.birthtimeNs),
  };
}

function sameGrant(left: DocumentFileGrant, right: DocumentFileGrant): boolean {
  const same = (
    a: DocumentFileGrant["identity"],
    b: DocumentFileGrant["identity"]
  ) =>
    a.device === b.device &&
    a.inode === b.inode &&
    a.birthTimeNs === b.birthTimeNs;
  return (
    same(left.identity, right.identity) &&
    same(left.parentIdentity, right.parentIdentity)
  );
}

/** Settle with `promise`, or reject as soon as this caller's signal aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

async function documentText(
  opened: Awaited<ReturnType<WorkspaceFileWorkers["openDocument"]>>,
  signal: AbortSignal
): Promise<string> {
  const tooLarge = () =>
    new DocumentError("This document is too large to open as text.");
  // The bridge's existing text contract must fit one V8 string. A valid UTF-8
  // document needs at most three bytes per UTF-16 code unit.
  if (opened.size > MAX_STRING_LENGTH * 3) throw tooLarge();
  const decoder = new StringDecoder("utf8");
  const chunks: string[] = [];
  let length = 0;
  for await (const chunk of opened.stream(0, opened.size)) {
    signal.throwIfAborted();
    const text = decoder.write(chunk);
    length += text.length;
    if (length > MAX_STRING_LENGTH) throw tooLarge();
    chunks.push(text);
  }
  const tail = decoder.end();
  if (length + tail.length > MAX_STRING_LENGTH) throw tooLarge();
  chunks.push(tail);
  return chunks.join("");
}

export class NativeDocumentIdentityBusy extends Error {
  constructor() {
    super("A document operation is still in progress.");
  }
}

function publicError(error: unknown): Error {
  if (error instanceof WorkspaceWriteUnverified)
    return new Error(
      "The save could not be verified. Your edits are still open."
    );
  if (error instanceof WorkspaceMediaError) {
    if (error.status === 409) return changed();
    return unavailable();
  }
  return error instanceof DocumentError ? error : unavailable();
}

function unavailable() {
  return new DocumentError("The selected document is unavailable.");
}
function changed() {
  return new DocumentError(
    "The document changed on disk. Your edits are still open."
  );
}
function busy() {
  return new DocumentError("A document operation is still in progress.");
}
