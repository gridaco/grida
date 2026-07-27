import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onboarding_state } from "./onboarding-state";

describe("onboarding_state", () => {
  let userDataPath: string;

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-onboarding-state-")
    );
  });

  afterEach(async () => {
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  it("is incomplete before the first-run flow finishes", async () => {
    await expect(onboarding_state.isComplete(userDataPath)).resolves.toBe(
      false
    );
  });

  it("persists completion across reads", async () => {
    await onboarding_state.markComplete(userDataPath);

    await expect(onboarding_state.isComplete(userDataPath)).resolves.toBe(true);
  });

  it("fails closed for malformed or stale state", async () => {
    await fs.writeFile(
      path.join(userDataPath, "onboarding.json"),
      JSON.stringify({ version: 0, completed: true })
    );

    await expect(onboarding_state.isComplete(userDataPath)).resolves.toBe(
      false
    );
  });
});
