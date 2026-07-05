/* eslint-disable jest/no-standalone-expect, vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { AgentFs } from "../fs";
import { AGENT_DEFAULT_TIER } from "../tiers";
import {
  createDaemonFixture,
  type DaemonFixture,
} from "../test/daemon-fixture";
import { runAgent, type AgentStepUsage } from "./run-agent";
import {
  createWorkspaceAgentBindings,
  WorkspaceAgentFsBackend,
} from "./workspace-agent-bindings";

const symlinkIt = process.platform === "win32" ? it.skip : it;

describe("agent workspace bindings", () => {
  let fixture: DaemonFixture;

  beforeEach(async () => {
    fixture = await createDaemonFixture("grida-agent-agent-");
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("hydrates AgentFs from the workspace before list_files runs", async () => {
    await fixture.write_workspace_file("canvas.svg", "<svg/>");
    await fixture.write_workspace_file("notes/brief.md", "hello");

    const bindings = await createWorkspaceAgentBindings(
      {
        workspace_root: fixture.workspace_root,
      },
      { workspace_registry: fixture.registry }
    );

    expect(bindings).not.toBeNull();
    const output = AgentFs.resolveToolCall(bindings!.fs, {
      tool_name: AgentFs.TOOL_NAMES.list_files,
      input: {},
    });

    expect(output).toEqual({
      files: ["/canvas.svg", "/notes/brief.md"],
    });
  });

  it("GRIDA-SEC-004: withholds the command capability unless shell execution is allowed (fail-closed)", async () => {
    await fixture.write_workspace_file("canvas.svg", "<svg/>");

    // Default (no shell_execution_allowed) — fs + todos, but NO command.
    const denied = await createWorkspaceAgentBindings(
      { workspace_root: fixture.workspace_root },
      { workspace_registry: fixture.registry }
    );
    expect(denied).not.toBeNull();
    expect(denied!.fs).toBeDefined();
    expect(denied!.command).toBeUndefined();

    // Explicit opt-in — command capability is wired.
    const allowed = await createWorkspaceAgentBindings(
      { workspace_root: fixture.workspace_root },
      { workspace_registry: fixture.registry, shell_execution_allowed: true }
    );
    expect(allowed!.command).toBeDefined();
    expect(allowed!.command!.default_workdir).toBe(fixture.workspace_root);
  });

  symlinkIt(
    "does not hydrate files reached through outside-workspace symlinks",
    async () => {
      const outside = path.join(fixture.base_dir, "outside");
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, "secret.txt"), "secret");
      await fs.symlink(
        outside,
        path.join(fixture.workspace_root, "outside-link")
      );
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const bindings = await createWorkspaceAgentBindings(
          {
            workspace_root: fixture.workspace_root,
          },
          { workspace_registry: fixture.registry }
        );

        expect(bindings).not.toBeNull();
        expect(bindings!.fs.read("/outside-link/secret.txt")).toBeNull();
      } finally {
        warn.mockRestore();
      }
    }
  );

  symlinkIt(
    "rejects direct backend writes through symlinked parents",
    async () => {
      const outside = path.join(fixture.base_dir, "outside");
      await fs.mkdir(outside);
      await fs.symlink(
        outside,
        path.join(fixture.workspace_root, "outside-link")
      );
      const backend = new WorkspaceAgentFsBackend(fixture.workspace);

      await expect(
        backend.write("/outside-link/new.txt", "secret")
      ).rejects.toMatchObject({
        detail: { code: "path-escapes-workspace" },
      });
      await expect(
        fs.access(path.join(outside, "new.txt"))
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  );

  it("runs a resolved BYOK provider through the local workspace-bound agent path", async () => {
    await fixture.write_workspace_file("canvas.svg", "<svg/>");
    const modelFactory = vi.fn(
      () =>
        new MockLanguageModelV3({
          provider: "openrouter",
          modelId: "openai/gpt-5.4-nano",
          doStream: {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                { type: "text-start", id: "t" },
                { type: "text-delta", id: "t", delta: "ok" },
                { type: "text-end", id: "t" },
                {
                  type: "finish",
                  finishReason: { unified: "stop", raw: "stop" },
                  usage: {
                    inputTokens: {
                      total: 1,
                      noCache: 1,
                      cacheRead: undefined,
                      cacheWrite: undefined,
                    },
                    outputTokens: {
                      total: 1,
                      text: 1,
                      reasoning: undefined,
                    },
                  },
                },
              ],
            }),
          },
        })
    );

    const response = await runAgent(
      {
        provider_id: "openrouter",
        kind: "byok",
        model_factory: modelFactory,
      },
      {
        messages: [
          {
            id: "m",
            role: "user",
            parts: [{ type: "text", text: "list files" }],
          },
        ] as never,
        tier: AGENT_DEFAULT_TIER,
        signal: new AbortController().signal,
        workspace_root: fixture.workspace_root,
      },
      { workspace_registry: fixture.registry }
    );

    expect(response.status).toBe(200);
    expect(modelFactory).toHaveBeenCalled();
  });

  it("forwards camelCase SDK step usage to on_step_usage as snake_case (regression: usage was silently zeroed)", async () => {
    await fixture.write_workspace_file("canvas.svg", "<svg/>");
    const modelFactory = vi.fn(
      () =>
        new MockLanguageModelV3({
          provider: "openrouter",
          modelId: "openai/gpt-5.4-nano",
          doStream: {
            stream: simulateReadableStream({
              chunks: [
                { type: "stream-start", warnings: [] },
                { type: "text-start", id: "t" },
                { type: "text-delta", id: "t", delta: "ok" },
                { type: "text-end", id: "t" },
                {
                  type: "finish",
                  finishReason: { unified: "stop", raw: "stop" },
                  usage: {
                    inputTokens: {
                      total: 7,
                      noCache: 7,
                      cacheRead: undefined,
                      cacheWrite: undefined,
                    },
                    outputTokens: { total: 3, text: 3, reasoning: undefined },
                  },
                },
              ],
            }),
          },
        })
    );

    const usages: AgentStepUsage[] = [];
    const response = await runAgent(
      {
        provider_id: "openrouter",
        kind: "byok",
        model_factory: modelFactory,
      },
      {
        messages: [
          { id: "m", role: "user", parts: [{ type: "text", text: "hi" }] },
        ] as never,
        tier: AGENT_DEFAULT_TIER,
        signal: new AbortController().signal,
        workspace_root: fixture.workspace_root,
        on_step_usage: (u) => usages.push(u),
      },
      { workspace_registry: fixture.registry }
    );

    // Drain the SSE stream so the step completes, onStepFinish fires, and the
    // finish message-metadata is emitted.
    const body = await response.text();

    // 1) on_step_usage hook receives snake_case values (DB rollup path).
    expect(usages.length).toBeGreaterThan(0);
    const last = usages.at(-1)!;
    // Pre-fix, the bare cast left these undefined (camelCase keys never read).
    expect(last.input_tokens).toBe(7);
    expect(last.output_tokens).toBe(3);

    // 2) The stream carries usage as message metadata (live context-meter
    //    path) — `input` is cache-normalized: 7 input − 0 cache_read = 7.
    expect(body).toContain('"usage"');
    expect(body).toMatch(/"input":7/);
    expect(body).toMatch(/"output":3/);
  });
});
