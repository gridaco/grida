import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DesktopAgentSandboxPolicy } from "./agent-sandbox-policy";
import { AgentCommandHost } from "./agent-command-host";
import { dispose, ensureInitialized } from "./sandbox/manager";

const describeMacOS = process.platform === "darwin" ? describe : describe.skip;

/**
 * GRIDA-SEC-004 attack regression.
 *
 * Unit policy assertions prove what main asks SRT to enforce. This test proves
 * the resulting Seatbelt process cannot recover a sibling session's bytes,
 * including through an interpreter that computes the path at runtime.
 */
describeMacOS("AgentCommandHost per-command SRT boundary", () => {
  let root: string;
  let userData: string;
  let mediaRoot: string;
  let scratchBase: string;
  let workspace: string;
  let scratchA: string;
  let scratchB: string;
  let host: AgentCommandHost;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-command-srt-"));
    userData = path.join(root, "user-data");
    mediaRoot = path.join(root, "media");
    scratchBase = path.join(root, "scratch-authority");
    workspace = path.join(root, "workspace");
    scratchA = path.join(scratchBase, "sessions", "ses_A", "scratch");
    scratchB = path.join(scratchBase, "sessions", "ses_B", "scratch");
    await Promise.all(
      [userData, mediaRoot, workspace, scratchA, scratchB].map((dir) =>
        fs.mkdir(dir, { recursive: true })
      )
    );
    await fs.writeFile(path.join(scratchA, "own.txt"), "session-a");
    await fs.writeFile(path.join(scratchB, "private.txt"), "session-b-secret");
    await fs.writeFile(path.join(userData, "auth.json"), "host-secret");
    await fs.writeFile(path.join(mediaRoot, "model.glb"), "media-private");

    const policy = DesktopAgentSandboxPolicy.build({
      userData,
      mediaRoot,
      home: os.homedir(),
      ggHost: "grida.co",
    });
    await ensureInitialized({
      network: {
        allowedDomains: policy.network.allowed_domains,
        deniedDomains: policy.network.denied_domains,
        allowLocalBinding: policy.network.allow_local_binding,
      },
      filesystem: {
        denyRead: policy.filesystem.deny_read,
        allowRead: policy.filesystem.allow_read,
        allowWrite: policy.filesystem.allow_write,
        denyWrite: policy.filesystem.deny_write,
      },
    });
    host = new AgentCommandHost({
      scratchBase,
      userData,
      mediaRoot,
      home: os.homedir(),
      filesystemPolicy: policy.filesystem,
    });
  });

  afterEach(async () => {
    await dispose();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("allows its own scratch but denies sibling reads and writes", async () => {
    const scope = {
      workspace_root: workspace,
      scratch_root: scratchA,
      scratch_base: scratchBase,
      protected_read_roots: [userData],
    };

    const own = await host.shellExecutor(
      {
        cmd: "cp",
        args: ["own.txt", "own-copy.txt"],
        cwd: scratchA,
      },
      scope
    );
    expect(own.exit_code).toBe(0);
    await expect(
      fs.readFile(path.join(scratchA, "own-copy.txt"), "utf8")
    ).resolves.toBe("session-a");

    const readAttack = await host.shellExecutor(
      {
        cmd: process.execPath,
        args: [
          "-e",
          "process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))",
          path.join(scratchB, "private.txt"),
        ],
        cwd: workspace,
      },
      scope
    );
    expect(readAttack.exit_code).not.toBe(0);
    expect(readAttack.stdout).not.toContain("session-b-secret");

    const computedSecretAttack = await host.shellExecutor(
      {
        cmd: process.execPath,
        args: [
          "-e",
          `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(path.join(userData, "auth.json"))}, 'utf8'))`,
        ],
        cwd: workspace,
      },
      scope
    );
    expect(computedSecretAttack.exit_code).not.toBe(0);
    expect(computedSecretAttack.stdout).not.toContain("host-secret");

    const mediaReadAttack = await host.shellExecutor(
      {
        cmd: process.execPath,
        args: [
          "-e",
          `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(path.join(mediaRoot, "model.glb"))}, 'utf8'))`,
        ],
        cwd: workspace,
      },
      scope
    );
    expect(mediaReadAttack.exit_code).not.toBe(0);
    expect(mediaReadAttack.stdout).not.toContain("media-private");

    const writeAttack = await host.shellExecutor(
      {
        cmd: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], 'overwritten')",
          path.join(scratchB, "private.txt"),
        ],
        cwd: workspace,
      },
      scope
    );
    expect(writeAttack.exit_code).not.toBe(0);
    await expect(
      fs.readFile(path.join(scratchB, "private.txt"), "utf8")
    ).resolves.toBe("session-b-secret");

    const mediaWriteAttack = await host.shellExecutor(
      {
        cmd: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], 'overwritten')",
          path.join(mediaRoot, "model.glb"),
        ],
        cwd: workspace,
      },
      scope
    );
    expect(mediaWriteAttack.exit_code).not.toBe(0);
    await expect(
      fs.readFile(path.join(mediaRoot, "model.glb"), "utf8")
    ).resolves.toBe("media-private");
  });

  it("kills a background descendant before releasing its SRT profile", async () => {
    const scope = {
      workspace_root: workspace,
      scratch_root: scratchA,
      scratch_base: scratchBase,
      protected_read_roots: [userData],
    };
    const result = await host.shellExecutor(
      {
        cmd: "/bin/sh",
        args: [
          "-c",
          "(sleep 0.4; printf escaped > late-write.txt) >/dev/null 2>&1 &",
        ],
        cwd: workspace,
      },
      scope
    );

    expect(result.exit_code).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 650));
    await expect(
      fs.stat(path.join(workspace, "late-write.txt"))
    ).rejects.toThrow(/ENOENT/);
  });
});
