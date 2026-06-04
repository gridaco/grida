/* eslint-disable jest/no-standalone-expect */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createAgentHostFixture,
  type AgentHostFixture,
} from "./test/agent-host-fixture";
import { workspaceFs } from "./workspaces/fs";

const symlinkIt = process.platform === "win32" ? it.skip : it;

describe("workspaceFs", () => {
  let fixture: AgentHostFixture;

  beforeEach(async () => {
    fixture = await createAgentHostFixture("grida-agent-workspace-");
  });

  afterEach(async () => {
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
});
