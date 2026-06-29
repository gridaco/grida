/**
 * Scratch capability injection (WG `scratch.md` S1: the agent is *told* its
 * scratch location). Pins the gating in `buildCapabilityHints`: when a command
 * binding carries a `scratch_dir`, a scratch hint is emitted advertising the
 * path; with no scratch_dir (or no command at all) the hint is absent. Scratch
 * reach rides the shell, so the hint is coupled to the command capability.
 */
import { describe, expect, it } from "vitest";
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
  it("advertises the scratch path when the command binding carries scratch_dir (S1)", () => {
    const hints = buildCapabilityHints({
      model_factory: modelFactory,
      command: {
        backend: NOOP_BACKEND,
        default_workdir: "/work",
        scratch_dir: SCRATCH,
      },
    });
    const hint = scratchHint(hints);
    expect(hint).toBeDefined();
    expect(hint).toContain(SCRATCH);
    // The promotion + ephemerality guidance is the load-bearing part of S2.
    expect(hint!.toLowerCase()).toContain("ephemeral");
    expect(hint!.toLowerCase()).toContain("promote");
  });

  it("omits the scratch hint when the command binding has no scratch_dir", () => {
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

  it("omits the scratch hint when there is no command capability at all", () => {
    const hints = buildCapabilityHints({ model_factory: modelFactory });
    expect(scratchHint(hints)).toBeUndefined();
  });
});
