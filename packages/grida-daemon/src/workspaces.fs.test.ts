/* eslint-disable jest/no-standalone-expect */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createDaemonFixture, type DaemonFixture } from "./test/daemon-fixture";
import { workspaceFs } from "./workspaces/fs";

const symlinkIt = process.platform === "win32" ? it.skip : it;

describe("workspaceFs", () => {
  let fixture: DaemonFixture;

  beforeEach(async () => {
    fixture = await createDaemonFixture("grida-agent-workspace-");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fixture.cleanup();
  });

  it("readDir lists immediate workspace children from disk", async () => {
    await fixture.write_workspace_file("zeta.txt", "z");
    await fixture.write_workspace_file("notes/a.md", "a");

    const entries = await workspaceFs.readDir(fixture.workspace, "");

    expect(entries).toEqual([
      { name: "notes", rel_path: "notes", kind: "directory" },
      { name: "zeta.txt", rel_path: "zeta.txt", kind: "file" },
    ]);
  });

  it("iterateDir stops OS enumeration and closes the handle on early return", async () => {
    for (let index = 0; index < 20; index += 1) {
      await fixture.write_workspace_file(`entry-${index}.txt`, String(index));
    }

    const opendir = vi.spyOn(fs, "opendir");
    const iterator = workspaceFs.iterateDir(fixture.workspace, "");
    try {
      await expect(iterator.next()).resolves.toMatchObject({ done: false });
      expect(opendir).toHaveBeenCalledTimes(1);
      const dir = await opendir.mock.results[0].value;
      const read = vi.spyOn(dir, "read");
      const close = vi.spyOn(dir, "close");

      await expect(iterator.next()).resolves.toMatchObject({ done: false });
      await expect(iterator.next()).resolves.toMatchObject({ done: false });
      expect(read).toHaveBeenCalledTimes(2);

      await iterator.return(undefined);
      expect(close).toHaveBeenCalledTimes(1);
      await expect(dir.read()).rejects.toMatchObject({
        code: "ERR_DIR_CLOSED",
      });
    } finally {
      await iterator.return(undefined);
    }
  });

  it("iterateDir applies containment and ENOTDIR translation before yielding", async () => {
    await fixture.write_workspace_file("file.txt", "text");
    const consume = async (relPath: string) => {
      for await (const _entry of workspaceFs.iterateDir(
        fixture.workspace,
        relPath
      )) {
        // The failing paths below never yield.
      }
    };

    await expect(consume("../")).rejects.toMatchObject({
      detail: { code: "path-escapes-workspace" },
    });
    await expect(consume("file.txt")).rejects.toMatchObject({
      detail: { code: "not-a-directory" },
    });
  });

  it("readFile returns text contents inside the workspace", async () => {
    await fixture.write_workspace_file("notes/a.md", "hello");

    await expect(
      workspaceFs.readFile(fixture.workspace, "notes/a.md")
    ).resolves.toMatchObject({
      content: "hello",
    });
  });

  it("readDir rejects paths that escape the workspace", async () => {
    await expect(
      workspaceFs.readDir(fixture.workspace, "../")
    ).rejects.toBeInstanceOf(workspaceFs.Exception);
  });

  symlinkIt("readFile rejects symlinks that leave the workspace", async () => {
    const outside = path.join(fixture.base_dir, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "secret.txt"), "secret");
    await fs.symlink(
      outside,
      path.join(fixture.workspace_root, "outside-link")
    );

    await expect(
      workspaceFs.readFile(fixture.workspace, "outside-link/secret.txt")
    ).rejects.toMatchObject({
      detail: { code: "path-escapes-workspace" },
    });
  });

  symlinkIt("writeFile rejects symlinked parent directories", async () => {
    const outside = path.join(fixture.base_dir, "outside");
    await fs.mkdir(outside);
    await fs.symlink(
      outside,
      path.join(fixture.workspace_root, "outside-link")
    );

    await expect(
      workspaceFs.writeFile(fixture.workspace, "outside-link/new.txt", "secret")
    ).rejects.toMatchObject({
      detail: { code: "path-escapes-workspace" },
    });
    await expect(
      fs.access(path.join(outside, "new.txt"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  describe("writeFile optimistic-concurrency guard (issue #805)", () => {
    it("writes without a precondition (last-writer-wins)", async () => {
      const res = await workspaceFs.writeFile(
        fixture.workspace,
        "a.svg",
        "<svg/>"
      );
      expect(typeof res.mtime).toBe("number");
    });

    it("accepts a write when expected_mtime matches disk", async () => {
      const first = await workspaceFs.writeFile(
        fixture.workspace,
        "a.svg",
        "<svg/>"
      );
      await workspaceFs.writeFile(fixture.workspace, "a.svg", "<svg id='2'/>", {
        expected_mtime: first.mtime,
      });
      const { content } = await workspaceFs.readFile(
        fixture.workspace,
        "a.svg"
      );
      expect(content).toBe("<svg id='2'/>");
    });

    it("rejects a stale write with modified-since carrying the disk mtime", async () => {
      const first = await workspaceFs.writeFile(
        fixture.workspace,
        "a.svg",
        "<svg/>"
      );
      await expect(
        workspaceFs.writeFile(fixture.workspace, "a.svg", "clobber", {
          // a token older than disk → disk has "advanced" past it
          expected_mtime: first.mtime - 1000,
        })
      ).rejects.toMatchObject({
        detail: { code: "modified-since", mtime: first.mtime },
      });
      // the write was refused — disk content is untouched
      const { content } = await workspaceFs.readFile(
        fixture.workspace,
        "a.svg"
      );
      expect(content).toBe("<svg/>");
    });

    it("treats a deleted-on-disk file as a conflict when expected_mtime is set", async () => {
      const first = await workspaceFs.writeFile(
        fixture.workspace,
        "a.svg",
        "<svg/>"
      );
      await fs.rm(path.join(fixture.workspace_root, "a.svg"));
      await expect(
        workspaceFs.writeFile(fixture.workspace, "a.svg", "resurrect", {
          expected_mtime: first.mtime,
        })
      ).rejects.toMatchObject({ detail: { code: "modified-since" } });
      // not silently recreated under the old name
      await expect(
        fs.access(path.join(fixture.workspace_root, "a.svg"))
      ).rejects.toMatchObject({ code: "ENOENT" });
    });
  });
});
