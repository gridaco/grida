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

it.runIf(
  Boolean(resources) &&
    process.platform === "darwin" &&
    process.arch === "arm64"
)(
  "reads editor files without a sidecar and preserves the fractional write precondition",
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
      await expect(
        workspaceFs.writeFile(saved, "draft.txt", "edited", {
          expected_mtime: text.mtime,
        })
      ).resolves.toMatchObject({ mtime: expect.any(Number) });
      await expect(
        workspaceFs.writeFile(saved, "draft.txt", "stale", {
          expected_mtime: text.mtime,
        })
      ).rejects.toThrow("modified-since");
      await expect(read("draft.txt", "text")).resolves.toMatchObject({
        content: "edited",
      });

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
