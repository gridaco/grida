// GRIDA-SEC-004 — actual buffered editor reads with a disposable native worker.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceFs } from "@grida/daemon/server";
import { expect, it, vi } from "vitest";
import { agentSidecarClient } from "./agent-sidecar-client";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import { NativeWorkspaceReads } from "./native-workspace-reads";
import { WorkspaceFileWorkers } from "./workspace-file-worker";

const launch = vi.hoisted(() => ({
  workers: undefined as WorkspaceFileWorkers | undefined,
  compatibility: vi.fn<() => never>(() => {
    throw new Error("sidecar must not serve the native read");
  }),
}));
vi.mock("./workspace-media-access", () => ({
  nativeWorkspaceMedia: () => launch.workers,
}));
vi.mock("../env", () => ({
  EDITOR_BASE_URL: "https://editor.fixture.invalid",
}));
vi.mock("./agent-sidecar-supervisor", () => ({
  getAgentSidecarInfo: launch.compatibility,
}));

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it("queues bounded read bursts in order without acquiring authority for cancelled work", async () => {
  const running = Array.from({ length: 4 }, () => Promise.withResolvers<[]>());
  const starts: string[] = [];
  const list = vi.fn<WorkspaceFileWorkers["list"]>(async (_grant, relative) => {
    starts.push(relative);
    const index = Number(relative.split("/")[1]);
    return relative.startsWith("running/") ? running[index].promise : [];
  });
  const fileGrant = vi.fn<NativeWorkspaceCatalog["fileGrant"]>(
    async (workspaceId) => ({
      workspaceId,
      root: "/fixture",
      identity: { device: "1", inode: "2", birthTimeNs: "3" },
      protected: [],
    })
  );
  const reads = new NativeWorkspaceReads(
    { fileGrant },
    { list, open: vi.fn<WorkspaceFileWorkers["open"]>() }
  );
  const owner = new AbortController();
  const launch = (relative: string, signal = owner.signal) =>
    reads.list(relative, relative, signal);
  const active = running.map((_, i) => launch(`running/${i}`));
  await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(4));

  const removed = new AbortController();
  const expired = new AbortController();
  const queuedOwner = launch("cancelled", removed.signal);
  const deadline = vi.spyOn(AbortSignal, "timeout");
  deadline.mockReturnValueOnce(expired.signal);
  const queuedDeadline = launch("expired");
  expect(deadline).toHaveBeenCalledWith(15_000);
  deadline.mockRestore();
  const waiting = Array.from({ length: 30 }, (_, i) => `waiting/${i}`);
  const queued = waiting.map((name) => launch(name));
  await expect(launch("over-capacity")).rejects.toThrow(
    "workspace_read_capacity"
  );
  expect(fileGrant).toHaveBeenCalledTimes(4);

  removed.abort(new Error("frame retired"));
  expired.abort(new Error("deadline elapsed"));
  await expect(queuedOwner).rejects.toThrow("frame retired");
  await expect(queuedDeadline).rejects.toThrow("deadline elapsed");
  const trailing = [launch("replacement/0"), launch("replacement/1")];
  const failed = active[0].catch((error: unknown) => error);
  running[0].reject(new Error("worker refused"));
  expect(await failed).toEqual(new Error("worker refused"));
  await Promise.all([...queued, ...trailing]);
  expect(starts).toEqual([
    "running/0",
    "running/1",
    "running/2",
    "running/3",
    ...waiting,
    "replacement/0",
    "replacement/1",
  ]);
  for (const name of ["cancelled", "expired", "over-capacity"])
    expect(fileGrant).not.toHaveBeenCalledWith(name);

  for (const operation of running.slice(1)) operation.resolve([]);
  await Promise.all(active.slice(1));
});

