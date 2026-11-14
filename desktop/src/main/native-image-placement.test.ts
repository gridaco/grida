// GRIDA-SEC-004 / GRIDA-SEC-014 — review and retained image identity.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MediaStore } from "@grida/daemon/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeImagePlacement } from "./native-image-placement";
import {
  WorkspaceWriteUnverified,
  type WorkspaceFileWorkers,
} from "./workspace-file-worker";
import type { NativeWorkspaceCatalog } from "./native-workspace-catalog";

type ImagePlacementReview = ConstructorParameters<
  typeof NativeImagePlacement
>[1]["review"];

let directory: string;
let root: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "grida-image-place-"));
  root = await fs.realpath(directory);
  await fs.mkdir(path.join(root, "assets"));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

async function setup() {
  const bytes = Buffer.from("retained synthetic image");
  const id = randomUUID();
  const rootInfo = await fs.stat(root, { bigint: true });
  const grant = {
    workspaceId: "selected",
    root,
    identity: {
      device: rootInfo.dev.toString(),
      inode: rootInfo.ino.toString(),
      birthTimeNs: rootInfo.birthtimeNs.toString(),
    },
    protected: [],
  };
  const signal = new AbortController();
  const close = vi.fn<() => void>();
  const review = vi.fn<ImagePlacementReview>().mockResolvedValue({
    kind: "approved",
    signal: signal.signal,
    check: () => signal.signal.throwIfAborted(),
    close,
  });
  const read = vi.fn<MediaStore["read"]>(async (_id) => ({
    bytes,
    item: {
      id,
      byte_size: bytes.length,
      media_type: "image/png",
      file_name: "image-1.png",
      created_at: 1,
    },
  }));
  const publish = vi
    .fn<WorkspaceFileWorkers["publish"]>()
    .mockResolvedValue({ status: "published" });
  const fileGrant = vi.fn<NativeWorkspaceCatalog["fileGrant"]>(
    async (_workspaceId) => grant
  );
  const placement = new NativeImagePlacement(grant, {
    catalog: {
      fileGrant,
      withWriteGrant: async (workspaceId, write) =>
        await write(await fileGrant(workspaceId)),
    },
    media: { read },
    workers: { publish },
    review,
  });
  const input = {
    sessionId: "session",
    turnId: "turn",
    callId: "call",
    path: "assets/generated.png",
    artifact: {
      id,
      mediaType: "image/png",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
  return {
    bytes,
    grant,
    signal,
    close,
    review,
    read,
    publish,
    placement,
    input,
    fileGrant,
  };
}

it("reviews the selected destination and passes the captured parent and exact bytes to the native writer", async () => {
  const { placement, input, bytes, grant, publish, review, close } =
    await setup();
  const parent = await fs.stat(path.join(root, "assets"), { bigint: true });
  expect(await placement.place(1, input)).toEqual({ kind: "published" });
  expect(review).toHaveBeenCalledWith({
    workspace: grant,
    relative: input.path,
    signal: expect.any(AbortSignal),
  });
  expect(publish).toHaveBeenCalledWith(
    grant,
    input.path,
    bytes,
    {
      device: parent.dev.toString(),
      inode: parent.ino.toString(),
      birthTimeNs: parent.birthtimeNs.toString(),
    },
    input.artifact.sha256,
    expect.any(AbortSignal),
    expect.any(Function)
  );
  expect(close).toHaveBeenCalledOnce();
  expect(await placement.place(2, input)).toEqual({ kind: "uncertain" });
  expect(publish).toHaveBeenCalledOnce();
});

it("withholds review and reads for an invalid destination or changed workspace", async () => {
  const { placement, input, grant, fileGrant, review, read, publish } =
    await setup();
  expect(
    await placement.place(1, { ...input, path: "assets/../generated.png" })
  ).toEqual({ kind: "unavailable" });
  fileGrant.mockResolvedValueOnce({ ...grant, root: path.dirname(root) });
  expect(await placement.place(2, input)).toEqual({ kind: "unavailable" });
  expect(review).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

it("withholds the write after decline, a changed artifact, or revoked review", async () => {
  const { placement, input, review, read, publish, signal, close } =
    await setup();
  review.mockResolvedValueOnce({ kind: "declined" });
  expect(await placement.place(1, input)).toEqual({ kind: "declined" });
  expect(read).not.toHaveBeenCalled();

  const changed = {
    ...input,
    callId: "changed",
    artifact: { ...input.artifact, sha256: "0".repeat(64) },
  };
  expect(await placement.place(2, changed)).toEqual({ kind: "unavailable" });
  signal.abort();
  expect(await placement.place(3, { ...input, callId: "revoked" })).toEqual({
    kind: "unavailable",
  });
  expect(read).toHaveBeenCalledOnce();
  expect(publish).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(2);
});

it("distinguishes an existing different file from an unverified write", async () => {
  const { placement, input, publish } = await setup();
  publish
    .mockRejectedValueOnce(new Error("workspace_publish_conflict"))
    .mockRejectedValueOnce(new WorkspaceWriteUnverified());
  expect(await placement.place(1, input)).toEqual({ kind: "conflict" });
  expect(await placement.place(2, { ...input, callId: "second" })).toEqual({
    kind: "uncertain",
  });
});
