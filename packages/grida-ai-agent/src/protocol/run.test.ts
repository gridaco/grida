import { describe, expect, it } from "vitest";
import { SCRATCH_SEED_LIMITS as publicLimits } from "../index";
import { SCRATCH_SEED_LIMITS as protocolLimits } from "./run";

describe("scratch_seed protocol limits", () => {
  it("exports one immutable canonical limit object from the neutral entrypoint", () => {
    expect(publicLimits).toBe(protocolLimits);
    expect(publicLimits).toEqual({
      maxFiles: 64,
      maxTotalBytes: 8 * 1024 * 1024,
    });
    expect(Object.isFrozen(publicLimits)).toBe(true);
  });
});
