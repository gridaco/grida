// GRIDA-SEC-004 / GRIDA-SEC-014 — approved, create-only placement of retained media.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MediaStore } from "@grida/daemon/server";
import type { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import {
  WorkspaceWriteUnverified,
  type WorkspaceFileWorkers,
} from "./workspace-file-worker";
import type { WorkspaceMediaGrant } from "./workspace-media-registry";

type Workspace = Pick<WorkspaceMediaGrant, "workspaceId" | "root" | "identity">;
export type ImagePlacementReview = (input: {
  workspace: Workspace;
  relative: string;
  signal: AbortSignal;
}) => Promise<
  | {
      kind: "approved";
      check: () => void;
      signal: AbortSignal;
      close: () => void;
    }
  | { kind: "declined" | "unavailable" }
>;
type Dependencies = {
  catalog: Pick<NativeWorkspaceCatalog, "fileGrant" | "withWriteGrant">;
  workers: Pick<WorkspaceFileWorkers, "publish">;
  media: Pick<MediaStore, "read">;
  review: ImagePlacementReview;
};
type Reply = {
  kind:
    | "published"
    | "already_present"
    | "declined"
    | "conflict"
    | "unavailable"
    | "uncertain";
};

const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const MEDIA_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_CALLS = 1024;
const MIME_EXTENSIONS = new Map([
  ["image/png", [".png"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/webp", [".webp"]],
  ["image/gif", [".gif"]],
]);

/** One bound workspace and one outstanding placement per native worker. */
export class NativeImagePlacement {
  static readonly capability = "co.grida/media/place-image";
  static readonly method = `_${this.capability}`;
  private readonly calls = new Set<string>();
  private readonly lifetime = new AbortController();
  private active?: { id: number | string; abort: AbortController };

  constructor(
    private readonly workspace: Workspace,
    private readonly deps: Dependencies
  ) {}

  close() {
    this.lifetime.abort();
  }

  cancel(id: unknown) {
    const current = this.active;
    if (current && current.id === id) current.abort.abort();
  }

  async place(id: number | string, value: unknown): Promise<Reply> {
    const input = placement(value);
    if (!input || this.lifetime.signal.aborted) return { kind: "unavailable" };
    const call = JSON.stringify([input.sessionId, input.turnId, input.callId]);
    if (this.calls.has(call)) return { kind: "uncertain" };
    if (this.active || this.calls.size >= MAX_CALLS)
      return { kind: "unavailable" };
    this.calls.add(call);
    const abort = new AbortController();
    this.active = { id, abort };
    const signal = AbortSignal.any([this.lifetime.signal, abort.signal]);
    let approval:
      | Extract<Awaited<ReturnType<ImagePlacementReview>>, { kind: "approved" }>
      | undefined;
    try {
      const first = await this.deps.catalog.fileGrant(
        this.workspace.workspaceId
      );
      this.requireWorkspace(first);
      const parent = path.join(first.root, path.posix.dirname(input.relative));
      const expectedParent = await directoryIdentity(parent);
      signal.throwIfAborted();
      const reviewed = await this.deps.review({
        workspace: this.workspace,
        relative: input.relative,
        signal,
      });
      if (reviewed.kind !== "approved") return { kind: reviewed.kind };
      approval = reviewed;
      const publicationSignal = AbortSignal.any([signal, reviewed.signal]);
      const check = () => {
        publicationSignal.throwIfAborted();
        reviewed.check();
      };
      return await this.deps.catalog.withWriteGrant(
        this.workspace.workspaceId,
        async (grant) => {
          this.requireWorkspace(grant);
          check();
          const { item, bytes } = await this.deps.media.read(input.artifact.id);
          if (
            item.id !== input.artifact.id ||
            item.media_type !== input.artifact.mediaType ||
            item.byte_size !== input.artifact.bytes ||
            bytes.byteLength !== input.artifact.bytes ||
            createHash("sha256").update(bytes).digest("hex") !==
              input.artifact.sha256
          )
            return { kind: "unavailable" };
          check();
          const result = await this.deps.workers.publish(
            grant,
            input.relative,
            Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            expectedParent,
            input.artifact.sha256,
            publicationSignal,
            check
          );
          return { kind: result.status };
        }
      );
    } catch (error) {
      if (
        error instanceof WorkspaceWriteUnverified ||
        (error instanceof Error &&
          error.message === "workspace_write_unverified")
      )
        return { kind: "uncertain" };
      if (
        error instanceof Error &&
        error.message === "workspace_publish_conflict"
      )
        return { kind: "conflict" };
      return { kind: "unavailable" };
    } finally {
      approval?.close();
      this.active = undefined;
    }
  }

  private requireWorkspace(grant: WorkspaceMediaGrant) {
    if (
      grant.workspaceId !== this.workspace.workspaceId ||
      grant.root !== this.workspace.root ||
      !sameIdentity(grant.identity, this.workspace.identity)
    )
      throw new Error("workspace_image_scope_changed");
  }
}

async function directoryIdentity(
  directory: string
): Promise<Workspace["identity"]> {
  if ((await fs.realpath(directory)) !== directory)
    throw new Error("workspace_image_parent_invalid");
  const info = await fs.lstat(directory, { bigint: true });
  if (!info.isDirectory() || info.birthtimeNs <= 0n)
    throw new Error("workspace_image_parent_invalid");
  return {
    device: info.dev.toString(),
    inode: info.ino.toString(),
    birthTimeNs: info.birthtimeNs.toString(),
  };
}

function sameIdentity(
  left: Workspace["identity"],
  right: Workspace["identity"]
) {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.birthTimeNs === right.birthTimeNs
  );
}

function placement(value: unknown) {
  const input = record(value);
  const artifact = record(input?.artifact);
  if (
    !input ||
    Object.keys(input).length !== 5 ||
    !artifact ||
    Object.keys(artifact).length !== 4
  )
    return undefined;
  const { sessionId, turnId, callId, path: relative } = input;
  const { id, mediaType, bytes, sha256 } = artifact;
  if (
    typeof sessionId !== "string" ||
    !ID.test(sessionId) ||
    typeof turnId !== "string" ||
    !ID.test(turnId) ||
    typeof callId !== "string" ||
    !ID.test(callId) ||
    typeof relative !== "string" ||
    !relative ||
    Buffer.byteLength(relative) > 1024 ||
    /[\\<>:"|?*\p{Cc}\p{Cf}]/u.test(relative) ||
    relative
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..") ||
    typeof id !== "string" ||
    !MEDIA_ID.test(id) ||
    typeof mediaType !== "string" ||
    !MIME_EXTENSIONS.get(mediaType)?.includes(
      path.posix.extname(relative).toLowerCase()
    ) ||
    typeof bytes !== "number" ||
    !Number.isSafeInteger(bytes) ||
    bytes < 1 ||
    bytes > MAX_BYTES ||
    typeof sha256 !== "string" ||
    !SHA256.test(sha256)
  )
    return undefined;
  return {
    sessionId,
    turnId,
    callId,
    relative,
    artifact: { id, mediaType, bytes, sha256 },
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
