// GRIDA-SEC-004 — disposable Main-owned registry and guarded file transport.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createMediaDaemon } from "@grida/agent/media-server";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";
import { WorkspaceWriteUnverified } from "./workspace-file-worker";

it.runIf(process.platform !== "win32")(
  "admits a root deck only through its committed physical directory",
  async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-root-deck-"))
    );
    const browserData = path.join(root, "browser");
    const project = path.join(root, "selected");
    const bundle = path.join(root, "Empty.CANVAS");
    const marker = path.join(project, ".canvas.json");
    try {
      for (const directory of [browserData, project, bundle])
        await fs.mkdir(directory, { mode: 0o700 });
      const catalog = new NativeWorkspaceCatalog({
        browserData,
        projectsRoot: path.join(root, "projects"),
        protectedPaths: [],
      });
      const selected = await catalog.openSelected(project);
      const empty = await catalog.openSelected(bundle);
      await expect(catalog.rootDeck(selected.id)).rejects.toThrow(
        "workspace_not_registered"
      );
      await expect(catalog.rootDeck(empty.id)).resolves.toMatchObject({
        root: bundle,
      });
      await fs.symlink(path.join(bundle, ".canvas.json"), marker);
      await expect(catalog.rootDeck(selected.id)).rejects.toThrow(
        "workspace_not_registered"
      );
      await fs.unlink(marker);
      await fs.writeFile(marker, "{}");
      const original = await catalog.rootDeck(selected.id);
      await fs.writeFile(marker + ".save", "{}");
      await fs.rename(marker + ".save", marker);
      await expect(catalog.rootDeck(selected.id)).resolves.toEqual(original);

      await fs.rename(project, project + "-previous");
      await fs.mkdir(project, { mode: 0o700 });
      await fs.writeFile(marker, "{}");
      await expect(catalog.rootDeck(selected.id)).rejects.toThrow(
        "workspace_not_registered"
      );
      const reselected = await catalog.openSelected(project);
      expect(reselected.id).toBe(selected.id);
      expect((await catalog.rootDeck(reselected.id)).identity).not.toEqual(
        original.identity
      );
      await catalog.forget(reselected.id);
      await expect(catalog.rootDeck(reselected.id)).rejects.toThrow(
        "workspace_not_registered"
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);

it.runIf(process.platform !== "win32")(
  "admits an exact canonical nested bundle and rotates its scope on replacement",
  async () => {
    const base = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-nested-deck-"))
    );
    const browserData = path.join(base, "browser");
    const parent = path.join(base, "selected");
    const nested = path.join(parent, "decks", "Launch.Canvas");
    const sibling = path.join(parent, "decks", "Sibling.canvas");
    const external = path.join(base, "outside.canvas");
    const marker = path.join(nested, ".canvas.json");
    const options = {
      browserData,
      projectsRoot: path.join(base, "projects"),
      protectedPaths: [external],
    };
    try {
      for (const directory of [browserData, nested, sibling, external])
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const catalog = new NativeWorkspaceCatalog(options);
      const selected = await catalog.openSelected(parent);
      const relative = "decks/Launch.Canvas";
      const original = await catalog.nestedDeck(selected.id, relative);
      expect(original).toMatchObject({
        root: nested,
        parentWorkspaceId: selected.id,
      });
      expect(original.workspaceId).not.toBe(selected.id);
      const firstSibling = await catalog.nestedDeck(
        selected.id,
        "decks/Sibling.canvas"
      );
      expect(firstSibling.workspaceId).not.toBe(original.workspaceId);
      await expect(
        new NativeWorkspaceCatalog(options).nestedDeck(selected.id, relative)
      ).resolves.toEqual(original);
      await fs.writeFile(marker, "{}");
      await fs.writeFile(marker + ".save", "{}");
      await fs.rename(marker + ".save", marker);
      await expect(catalog.nestedDeck(selected.id, relative)).resolves.toEqual(
        original
      );
      await fs.unlink(marker);
      await fs.symlink(path.join(external, ".canvas.json"), marker);
      await fs.symlink(external, path.join(parent, "External.canvas"));
      await fs.symlink(path.join(parent, "decks"), path.join(parent, "alias"));
      await fs.writeFile(path.join(parent, "File.canvas"), "{}");
      for (const invalid of [
        relative,
        "External.canvas",
        "File.canvas",
        "alias/Sibling.canvas",
        "../outside.canvas",
        "/outside.canvas",
        "decks//Sibling.canvas",
        "decks/./Sibling.canvas",
        "decks/Sibling.canvas/",
        "decks",
        "decks\\Sibling.canvas",
      ])
        await expect(catalog.nestedDeck(selected.id, invalid)).rejects.toThrow(
          "workspace_not_registered"
        );
      await fs.unlink(marker);
      await fs.link(path.join(parent, "File.canvas"), marker);
      await expect(catalog.nestedDeck(selected.id, relative)).rejects.toThrow(
        "workspace_not_registered"
      );

      await fs.rename(nested, nested + "-previous");
      await fs.mkdir(nested, { mode: 0o700 });
      const replacement = await catalog.nestedDeck(selected.id, relative);
      expect(replacement.workspaceId).not.toBe(original.workspaceId);
      await expect(
        catalog.nestedDeck(selected.id, "decks/Sibling.canvas")
      ).resolves.toEqual(firstSibling);
      const previousParent = parent + "-previous";
      await fs.rename(parent, previousParent);
      await fs.mkdir(path.dirname(nested), { recursive: true, mode: 0o700 });
      await fs.rename(path.join(previousParent, relative), nested);
      await expect(catalog.nestedDeck(selected.id, relative)).rejects.toThrow(
        "workspace_not_registered"
      );
      await catalog.openSelected(parent);
      const reselected = await catalog.nestedDeck(selected.id, relative);
      expect(reselected.identity).toEqual(replacement.identity);
      expect(reselected.workspaceId).not.toBe(replacement.workspaceId);
      await catalog.forget(selected.id);
      await expect(catalog.nestedDeck(selected.id, relative)).rejects.toThrow(
        "workspace_not_registered"
      );
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  }
);

it.runIf(process.platform !== "win32")(
  "keeps external scratch reserved and preserves registration when external cleanup is unverified",
  async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-workspace-external-"))
    );
    const browserData = path.join(root, "browser");
    const project = path.join(root, "project");
    const protectedRoot = path.join(root, "custody");
    const scratch = path.join(root, ".grida-external-scratch");
    try {
      for (const directory of [browserData, project, protectedRoot])
        await fs.mkdir(directory, { mode: 0o700 });
      const options = {
        browserData,
        projectsRoot: path.join(root, "projects"),
        protectedPaths: [protectedRoot],
      };
      const catalog = new NativeWorkspaceCatalog(options);
      const selected = await catalog.openSelected(project);
      let checkScratch: (() => Promise<unknown>) | undefined;
      const open = () =>
        catalog.openExternalRuns(async (access) => {
          const grant = await access.workspace(selected.id);
          expect(grant.protected).toContain(protectedRoot);
          expect(grant.protected).not.toContain(scratch);
          checkScratch = () => access.workspace(selected.id);
          return {
            selection: { workspaceId: selected.id, name: "Reviewed peer" },
            close: async () => {
              // The closing owner may be waiting for its final grant check.
              await access.workspace(selected.id);
              throw new Error("external_cleanup_unverified");
            },
          };
        });
      await fs.symlink(protectedRoot, scratch);
      await expect(open()).rejects.toThrow(
        "native_external_workspace_scope_unavailable"
      );
      await fs.unlink(scratch);
      await open();
      await expect(catalog.forget(selected.id)).rejects.toThrow(
        "external_cleanup_unverified"
      );
      expect(await catalog.find(selected.id)).toEqual(selected);
      await fs.rename(scratch, scratch + "-old");
      await fs.mkdir(scratch, { mode: 0o700 });
      await expect(checkScratch!()).rejects.toThrow(
        "native_external_workspace_scope_unavailable"
      );
      const restarted = new NativeWorkspaceCatalog(options);
      await expect(restarted.openSelected(scratch)).rejects.toThrow(
        "workspace_media_root_denied"
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);

it.runIf(process.platform !== "win32")(
  "holds Forget until an admitted save has drained",
  async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-workspace-save-forget-"))
    );
    const browserData = path.join(root, "browser");
    const project = path.join(root, "project");
    try {
      for (const directory of [browserData, project])
        await fs.mkdir(directory, { mode: 0o700 });
      const catalog = new NativeWorkspaceCatalog({
        browserData,
        projectsRoot: path.join(root, "projects"),
        protectedPaths: [],
      });
      const selected = await catalog.openSelected(project);
      const started = Promise.withResolvers<void>();
      const done = Promise.withResolvers<void>();
      const events: string[] = [];
      const save = catalog.withWriteGrant(selected.id, async () => {
        started.resolve();
        await done.promise;
        events.push("saved");
      });
      await started.promise;
      const forgotten = catalog.forget(selected.id).then(() => {
        events.push("forgotten");
      });
      done.resolve();
      await Promise.all([save, forgotten]);
      expect(events).toEqual(["saved", "forgotten"]);
      expect(await catalog.find(selected.id)).toBeNull();

      await catalog.openSelected(project);
      const exit = Promise.withResolvers<{ code: number | null }>();
      await expect(
        catalog.withWriteGrant(selected.id, async () => {
          throw new WorkspaceWriteUnverified(exit.promise);
        })
      ).rejects.toThrow("workspace_write_unverified");
      await expect(catalog.forget(selected.id)).rejects.toThrow(
        "workspace_write_unverified"
      );
      expect(await catalog.find(selected.id)).toMatchObject({ root: project });
      exit.resolve({ code: null });
      await catalog.forget(selected.id);
      expect(await catalog.find(selected.id)).toBeNull();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);

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
