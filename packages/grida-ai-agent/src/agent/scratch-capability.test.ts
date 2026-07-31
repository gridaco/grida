/**
 * Scratch capability injection (WG `scratch.md` S1: the agent is *told* its
 * scratch location). Pins the gating in `buildCapabilityHints`: the
 * host-provisioned `scratch_dir` advertises the exact root independently of
 * command execution, so structured filesystem reach remains discoverable when
 * the fail-closed host posture withholds the shell.
 */
import { describe, expect, it } from "vitest";
import { AgentFs } from "../fs";
import { buildCapabilityHints, type CreateAgentOptions } from "./index";

const NOOP_BACKEND: NonNullable<
  CreateAgentOptions["command"]
>["backend"] = async () => ({
  stdout: "",
  stderr: "",
  exit_code: 0,
  timed_out: false,
  truncated: false,
});

const SCRATCH = "/tmp/grida-agent/sessions/ses_x/scratch";

/** The single scratch hint in a hints array, or undefined. */
function scratchHint(hints: string[]): string | undefined {
  return hints.find((h) => h.includes('<capability name="scratch">'));
}

const modelFactory: CreateAgentOptions["model_factory"] = () => {
  throw new Error("model is never built in these pure-hint tests");
};

describe("buildCapabilityHints — scratch", () => {
  it("advertises structured-fs scratch without exposing command execution (S1)", () => {
    const hints = buildCapabilityHints({
      model_factory: modelFactory,
      fs: new AgentFs(new AgentFs.MemoryBackend()),
      scratch_dir: SCRATCH,
    });
    const hint = scratchHint(hints);
    expect(hint).toBeDefined();
    expect(hint).toContain(SCRATCH);
    expect(hint!.toLowerCase()).toContain("filesystem");
    expect(hint).not.toContain("run_command");
    expect(hints.some((h) => h.includes('<capability name="command">'))).toBe(
      false
    );
    // The promotion + ephemerality guidance is the load-bearing part of S2.
    expect(hint!.toLowerCase()).toContain("ephemeral");
    expect(hint!.toLowerCase()).toContain("promote");
  });

  it("keeps the command-carried path as a compatibility fallback", () => {
    const hints = buildCapabilityHints({
      model_factory: modelFactory,
      command: {
        backend: NOOP_BACKEND,
        default_workdir: "/work",
        scratch_dir: SCRATCH,
      },
    });
    const hint = scratchHint(hints);
    expect(hint).toContain(SCRATCH);
    expect(hint).toContain("run_command");
    expect(hint!.toLowerCase()).not.toContain("filesystem tools");
  });

  it("omits the scratch hint when no root was provisioned", () => {
    const hints = buildCapabilityHints({
      model_factory: modelFactory,
      command: { backend: NOOP_BACKEND, default_workdir: "/work" },
    });
    expect(scratchHint(hints)).toBeUndefined();
    // The command hint itself is still present — only scratch is gated off.
    expect(hints.some((h) => h.includes('<capability name="command">'))).toBe(
      true
    );
  });

  it("omits the scratch hint when neither scratch nor command is present", () => {
    const hints = buildCapabilityHints({ model_factory: modelFactory });
    expect(scratchHint(hints)).toBeUndefined();
  });
});
