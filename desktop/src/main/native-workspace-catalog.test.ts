// GRIDA-SEC-004 — disposable Main-owned registry and guarded file transport.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createMediaDaemon } from "@grida/agent/media-server";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";

it.runIf(process.platform !== "win32")(
  "opens only trusted or already registered folders and shares the current scope with file routes",
  async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-workspace-catalog-"))
    );
    const browserData = path.join(root, "browser");
    const workspace = path.join(root, "workspace");
    const other = path.join(root, "other");
    const userData = path.join(root, "agent");
    for (const directory of [browserData, workspace, other, userData])
      await fs.mkdir(directory, { mode: 0o700 });
    const options = {
      browserData,
      projectsRoot: path.join(root, "projects"),
      protectedPaths: [userData],
    };
    const catalog = new NativeWorkspaceCatalog(options);
    const origin = "https://editor.fixture.invalid";
    const password = "workspace-catalog-fixture-password";
    const daemon = createMediaDaemon({
      password,
      user_data_path: userData,
      workspace_catalog: catalog.directory,
      http_access: {
        allowed_origins: [origin],
        allowed_referer_paths: ["/desktop"],
      },
      capabilities: { workspaces: false },
    });
    const post = (route: string, body: object) =>
      daemon.fetch(
        new Request(`http://127.0.0.1/workspaces/${route}`, {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`agent:${password}`).toString("base64")}`,
            origin,
            referer: `${origin}/desktop/workspace`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        })
      );
    try {
      await catalog.initialize();
      await expect(catalog.reopen(other)).rejects.toThrow(
        "workspace_not_registered"
      );
      await expect(catalog.openSelected(userData)).rejects.toThrow(
        "workspace_media_root_denied"
      );
      const projects = await catalog.list();
      expect(projects).toEqual([
        expect.objectContaining({
          is_default: true,
          root: options.projectsRoot,
        }),
      ]);
      const made = await catalog.create("Sketch");
      expect(made.root).toBe(path.join(options.projectsRoot, "Sketch"));
      expect(await fs.readdir(made.root)).toEqual([]);
      await daemon.start({ listen: false });
      for (const route of ["list", "open", "create", "forget", "pin"]) {
        expect((await post(route, { path: other })).status).toBe(404);
      }
      const selected = await catalog.openSelected(workspace);
      expect(await catalog.reopen(workspace)).toMatchObject({
        id: selected.id,
      });
      await catalog.pin(selected.id, true);
      expect(await catalog.list()).toContainEqual(
        expect.objectContaining({ id: selected.id, pinned: true })
      );
      const file = path.join(workspace, "draft.txt");
      const bytes = Buffer.from("\uFEFForiginal");
      await fs.writeFile(file, bytes);
      const target = { workspace_id: selected.id, rel_path: "draft.txt" };
      const read = await post("readfile", target);
      expect(read.status).toBe(200);
      const text = (await read.json()) as { content: string; mtime: number };
      expect(text.content).toBe("original");
      const binary = await post("readfilebytes", target);
      expect(await binary.json()).toEqual({
        base64: bytes.toString("base64"),
        size: bytes.length,
        mtime: text.mtime,
      });
      const listing = await post("readdir", { workspace_id: selected.id });
      expect(await listing.json()).toEqual([
        { kind: "file", name: "draft.txt", rel_path: "draft.txt" },
      ]);
      const changed = await post("writefile", {
        ...target,
        content: "edited",
        expected_mtime: text.mtime,
      });
      expect(changed.status).toBe(200);
      expect(await fs.readFile(file, "utf8")).toBe("edited");
      expect(
        (
          await post("writefile", {
            ...target,
            content: "stale",
            expected_mtime: 0,
          })
        ).status
      ).toBe(409);
      expect(await fs.readFile(file, "utf8")).toBe("edited");
      expect(
        (await post("readfile", { ...target, rel_path: "../elsewhere" })).status
      ).toBe(403);
      const renamed = path.join(root, "renamed-workspace");
      await fs.rename(workspace, renamed);
      await fs.mkdir(workspace, { mode: 0o700 });
      expect(await catalog.find(selected.id)).toBeNull();
      expect((await post("readfile", target)).status).toBe(404);
      const restarted = new NativeWorkspaceCatalog(options);
      expect(await restarted.find(selected.id)).toBeNull();
      await expect(restarted.reopen(workspace)).rejects.toThrow(
        "workspace_not_registered"
      );
      const rebound = await restarted.openSelected(workspace);
      expect(rebound.id).toBe(selected.id);
      expect(rebound).not.toHaveProperty("directory_identity");
      expect(await restarted.find(rebound.id)).toEqual(rebound);
      await fs.writeFile(file, "new file");
      expect((await post("readfile", target)).status).toBe(200);
      await restarted.forget(selected.id);
      expect((await post("readfile", target)).status).toBe(404);
      expect(await fs.readFile(file, "utf8")).toBe("new file");
      expect(await fs.readFile(path.join(renamed, "draft.txt"), "utf8")).toBe(
        "edited"
      );
      expect(await fs.readdir(userData)).not.toContain("workspaces.json");

      const reopened = new NativeWorkspaceCatalog(options);
      expect(await reopened.find(selected.id)).toBeNull();
      expect(await reopened.find(made.id)).toMatchObject({ root: made.root });
      expect(await reopened.list()).toContainEqual(
        expect.objectContaining({ is_default: true })
      );
    } finally {
      await daemon.stop();
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);
