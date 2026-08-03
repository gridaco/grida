import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ShellExecutionScope,
  ShellRunRequest,
  ShellRunResult,
} from "@grida/daemon/server";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import { AgentCommandHost, sweepAgentCommandTemps } from "./agent-command-host";

describe("AgentCommandHost", () => {
  let root: string;
  let userData: string;
  let mediaRoot: string;
  let scratchBase: string;
  let workspaceA: string;
  let workspaceB: string;
  let scratchA: string;
  let scratchB: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-command-host-"));
    userData = path.join(root, "userdata");
    mediaRoot = path.join(root, "media");
    scratchBase = path.join(root, "scratch-base");
    workspaceA = path.join(root, "workspace-a");
    workspaceB = path.join(root, "workspace-b");
    scratchA = path.join(scratchBase, "sessions", "ses_A", "scratch");
    scratchB = path.join(scratchBase, "sessions", "ses_B", "scratch");
    await Promise.all(
      [userData, mediaRoot, workspaceA, workspaceB, scratchA, scratchB].map(
        (dir) => fs.mkdir(dir, { recursive: true })
      )
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("wraps a command with only its exact workspace and scratch grants", async () => {
    let policy: Partial<SandboxRuntimeConfig> | undefined;
    const wrap = vi.fn<
      (
        command: string,
        customConfig: Partial<SandboxRuntimeConfig>
      ) => Promise<{ argv: string[]; env: NodeJS.ProcessEnv }>
    >(async (_command: string, customConfig: Partial<SandboxRuntimeConfig>) => {
      policy = customConfig;
      return { argv: ["/wrapped", "--profile"], env: {} };
    });
    const run = vi.fn<(request: ShellRunRequest) => Promise<ShellRunResult>>(
      async (request: ShellRunRequest): Promise<ShellRunResult> => ({
        cmd: request.cmd,
        args: request.args,
        cwd: request.cwd,
        exit_code: 0,
        signal: null,
        stdout: "ok",
        stderr: "",
        duration_ms: 1,
        timed_out: false,
        truncated: false,
      })
    );
    const host = commandHost({ wrap, run });

    const result = await host.shellExecutor(
      {
        cmd: "cp",
        args: ["input.png", "copy.png"],
        cwd: scratchA,
      },
      scopeA()
    );

    expect(result).toMatchObject({
      cmd: "cp",
      args: ["input.png", "copy.png"],
      cwd: await fs.realpath(scratchA),
      stdout: "ok",
    });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: "/wrapped",
        args: ["--profile"],
        cwd: await fs.realpath(scratchA),
      }),
      { signal: undefined }
    );
    expect(policy?.network).toMatchObject({
      allowedDomains: [],
      allowLocalBinding: false,
    });
    expect(policy?.filesystem?.denyRead).toContain(
      await fs.realpath(scratchBase)
    );
    expect(policy?.filesystem?.allowRead).toEqual(
      expect.arrayContaining([await fs.realpath(scratchA)])
    );
    expect(policy?.filesystem?.allowRead).not.toContain(
      await fs.realpath(workspaceA)
    );
    expect(policy?.filesystem?.allowRead).not.toContain(
      await fs.realpath(scratchB)
    );
    expect(policy?.filesystem?.allowWrite).not.toContain(
      await fs.realpath(workspaceB)
    );
    expect(policy?.filesystem?.denyRead).toContain(
      await fs.realpath(mediaRoot)
    );
    expect(policy?.filesystem?.denyWrite).toContain(
      await fs.realpath(mediaRoot)
    );
    expect(policy?.filesystem?.allowRead).not.toContain(
      await fs.realpath(mediaRoot)
    );
    expect(policy?.filesystem?.allowWrite).not.toContain(
      await fs.realpath(mediaRoot)
    );
  });

  it("refuses a cwd in another registered session workspace", async () => {
    const host = commandHost();

    await expect(
      host.shellExecutor({ cmd: "pwd", args: [], cwd: workspaceB }, scopeA())
    ).rejects.toThrow(/outside its session-bound roots/);
  });

  it("refuses a scratch grant outside the host-owned session tree", async () => {
    const host = commandHost();
    const outsideScratch = path.join(
      root,
      "other-scratch-base",
      "sessions",
      "ses_B",
      "scratch"
    );
    await fs.mkdir(outsideScratch, { recursive: true });

    await expect(
      host.shellExecutor(
        { cmd: "pwd", args: [], cwd: outsideScratch },
        { ...scopeA(), scratch_root: outsideScratch }
      )
    ).rejects.toThrow(/invalid session scratch root/);
  });

  it("refuses a workspace whose write grant would cover the scratch base", async () => {
    const nestedScratchBase = path.join(workspaceA, "scratch-authority");
    await fs.mkdir(nestedScratchBase, { recursive: true });
    const host = commandHost({ scratchBase: nestedScratchBase });

    await expect(
      host.shellExecutor(
        { cmd: "true", args: [], cwd: workspaceA },
        {
          workspace_root: workspaceA,
          scratch_base: nestedScratchBase,
          protected_read_roots: [userData],
        }
      )
    ).rejects.toThrow(/overlaps the scratch authority root/);
  });

  it("refuses a workspace whose grant would overlap the media library", async () => {
    const nestedWorkspace = path.join(mediaRoot, "workspace");
    await fs.mkdir(nestedWorkspace);
    const host = commandHost();

    await expect(
      host.shellExecutor(
        { cmd: "true", args: [], cwd: nestedWorkspace },
        {
          workspace_root: nestedWorkspace,
          protected_read_roots: [userData],
        }
      )
    ).rejects.toThrow(/overlaps the media library root/);
  });

  it("does not re-allow a workspace through a protected read root", async () => {
    const protectedWorkspace = path.join(root, ".ssh", "workspace");
    await fs.mkdir(protectedWorkspace, { recursive: true });
    let policy: Partial<SandboxRuntimeConfig> | undefined;
    const host = commandHost({
      wrap: async (_command, customConfig) => {
        policy = customConfig;
        return { argv: ["/wrapped"], env: {} };
      },
    });

    await host.shellExecutor(
      { cmd: "pwd", args: [], cwd: protectedWorkspace },
      {
        workspace_root: protectedWorkspace,
        protected_read_roots: [userData],
      }
    );

    expect(policy?.filesystem?.denyRead).toContain(path.join(root, ".ssh"));
    expect(policy?.filesystem?.allowRead).not.toContain(
      await fs.realpath(protectedWorkspace)
    );
    expect(policy?.filesystem?.allowWrite).toContain(
      await fs.realpath(protectedWorkspace)
    );
  });

  it("does not double-clean SRT state when wrapping fails", async () => {
    const cleanup = vi.fn<() => void>();
    const host = commandHost({
      wrap: async () => {
        throw new Error("wrap failed");
      },
      cleanup,
    });

    await expect(
      host.shellExecutor({ cmd: "pwd", args: [], cwd: workspaceA }, scopeA())
    ).rejects.toThrow("wrap failed");
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("sweeps command-temp remnants left by a prior crash", async () => {
    const remnant = path.join(scratchBase, "commands", "cmd-old");
    await fs.mkdir(remnant, { recursive: true });
    await fs.writeFile(path.join(remnant, "payload.bin"), "bytes");

    await sweepAgentCommandTemps(scratchBase);

    await expect(fs.lstat(path.join(scratchBase, "commands"))).rejects.toThrow(
      /ENOENT/
    );
  });

  it("unlinks a command-temp symlink without deleting its target", async () => {
    if (process.platform === "win32") return;
    const target = path.join(root, "command-target");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "keep.txt"), "keep");
    await fs.symlink(target, path.join(scratchBase, "commands"));

    await sweepAgentCommandTemps(scratchBase);

    await expect(
      fs.readFile(path.join(target, "keep.txt"), "utf8")
    ).resolves.toBe("keep");
    await expect(fs.lstat(path.join(scratchBase, "commands"))).rejects.toThrow(
      /ENOENT/
    );
  });

  function scopeA(): ShellExecutionScope {
    return {
      workspace_root: workspaceA,
      scratch_root: scratchA,
      scratch_base: scratchBase,
      protected_read_roots: [userData],
    };
  }

  function commandHost(
    overrides: Partial<ConstructorParameters<typeof AgentCommandHost>[0]> = {}
  ): AgentCommandHost {
    return new AgentCommandHost({
      scratchBase,
      userData,
      mediaRoot,
      home: root,
      filesystemPolicy: {
        deny_read: [path.join(root, ".ssh")],
        deny_write: [path.join(root, ".ssh")],
      },
      wrap: async () => ({ argv: ["/wrapped"], env: {} }),
      run: async (request) => ({
        cmd: request.cmd,
        args: request.args,
        cwd: request.cwd,
        exit_code: 0,
        signal: null,
        stdout: "",
        stderr: "",
        duration_ms: 1,
        timed_out: false,
        truncated: false,
      }),
      ...overrides,
    });
  }
});
