import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeAgentArtifactSave } from "./native-agent-artifact-save";

it("checks current scope after staging and does not leave a partial export", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "grida-save-"));
  try {
    const destination = path.join(directory, "crop.png");
    const bytes = Uint8Array.of(1, 2, 3).buffer;
    const requireCurrent = vi.fn<() => void>().mockImplementation(() => {
      throw new Error("scope_changed");
    });
    requireCurrent.mockImplementationOnce(() => {});
    await expect(
      NativeAgentArtifactSave.publish(destination, bytes, requireCurrent)
    ).rejects.toThrow("scope_changed");
    expect(requireCurrent).toHaveBeenCalledTimes(2);
    expect(await fs.readdir(directory)).toEqual([]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