it.runIf(
  Boolean(resources) &&
    process.platform === "darwin" &&
    process.arch === "arm64"
)(
  "lists, reads and saves editor files without a sidecar and preserves the fractional write precondition",
  async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-workspace-reads-"))
    );
    const browserData = path.join(root, "browser");
    const project = path.join(root, "project");
    const outside = path.join(root, "outside.txt");
    const draft = path.join(project, "draft.txt");
    const bin = path.join(project, "binary.txt");
    const medium = path.join(project, "medium.bin");
    const large = path.join(project, "large.bin");
    const workers = new WorkspaceFileWorkers(resources!);
    launch.workers = workers;
    try {
      for (const dir of [browserData, project])
        await fs.mkdir(dir, { mode: 0o700 });
      const options = {
        browserData,
        projectsRoot: path.join(root, "managed"),
        protectedPaths: [],
      };
      const saved = await new NativeWorkspaceCatalog(options).openSelected(
        project
      );
      // Reopen the catalog without recapturing a media grant.
      const catalog = new NativeWorkspaceCatalog(options);
      agentSidecarClient.setWorkspaceCatalog(catalog);
      const signal = new AbortController().signal;
      const read = (file: string, kind: "text" | "bytes") =>
        agentSidecarClient.readWorkspaceFile(saved.id, file, kind, signal);
      const list = (directory: string) =>
        agentSidecarClient.readWorkspaceDirectory(saved.id, directory, signal);
      const save = (file: string, content: string, expected?: number) =>
        agentSidecarClient.writeWorkspaceFile(
          saved.id,
          file,
          content,
          expected,
          signal,
          () => {}
        );

      const authored = Buffer.from("\uFEFFdraft");
      await fs.writeFile(draft, authored);
      await fs.utimes(draft, 1_700_000_000.123456, 1_700_000_000.123456);
      const mtime = (await fs.stat(draft)).mtimeMs;
      expect(mtime % 1).not.toBe(0);
      const text = await read("draft.txt", "text");
      expect(text).toEqual({ content: "draft", mtime });
      await expect(read("draft.txt", "bytes")).resolves.toEqual({
        base64: authored.toString("base64"),
        size: authored.length,
        mtime,
      });
      const changed = await save(
        "draft.txt",
        "edited\r\nRésumé\r\n",
        text.mtime
      );
      expect(changed.mtime).toBe((await fs.stat(draft)).mtimeMs);
      expect(await fs.readFile(draft)).toEqual(
        Buffer.from("edited\r\nRésumé\r\n")
      );
      await expect(save("draft.txt", "stale", text.mtime)).rejects.toThrow(
        "modified-since"
      );
      await expect(read("draft.txt", "text")).resolves.toMatchObject({
        content: "edited\r\nRésumé\r\n",
      });
      const resaved = await save("draft.txt", "saved again", changed.mtime);
      await expect(
        workspaceFs.writeFile(saved, "draft.txt", "compatible", {
          expected_mtime: resaved.mtime,
        })
      ).resolves.toMatchObject({ mtime: expect.any(Number) });
      await expect(save("draft.txt", "forced")).resolves.toMatchObject({
        mtime: expect.any(Number),
      });
      expect(await fs.readFile(draft, "utf8")).toBe("forced");

      await fs.writeFile(bin, Buffer.from([0x41, 0, 0x42]));
      await expect(read("binary.txt", "text")).rejects.toThrow("file-not-utf8");
      await expect(read("binary.txt", "bytes")).resolves.toMatchObject({
        base64: "QQBC",
        size: 3,
      });
      await fs.writeFile(path.join(project, "empty.txt"), "");
      await expect(read("empty.txt", "text")).resolves.toMatchObject({
        content: "",
      });
      await fs.writeFile(medium, "");
      await fs.truncate(medium, 1024 * 1024 + 1);
      await expect(read("medium.bin", "text")).rejects.toThrow(
        "file-too-large"
      );
      await expect(read("medium.bin", "bytes")).resolves.toMatchObject({
        size: 1024 * 1024 + 1,
      });
      await fs.writeFile(large, "");
      await fs.truncate(large, 8 * 1024 * 1024 + 1);
      await expect(read("large.bin", "text")).rejects.toThrow("file-too-large");
      await expect(read("large.bin", "bytes")).rejects.toThrow(
        "file-too-large"
      );
      await fs.writeFile(outside, "must not be read");
      await fs.symlink(outside, path.join(project, "escape.txt"));
      await expect(read("../outside.txt", "text")).rejects.toThrow(
        "path-escapes-workspace"
      );
      await expect(read("escape.txt", "text")).rejects.toThrow(
        /workspace_path_outside_root|path_authority_unavailable/
      );
      await fs.mkdir(path.join(project, ".git"));
      await fs.mkdir(path.join(project, "decks"));
      await fs.writeFile(
        path.join(project, "decks", "draft.canvas"),
        "fixture"
      );
      await fs.writeFile(path.join(project, ".DS_Store"), "not listed");
      await fs.writeFile(path.join(project, ".gitignore"), "kept");
      await fs.symlink(
        path.join(project, "decks"),
        path.join(project, "alias")
      );
      const outsideDirectory = path.join(root, "unregistered-directory");
      await fs.mkdir(outsideDirectory);
      await fs.symlink(outsideDirectory, path.join(project, "outside-dir"));
      const expected = await workspaceFs.readDir(saved, "");
      expect(expected[0]).toMatchObject({ name: "decks", kind: "directory" });
      expect(expected).toContainEqual({
        name: "outside-dir",
        kind: "symlink",
        rel_path: "outside-dir",
      });
      expect(expected.map((entry) => entry.name)).toContain(".gitignore");
      expect(expected.map((entry) => entry.name)).not.toContain(".DS_Store");
      await expect(list("")).resolves.toEqual(expected);
      await expect(list(".")).resolves.toEqual(expected);
      await expect(list("alias")).resolves.toEqual([
        { name: "draft.canvas", kind: "file", rel_path: "alias/draft.canvas" },
      ]);
      await expect(list("draft.txt")).rejects.toThrow("not-a-directory");
      await expect(list("outside-dir")).rejects.toThrow(
        /workspace_path_outside_root|path_authority_unavailable/
      );
      await save("alias/new/deep.txt", "contained");
      expect(
        await fs.readFile(path.join(project, "decks/new/deep.txt"), "utf8")
      ).toBe("contained");
      expect(
        (await fs.stat(path.join(project, "decks/new/deep.txt"))).mode & 0o777
      ).toBe(0o644 & ~process.umask());
      await expect(save("outside-dir/escaped.txt", "denied")).rejects.toThrow(
        /workspace_path_outside_root|path_authority_unavailable/
      );
      await expect(save("escape.txt", "denied")).rejects.toThrow("not-a-file");
      expect(
        (await fs.lstat(path.join(project, "escape.txt"))).isSymbolicLink()
      ).toBe(true);
      expect(await fs.readdir(outsideDirectory)).toEqual([]);
      expect(await fs.readFile(outside, "utf8")).toBe("must not be read");
      const largerThanReadCap = "a".repeat(1024 * 1024 + 9);
      await save("large-authored.txt", largerThanReadCap);
      expect(
        (await fs.stat(path.join(project, "large-authored.txt"))).size
      ).toBe(largerThanReadCap.length);
      await expect(
        save("too-large.txt", "a".repeat(64 * 1024 * 1024 + 1))
      ).rejects.toThrow("workspace_write_limit");

      // Revocation after the worker exits with bytes still prevents publication.
      const fileGrant = vi.fn<NativeWorkspaceCatalog["fileGrant"]>((id) =>
        catalog.fileGrant(id)
      );
      fileGrant.mockImplementationOnce((id) => catalog.fileGrant(id));
      fileGrant.mockImplementationOnce(async (id) => {
        await catalog.forget(id);
        return await catalog.fileGrant(id);
      });
      const duringForget = new NativeWorkspaceReads({ fileGrant }, workers);
      await expect(
        duringForget.read(saved.id, "draft.txt", "text", signal)
      ).rejects.toThrow("workspace_not_registered");
      expect(fileGrant).toHaveBeenCalledTimes(2);
      expect(launch.compatibility).not.toHaveBeenCalled();
    } finally {
      workers.close();
      launch.workers = undefined;
      await fs.rm(root, { recursive: true, force: true });
    }
  },
  30_000
);
