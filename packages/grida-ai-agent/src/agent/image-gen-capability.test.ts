/**
 * Image-generation capability injection (WG `scratch.md` S3: produced files
 * sink to scratch). Pins the gating in `buildCapabilityHints`: the hint is
 * emitted only when an image generator AND a scratch path are wired — the same
 * conditions under which the generator binding is built. With either missing,
 * the hint is absent (and so is the tool).
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

const FAKE_GENERATOR: NonNullable<CreateAgentOptions["image_gen"]> = {
  async generate() {
    throw new Error("generator is never called in these pure-hint tests");
  },
};

const modelFactory: CreateAgentOptions["model_factory"] = () => {
  throw new Error("model is never built in these pure-hint tests");
};

function imageGenHint(hints: string[]): string | undefined {
  return hints.find((h) => h.includes('<capability name="image-generation">'));
}

describe("buildCapabilityHints — image generation", () => {
  it("advertises generate_image when a generator and scratch path are wired", () => {
    const hints = buildCapabilityHints({
      model_factory: modelFactory,
      image_gen: FAKE_GENERATOR,
      command: {
        backend: NOOP_BACKEND,
        default_workdir: "/work",
        scratch_dir: SCRATCH,
      },
    });
    const hint = imageGenHint(hints);
    expect(hint).toBeDefined();
    expect(hint).toContain("generate_image");
    expect(hint).toContain(SCRATCH);
    // Honest contract: ephemeral scratch + keep-by-copying, and NO claim that
    // the model can see the produced image (it's a producer, not a perceiver).
    expect(hint!.toLowerCase()).toContain("ephemeral");
    expect(hint!.toLowerCase()).toContain("does not show you");
  });

  it("omits the hint when no generator is wired (no provider key)", () => {
    const hints = buildCapabilityHints({
      model_factory: modelFactory,
      command: {
        backend: NOOP_BACKEND,
        default_workdir: "/work",
        scratch_dir: SCRATCH,
      },
    });
    expect(imageGenHint(hints)).toBeUndefined();
  });

  it("omits the hint when there is a generator but no scratch sink", () => {
    const hints = buildCapabilityHints({
      model_factory: modelFactory,
      image_gen: FAKE_GENERATOR,
      command: { backend: NOOP_BACKEND, default_workdir: "/work" },
    });
    expect(imageGenHint(hints)).toBeUndefined();
  });
});
